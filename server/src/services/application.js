import prisma from '../db.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { OPP_INCLUDE, loadStudentSnapshot, evaluateAll } from './eligibility.js';
import { notify, notifyMany } from './notify.js';
import { audit } from './audit.js';

const SHARE_FIELDS = ['academics', 'skills', 'projects', 'certifications', 'contact', 'resume'];
const OPEN = ['SUBMITTED', 'SHORTLISTED', 'INTERVIEW_SCHEDULED'];
const TERMINAL = ['REJECTED', 'WITHDRAWN', 'OFFER_ACCEPTED', 'OFFER_DECLINED'];
const MANAGE = {
  SUBMITTED: ['SHORTLISTED', 'REJECTED'],
  SHORTLISTED: ['INTERVIEW_SCHEDULED', 'SELECTED', 'REJECTED'],
  INTERVIEW_SCHEDULED: ['INTERVIEW_SCHEDULED', 'SHORTLISTED', 'SELECTED', 'REJECTED'],
  SELECTED: ['REJECTED'],
};
export const SHARE_FIELD_LIST = SHARE_FIELDS;

async function orgMemberIds(orgId) {
  return (await prisma.organizationMember.findMany({ where: { organizationId: orgId }, select: { userId: true } })).map((m) => m.userId);
}
async function recordEvent(tx, applicationId, from, to, actorId, note) {
  await tx.applicationStatusEvent.create({ data: { applicationId, fromStatus: from, toStatus: to, actorId, note } });
}
// Keep a referral's status in step with its application.
async function syncReferral(tx, applicationId, status) {
  const map = { SHORTLISTED: 'SHORTLISTED', INTERVIEW_SCHEDULED: 'SHORTLISTED', SELECTED: 'SHORTLISTED', OFFER_ACCEPTED: 'HIRED', REJECTED: 'NOT_SELECTED', OFFER_DECLINED: 'NOT_SELECTED', WITHDRAWN: 'WITHDRAWN' };
  if (map[status]) await tx.referral.updateMany({ where: { applicationId }, data: { status: map[status] } });
}

// Create an application. Used by students applying directly AND by recruiters accepting a referral.
export async function createApplication({ student, opportunityId, coverNote, shareFields, actorId }) {
  const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId }, include: OPP_INCLUDE });
  if (!opp || opp.status !== 'PUBLISHED') throw badRequest('This opportunity is not open');
  if (opp.deadline <= new Date()) throw badRequest('The application deadline has passed');
  if (!opp.institutions.some((i) => i.institutionId === student.institutionId)) throw forbidden('This opportunity is not open to your institution');
  if (opp.organizationId) {
    const { activePartnershipWhere } = await import('./opportunity.js');
    if (!(await prisma.partnership.findFirst({ where: activePartnershipWhere(opp.organizationId, student.institutionId) }))) throw badRequest('The partnership for this opportunity is no longer active');
  }
  const snap = await loadStudentSnapshot(student.id);
  const ev = await evaluateAll(snap.snapshot, snap.institutionRules, opp);
  if (ev.result === 'NOT_ELIGIBLE') throw new AppError(422, 'NOT_ELIGIBLE', 'You do not meet the requirements for this opportunity', { checks: ev.checks });
  const fields = [...new Set((shareFields || ['academics', 'skills']).filter((f) => SHARE_FIELDS.includes(f)))];
  let app;
  try {
    app = await prisma.$transaction(async (tx) => {
      const a = await tx.application.create({ data: { opportunityId, studentId: student.id, eligibility: ev.result, eligibilitySnapshot: { checks: ev.checks, evaluatedAt: new Date().toISOString() }, matchScore: ev.match.score, coverNote } });
      await recordEvent(tx, a.id, null, 'SUBMITTED', actorId, null);
      await tx.consentGrant.create({ data: { studentId: student.id, scope: 'RECRUITER_PROFILE_VIEW', granteeOrganizationId: opp.organizationId, opportunityId, fields } });
      return a;
    });
  } catch (e) {
    if (e.code === 'P2002') throw conflict('You have already applied to this opportunity');
    throw e;
  }
  if (opp.organizationId) await notifyMany(await orgMemberIds(opp.organizationId), { type: 'APPLICATION', title: 'New application', body: `A candidate applied for ${opp.title}.`, linkPath: `/industry/applicants/${app.id}` });
  return app;
}
export async function apply(student, opportunityId, d) {
  const app = await createApplication({ student, opportunityId, coverNote: d.coverNote, shareFields: d.shareFields, actorId: student.userId });
  await notify(student.userId, { type: 'APPLICATION', title: 'Application submitted', body: 'Your application was sent.', linkPath: '/student/applications' });
  return app;
}

export async function withdraw(student, id) {
  const a = await prisma.application.findUnique({ where: { id } });
  if (!a || a.studentId !== student.id) throw notFound();
  if (!OPEN.includes(a.status) && a.status !== 'SELECTED') throw conflict('This application can no longer be withdrawn');
  await prisma.$transaction(async (tx) => { await tx.application.update({ where: { id }, data: { status: 'WITHDRAWN' } }); await recordEvent(tx, id, a.status, 'WITHDRAWN', student.userId, null); await syncReferral(tx, id, 'WITHDRAWN'); });
  return { status: 'WITHDRAWN' };
}

export async function listForStudent(student) {
  return prisma.application.findMany({
    where: { studentId: student.id }, orderBy: { appliedAt: 'desc' },
    include: { opportunity: { select: { id: true, title: true, type: true, deadline: true, organization: { select: { displayName: true } }, postedBy: { select: { name: true } } } }, interviews: { orderBy: { scheduledAt: 'asc' } }, offer: true, statusEvents: { orderBy: { createdAt: 'asc' } } },
  });
}

export async function respondOffer(student, id, accept) {
  const a = await prisma.application.findUnique({ where: { id }, include: { offer: true, opportunity: true } });
  if (!a || a.studentId !== student.id) throw notFound();
  if (a.status !== 'OFFER_MADE' || a.offer?.status !== 'ISSUED') throw conflict('There is no open offer to respond to');
  const to = accept ? 'OFFER_ACCEPTED' : 'OFFER_DECLINED';
  await prisma.$transaction(async (tx) => {
    await tx.offer.update({ where: { applicationId: id }, data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() } });
    await tx.application.update({ where: { id }, data: { status: to } });
    await recordEvent(tx, id, 'OFFER_MADE', to, student.userId, null);
    await syncReferral(tx, id, to);
  });
  if (a.opportunity.organizationId) await notifyMany(await orgMemberIds(a.opportunity.organizationId), { type: 'OFFER', title: `Offer ${accept ? 'accepted' : 'declined'}`, body: `A candidate ${accept ? 'accepted' : 'declined'} the offer for ${a.opportunity.title}.`, linkPath: `/industry/applicants/${id}` });
  return { status: to };
}

// Recalculate live applications after a student or an opportunity changes.
async function recompute(apps) {
  let changed = 0;
  for (const a of apps) {
    const snap = await loadStudentSnapshot(a.studentId);
    const ev = await evaluateAll(snap.snapshot, snap.institutionRules, a.opportunity);
    const before = a.eligibility;
    await prisma.application.update({ where: { id: a.id }, data: { eligibility: ev.result, eligibilitySnapshot: { checks: ev.checks, evaluatedAt: new Date().toISOString() }, matchScore: ev.match.score } });
    if (before !== ev.result) {
      changed += 1;
      await notify(snap.profile.userId, { type: 'APPLICATION', title: 'Eligibility changed', body: `Your eligibility for ${a.opportunity.title} is now ${ev.result.replace('_', ' ').toLowerCase()}.`, linkPath: `/student/opportunities/${a.opportunityId}` });
    }
  }
  return changed;
}
export const refreshApplicationEligibility = async (studentId) => recompute(await prisma.application.findMany({ where: { studentId, status: { in: OPEN } }, include: { opportunity: { include: OPP_INCLUDE } } }));
export const refreshOpportunityApplications = async (opportunityId) => recompute(await prisma.application.findMany({ where: { opportunityId, status: { in: OPEN } }, include: { opportunity: { include: OPP_INCLUDE } } }));

// ── Recruiter / college side ────────────────────────────────────────────────
// actor = { kind:'org', org, user } | { kind:'college', memberships, user }
function canManage(actor, opp) {
  if (actor.kind === 'org') return opp.organizationId === actor.org.id && actor.org.status === 'VERIFIED';
  return opp.organizationId === null && actor.memberships.some((m) => m.institutionId === opp.postedByInstitutionId && (m.canManagePartnerships || m.isPlacementOfficer));
}
async function loadForActor(actor, id) {
  const a = await prisma.application.findUnique({ where: { id }, include: { opportunity: { include: OPP_INCLUDE }, student: { include: { user: { select: { fullName: true, email: true, phone: true } }, institution: { select: { name: true } }, department: true } } } });
  if (!a || !canManage(actor, a.opportunity)) throw notFound();
  return a;
}
async function grantedFields(a) {
  const now = new Date();
  const g = await prisma.consentGrant.findFirst({ where: { studentId: a.studentId, scope: 'RECRUITER_PROFILE_VIEW', opportunityId: a.opportunityId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { grantedAt: 'desc' } });
  return g?.fields || [];
}
const ACADEMIC_KEYS = new Set(['cgpa', 'percentage', 'instCgpa', 'backlogs', 'instBacklogs']);
function visibleChecks(checks, fields) {
  return checks.filter((c) => (c.key.startsWith('skill:') ? fields.includes('skills') : ACADEMIC_KEYS.has(c.key) ? fields.includes('academics') : true));
}

export async function listApplicants(actor, q, page) {
  const oppWhere = actor.kind === 'org' ? { organizationId: actor.org.id } : { organizationId: null, postedByInstitutionId: { in: actor.memberships.map((m) => m.institutionId) } };
  const where = { opportunity: { ...oppWhere, ...(q.opportunityId ? { id: q.opportunityId } : {}) }, ...(q.status ? { status: q.status } : {}), ...(q.eligibility ? { eligibility: q.eligibility } : {}), ...(q.minScore ? { matchScore: { gte: Number(q.minScore) } } : {}) };
  const [total, rows] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({ where, orderBy: [{ matchScore: { sort: 'desc', nulls: 'last' } }, { appliedAt: 'asc' }], skip: page.skip, take: page.take, include: { opportunity: { select: { id: true, title: true } }, student: { include: { user: { select: { fullName: true } }, institution: { select: { name: true } }, department: { select: { name: true } } } } } }),
  ]);
  return { total, rows: rows.map((a) => ({ id: a.id, status: a.status, eligibility: a.eligibility, matchScore: a.matchScore, appliedAt: a.appliedAt, opportunity: a.opportunity, candidate: { name: a.student.user.fullName, institution: a.student.institution.name, department: a.student.department?.name || null, graduationYear: a.student.graduationYear, enrollmentVerified: a.student.registrationStatus === 'VERIFIED' } })) };
}

export async function getApplicant(actor, id) {
  const a = await loadForActor(actor, id);
  const fields = await grantedFields(a);
  const s = a.student;
  const [records, skills, projects, certs, resume, interviews, offer, events] = await Promise.all([
    fields.includes('academics') ? prisma.academicRecord.findMany({ where: { studentId: s.id }, orderBy: { semester: 'asc' } }) : [],
    fields.includes('skills') ? prisma.studentSkill.findMany({ where: { studentId: s.id }, include: { skill: true } }) : [],
    fields.includes('projects') ? prisma.project.findMany({ where: { studentId: s.id }, include: { skills: true } }) : [],
    fields.includes('certifications') ? prisma.certification.findMany({ where: { studentId: s.id } }) : [],
    fields.includes('resume') ? prisma.document.findFirst({ where: { ownerId: s.userId, kind: 'RESUME', deletedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, originalName: true } }) : null,
    prisma.interview.findMany({ where: { applicationId: id }, orderBy: { scheduledAt: 'asc' } }), prisma.offer.findUnique({ where: { applicationId: id } }),
    prisma.applicationStatusEvent.findMany({ where: { applicationId: id }, orderBy: { createdAt: 'asc' } }),
  ]);
  const snap = await loadStudentSnapshot(s.id);
  const live = await evaluateAll(snap.snapshot, snap.institutionRules, a.opportunity);
  const showSkills = fields.includes('skills');
  return {
    id: a.id, status: a.status, eligibility: a.eligibility, matchScore: a.matchScore, appliedAt: a.appliedAt, coverNote: a.coverNote,
    opportunity: { id: a.opportunity.id, title: a.opportunity.title }, consentedFields: fields,
    candidate: { name: s.user.fullName, institution: s.institution.name, department: s.department?.name || null, degree: s.degree, graduationYear: s.graduationYear, academicYear: s.academicYear, enrollmentVerified: s.registrationStatus === 'VERIFIED', ...(fields.includes('contact') ? { email: s.user.email, phone: s.user.phone } : {}) },
    academics: records.map((r) => ({ semester: r.semester, cgpa: r.cgpa != null ? Number(r.cgpa) : null, percentage: r.percentage != null ? Number(r.percentage) : null, activeBacklogs: r.activeBacklogs, verificationStatus: r.verificationStatus })),
    skills: skills.map((k) => ({ name: k.skill.name, proficiency: k.proficiency, verificationStatus: k.verificationStatus })),
    projects: projects.map((p) => ({ title: p.title, description: p.description, projectUrl: p.projectUrl, repositoryUrl: p.repositoryUrl, skills: p.skills.map((x) => x.name), verificationStatus: p.verificationStatus })),
    certifications: certs.map((c) => ({ name: c.name, issuer: c.issuer, verificationStatus: c.verificationStatus })),
    resume,
    eligibilityChecks: visibleChecks(a.eligibilitySnapshot.checks || [], fields),
    matchFactors: showSkills ? live.match.factors : live.match.factors.filter((f) => f.key === 'disciplineFit'),
    interviews, offer, history: events,
  };
}

export async function updateStatus(actor, id, to, note) {
  const a = await loadForActor(actor, id);
  if (!(MANAGE[a.status] || []).includes(to)) throw conflict(`Cannot move from ${a.status} to ${to}`);
  if (a.eligibility === 'NOT_ELIGIBLE' && to !== 'REJECTED') throw conflict('This candidate no longer meets the requirements');
  await prisma.$transaction(async (tx) => { await tx.application.update({ where: { id }, data: { status: to } }); await recordEvent(tx, id, a.status, to, actor.user.id, note); await syncReferral(tx, id, to); });
  await notify(a.student.userId, { type: 'APPLICATION', title: `Application ${to.replace('_', ' ').toLowerCase()}`, body: `${a.opportunity.title}: status is now ${to.replace('_', ' ').toLowerCase()}.${note ? ' Note: ' + note : ''}`, linkPath: '/student/applications' });
  await audit(null, { actorId: actor.user.id, action: 'application.status', entityType: 'Application', entityId: id, metadata: { from: a.status, to } });
  return { status: to };
}

export async function scheduleInterview(actor, id, d) {
  const a = await loadForActor(actor, id);
  if (!['SHORTLISTED', 'INTERVIEW_SCHEDULED'].includes(a.status)) throw conflict('Shortlist the candidate before scheduling an interview');
  if (new Date(d.scheduledAt) <= new Date()) throw badRequest('Choose a future time');
  const iv = await prisma.$transaction(async (tx) => {
    const i = await tx.interview.create({ data: { applicationId: id, scheduledAt: d.scheduledAt, mode: d.mode, locationOrLink: d.locationOrLink, notes: d.notes, createdById: actor.user.id } });
    if (a.status !== 'INTERVIEW_SCHEDULED') { await tx.application.update({ where: { id }, data: { status: 'INTERVIEW_SCHEDULED' } }); await recordEvent(tx, id, a.status, 'INTERVIEW_SCHEDULED', actor.user.id, null); }
    return i;
  });
  await notify(a.student.userId, { type: 'INTERVIEW', title: 'Interview scheduled', body: `${a.opportunity.title}: ${new Date(d.scheduledAt).toLocaleString('en-IN')}.`, linkPath: '/student/applications' });
  return iv;
}
export async function setInterviewStatus(actor, id, interviewId, status) {
  await loadForActor(actor, id);
  const iv = await prisma.interview.findFirst({ where: { id: interviewId, applicationId: id } });
  if (!iv) throw notFound();
  return prisma.interview.update({ where: { id: interviewId }, data: { status } });
}

export async function makeOffer(actor, id, d) {
  const a = await loadForActor(actor, id);
  if (a.status !== 'SELECTED') throw conflict('Select the candidate before making an offer');
  await prisma.$transaction(async (tx) => {
    await tx.offer.create({ data: { applicationId: id, details: d.details, joiningDate: d.joiningDate } });
    await tx.application.update({ where: { id }, data: { status: 'OFFER_MADE' } });
    await recordEvent(tx, id, 'SELECTED', 'OFFER_MADE', actor.user.id, null);
  });
  await notify(a.student.userId, { type: 'OFFER', title: 'You have an offer', body: `${a.opportunity.title}: review and respond to the offer.`, linkPath: '/student/applications' });
  return { status: 'OFFER_MADE' };
}
export async function withdrawOffer(actor, id) {
  const a = await loadForActor(actor, id);
  if (a.status !== 'OFFER_MADE') throw conflict('There is no open offer');
  await prisma.$transaction(async (tx) => { await tx.offer.update({ where: { applicationId: id }, data: { status: 'WITHDRAWN' } }); await tx.application.update({ where: { id }, data: { status: 'REJECTED' } }); await recordEvent(tx, id, 'OFFER_MADE', 'REJECTED', actor.user.id, 'Offer withdrawn'); await syncReferral(tx, id, 'REJECTED'); });
  await notify(a.student.userId, { type: 'OFFER', title: 'Offer withdrawn', body: `The offer for ${a.opportunity.title} was withdrawn.`, linkPath: '/student/applications' });
  return { status: 'REJECTED' };
}
