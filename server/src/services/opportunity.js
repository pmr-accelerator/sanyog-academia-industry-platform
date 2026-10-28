import prisma from '../db.js';
import { AppError, badRequest, forbidden, notFound } from '../utils/errors.js';
import { OPP_INCLUDE, loadStudentSnapshot, evaluateAll, toEngineOpp } from './eligibility.js';
import { evaluateEligibility, readinessPlan } from '../eligibility/engine.js';
import { notifyMany } from './notify.js';
import { audit } from './audit.js';
import { refreshOpportunityApplications } from './application.js';

export function activePartnershipWhere(organizationId, institutionId) {
  const now = new Date();
  return { organizationId, institutionId, status: 'ACTIVE', AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validUntil: null }, { validUntil: { gte: now } }] }] };
}

// actor = { kind: 'org', user, org } | { kind: 'college', user, membership }
async function resolveTargets(actor, d) {
  if (actor.kind === 'college') {
    if (!(actor.membership.canManagePartnerships || actor.membership.isPlacementOfficer)) throw forbidden('Your role cannot publish vacancies');
    if (d.organizationId && !(await prisma.partnership.findFirst({ where: activePartnershipWhere(d.organizationId, actor.membership.institutionId) }))) throw badRequest('That organization has no active partnership with your institution');
    return [actor.membership.institutionId];
  }
  if (actor.org.status !== 'VERIFIED') throw forbidden('Your organization has not been verified yet');
  const ids = d.targetInstitutionIds || [];
  for (const instId of ids) {
    if (!(await prisma.partnership.findFirst({ where: activePartnershipWhere(actor.org.id, instId) }))) throw badRequest('You need an active partnership with every selected institution');
  }
  return ids;
}
async function checkSkills(requirements = []) {
  const ids = requirements.map((r) => r.skillId);
  if (new Set(ids).size !== ids.length) throw badRequest('Each skill can be listed only once');
  if (ids.length && (await prisma.skill.count({ where: { id: { in: ids } } })) !== ids.length) throw badRequest('Unknown skill in requirements');
}

const scalarFields = ['type', 'title', 'description', 'location', 'workMode', 'compensationDisclosed', 'compensationMin', 'compensationMax', 'compensationPeriod', 'openings', 'deadline', 'startDate', 'minCgpa', 'minPercentage', 'allowedDisciplines', 'allowedDegrees', 'allowedGraduationYears', 'minAcademicYear', 'maxActiveBacklogs', 'minExperienceMonths', 'requireVerifiedProfile', 'additionalRequirements', 'selectionCriteria'];
const pick = (d) => Object.fromEntries(scalarFields.filter((k) => d[k] !== undefined).map((k) => [k, d[k]]));

export async function create(actor, d) {
  await checkSkills(d.requirements);
  const targets = await resolveTargets(actor, d);
  if (d.publish && (!targets.length || new Date(d.deadline) <= new Date())) throw badRequest('Publishing needs at least one target institution and a future deadline');
  if (d.compensationDisclosed && d.compensationMin && d.compensationMax && d.compensationMin > d.compensationMax) throw badRequest('Minimum compensation cannot exceed the maximum');
  const opp = await prisma.opportunity.create({
    data: {
      ...pick(d), status: d.publish ? 'PUBLISHED' : 'DRAFT', publishedAt: d.publish ? new Date() : null, createdById: actor.user.id,
      organizationId: actor.kind === 'org' ? actor.org.id : d.organizationId || null,
      postedByInstitutionId: actor.kind === 'college' ? actor.membership.institutionId : null,
      requirements: { create: (d.requirements || []).map((r) => ({ skillId: r.skillId, minProficiency: r.minProficiency, isMandatory: r.isMandatory, weight: r.weight })) },
      institutions: { create: targets.map((institutionId) => ({ institutionId })) },
    },
  });
  await audit(null, { actorId: actor.user.id, action: 'opportunity.create', entityType: 'Opportunity', entityId: opp.id, metadata: { published: Boolean(d.publish) } });
  if (d.publish) await alertEligibleStudents(opp.id);
  return opp;
}

export async function loadOwned(actor, id) {
  const o = await prisma.opportunity.findUnique({ where: { id }, include: OPP_INCLUDE });
  if (!o) throw notFound();
  const mine = actor.kind === 'org' ? o.organizationId === actor.org.id : o.postedByInstitutionId === actor.membership.institutionId;
  if (!mine) throw notFound(); // do not reveal that it exists
  return o;
}

export async function update(actor, id, d) {
  const o = await loadOwned(actor, id);
  if (['CLOSED', 'CANCELLED'].includes(o.status)) throw badRequest('Closed opportunities cannot be edited');
  if (d.requirements) await checkSkills(d.requirements);
  const targets = d.targetInstitutionIds || d.requirements || actor.kind === 'college' ? await resolveTargets(actor, { ...d, organizationId: d.organizationId ?? o.organizationId, targetInstitutionIds: d.targetInstitutionIds || o.institutions.map((i) => i.institutionId) }) : null;
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({ where: { id }, data: pick(d) });
    if (d.requirements) { await tx.opportunityRequirement.deleteMany({ where: { opportunityId: id } }); await tx.opportunityRequirement.createMany({ data: d.requirements.map((r) => ({ opportunityId: id, skillId: r.skillId, minProficiency: r.minProficiency, isMandatory: r.isMandatory, weight: r.weight })) }); }
    if (d.targetInstitutionIds && actor.kind === 'org' && targets) { await tx.opportunityInstitution.deleteMany({ where: { opportunityId: id } }); await tx.opportunityInstitution.createMany({ data: targets.map((institutionId) => ({ opportunityId: id, institutionId })) }); }
  });
  // Criteria may have changed: recompute eligibility of live applications.
  if (o.status === 'PUBLISHED') await refreshOpportunityApplications(id);
  await audit(null, { actorId: actor.user.id, action: 'opportunity.update', entityType: 'Opportunity', entityId: id });
  return prisma.opportunity.findUnique({ where: { id }, include: OPP_INCLUDE });
}

export async function publish(actor, id) {
  const o = await loadOwned(actor, id);
  if (o.status !== 'DRAFT') throw badRequest('Only drafts can be published');
  if (o.deadline <= new Date()) throw badRequest('The deadline must be in the future');
  if (!o.institutions.length) throw badRequest('Select at least one target institution');
  await resolveTargets(actor, { organizationId: o.organizationId, targetInstitutionIds: o.institutions.map((i) => i.institutionId) });
  await prisma.opportunity.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
  await audit(null, { actorId: actor.user.id, action: 'opportunity.publish', entityType: 'Opportunity', entityId: id });
  await alertEligibleStudents(id);
  return { status: 'PUBLISHED' };
}
export async function close(actor, id) {
  const o = await loadOwned(actor, id);
  if (o.status !== 'PUBLISHED') throw badRequest('Only published opportunities can be closed');
  await prisma.opportunity.update({ where: { id }, data: { status: 'CLOSED' } });
  return { status: 'CLOSED' };
}

// Smart alerts: tell students who are eligible (or may be, pending review) about a new opportunity.
export async function alertEligibleStudents(oppId) {
  const opp = await prisma.opportunity.findUnique({ where: { id: oppId }, include: OPP_INCLUDE });
  const targetIds = opp.institutions.map((i) => i.institutionId);
  const students = await prisma.studentProfile.findMany({ where: { institutionId: { in: targetIds }, registrationStatus: 'VERIFIED', user: { status: 'ACTIVE' } }, select: { id: true, userId: true }, take: 500 });
  const hits = [];
  for (const s of students) {
    const snap = await loadStudentSnapshot(s.id);
    const ev = evaluateEligibility(snap.snapshot, toEngineOpp(opp), snap.institutionRules);
    if (ev.result !== 'NOT_ELIGIBLE') hits.push(s.userId);
  }
  for (const uid of hits) await notifyMany([uid], { type: 'OPPORTUNITY_ALERT', title: 'New opportunity you may qualify for', body: `${opp.title} — apply before ${opp.deadline.toDateString()}.`, linkPath: `/student/opportunities/${opp.id}`, dedupeKey: `opp-new:${opp.id}:${uid}` });
  return hits.length;
}

// ── Reads ────────────────────────────────────────────────────────────────────
const publicSelect = (o) => ({
  id: o.id, type: o.type, title: o.title, description: o.description, location: o.location, workMode: o.workMode, deadline: o.deadline, openings: o.openings,
  compensation: o.compensationDisclosed ? { min: o.compensationMin, max: o.compensationMax, period: o.compensationPeriod } : null,
  organization: o.organization && o.organization.status === 'VERIFIED' ? { name: o.organization.displayName, industry: o.organization.industry } : null,
  postedByInstitution: o.postedBy?.name || null, skills: o.requirements.map((r) => ({ name: r.skill.name, level: r.minProficiency, mandatory: r.isMandatory })),
  allowedDisciplines: o.allowedDisciplines, minAcademicYear: o.minAcademicYear,
});

function filters(q) {
  const w = { status: 'PUBLISHED', deadline: { gt: new Date() } };
  if (q.type) w.type = q.type;
  if (q.q) w.OR = [{ title: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }];
  if (q.location) w.location = { contains: q.location, mode: 'insensitive' };
  if (q.skill) w.requirements = { some: { skill: { name: { contains: q.skill, mode: 'insensitive' } } } };
  return w;
}

export async function listPublic(q, page) {
  const where = filters(q);
  const [total, rows] = await Promise.all([prisma.opportunity.count({ where }), prisma.opportunity.findMany({ where, include: OPP_INCLUDE, orderBy: { deadline: 'asc' }, skip: page.skip, take: page.take })]);
  return { total, rows: rows.map(publicSelect) };
}
export async function getPublic(id) {
  const o = await prisma.opportunity.findFirst({ where: { id, status: 'PUBLISHED' }, include: OPP_INCLUDE });
  if (!o) throw notFound();
  return { ...publicSelect(o), additionalRequirements: o.additionalRequirements, selectionCriteria: o.selectionCriteria };
}

const ORDER = { ELIGIBLE: 0, REQUIRES_REVIEW: 1, NOT_ELIGIBLE: 2 };

export async function listForStudent(student, q, page) {
  const where = { ...filters(q), institutions: { some: { institutionId: student.institutionId } } };
  const rows = await prisma.opportunity.findMany({ where, include: OPP_INCLUDE, orderBy: { deadline: 'asc' }, take: 300 });
  const snap = await loadStudentSnapshot(student.id);
  const applied = new Set((await prisma.application.findMany({ where: { studentId: student.id }, select: { opportunityId: true } })).map((a) => a.opportunityId));
  const saved = new Set((await prisma.savedOpportunity.findMany({ where: { studentId: student.id }, select: { opportunityId: true } })).map((a) => a.opportunityId));
  let items = [];
  for (const o of rows) {
    const ev = await evaluateAll(snap.snapshot, snap.institutionRules, o);
    items.push({ ...publicSelect(o), eligibility: ev.result, matchScore: ev.match.score, topMissing: ev.missing.filter((c) => c.blocking).slice(0, 2).map((c) => c.detail), applied: applied.has(o.id), saved: saved.has(o.id) });
  }
  if (q.eligibility) items = items.filter((i) => i.eligibility === q.eligibility);
  if (q.saved === 'true') items = items.filter((i) => i.saved);
  items.sort((a, b) => ORDER[a.eligibility] - ORDER[b.eligibility] || (b.matchScore ?? -1) - (a.matchScore ?? -1));
  return { total: items.length, rows: items.slice(page.skip, page.skip + page.take) };
}

async function studentOpp(student, id) {
  const o = await prisma.opportunity.findFirst({ where: { id, status: { in: ['PUBLISHED', 'CLOSED'] }, institutions: { some: { institutionId: student.institutionId } } }, include: OPP_INCLUDE });
  if (!o) throw notFound();
  return o;
}
export async function studentDetail(student, id) {
  const o = await studentOpp(student, id);
  const snap = await loadStudentSnapshot(student.id);
  const ev = await evaluateAll(snap.snapshot, snap.institutionRules, o);
  const app = await prisma.application.findUnique({ where: { opportunityId_studentId: { opportunityId: id, studentId: student.id } }, select: { id: true, status: true } });
  return { ...publicSelect(o), additionalRequirements: o.additionalRequirements, selectionCriteria: o.selectionCriteria, status: o.status, eligibility: ev.result, checks: ev.checks, matchScore: ev.match.score, matchFactors: ev.match.factors, readiness: readinessPlan(ev), application: app };
}
// Opportunity Readiness Simulator: "what if I had these skills?" (hypothetical, never saved)
export async function simulate(student, id, addSkills = []) {
  const o = await studentOpp(student, id);
  const snap = await loadStudentSnapshot(student.id);
  const names = new Map((await prisma.skill.findMany({ where: { id: { in: addSkills.map((s) => s.skillId) } } })).map((s) => [s.id, s.name]));
  const skills = new Map(snap.snapshot.skills.map((s) => [s.skillId, s]));
  for (const a of addSkills) skills.set(a.skillId, { skillId: a.skillId, name: names.get(a.skillId) || 'Skill', proficiency: a.proficiency, verified: true });
  const ev = await evaluateAll({ ...snap.snapshot, skills: [...skills.values()] }, snap.institutionRules, o);
  return { hypothetical: true, note: 'Simulation only. Nothing was saved, and hypothetical skills count as verified in this view.', eligibility: ev.result, checks: ev.checks, matchScore: ev.match.score };
}
export async function toggleSave(student, id) {
  await studentOpp(student, id);
  const key = { studentId_opportunityId: { studentId: student.id, opportunityId: id } };
  const ex = await prisma.savedOpportunity.findUnique({ where: key });
  if (ex) await prisma.savedOpportunity.delete({ where: key }); else await prisma.savedOpportunity.create({ data: { studentId: student.id, opportunityId: id } });
  return { saved: !ex };
}

export async function listOwn(actor, q, page) {
  const where = actor.kind === 'org' ? { organizationId: actor.org.id } : { postedByInstitutionId: actor.membership.institutionId };
  if (q.status) where.status = q.status;
  const [total, rows] = await Promise.all([prisma.opportunity.count({ where }), prisma.opportunity.findMany({ where, include: { ...OPP_INCLUDE, _count: { select: { applications: true, referrals: true } } }, orderBy: { createdAt: 'desc' }, skip: page.skip, take: page.take })]);
  return { total, rows };
}

// Alumni: opportunities that target the alumnus' own institution.
export async function listForAlumni(alumni, q, page) {
  const where = { ...filters(q), institutions: { some: { institutionId: alumni.institutionId } } };
  const [total, rows] = await Promise.all([prisma.opportunity.count({ where }), prisma.opportunity.findMany({ where, include: OPP_INCLUDE, orderBy: { deadline: 'asc' }, skip: page.skip, take: page.take })]);
  return { total, rows: rows.map(publicSelect) };
}

export async function skillDemand(limit = 15) {
  const rows = await prisma.opportunityRequirement.groupBy({ by: ['skillId'], where: { opportunity: { status: 'PUBLISHED' } }, _count: { skillId: true }, orderBy: { _count: { skillId: 'desc' } }, take: limit });
  const skills = await prisma.skill.findMany({ where: { id: { in: rows.map((r) => r.skillId) } } });
  return rows.map((r) => ({ skill: skills.find((s) => s.id === r.skillId)?.name, demand: r._count.skillId }));
}
export { AppError };
