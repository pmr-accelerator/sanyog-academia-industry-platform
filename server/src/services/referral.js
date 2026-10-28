import prisma from '../db.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { OPP_INCLUDE, loadStudentSnapshot, evaluateAll } from './eligibility.js';
import { notify, notifyMany } from './notify.js';
import { createApplication } from './application.js';
import { audit } from './audit.js';

// Alumni can only see students of their own institution who explicitly allowed discovery.
export async function discoverStudents(alumni, q, page) {
  const where = {
    institutionId: alumni.institutionId, registrationStatus: 'VERIFIED', user: { status: 'ACTIVE' },
    consents: { some: { scope: 'ALUMNI_DISCOVERY', revokedAt: null } },
    ...(q.skill ? { skills: { some: { skill: { name: { contains: q.skill, mode: 'insensitive' } }, verificationStatus: 'VERIFIED' } } } : {}),
    ...(q.q ? { user: { status: 'ACTIVE', fullName: { contains: q.q, mode: 'insensitive' } } } : {}),
  };
  const [total, rows] = await Promise.all([prisma.studentProfile.count({ where }), prisma.studentProfile.findMany({ where, skip: page.skip, take: page.take, include: { user: { select: { fullName: true } }, department: { select: { name: true } }, skills: { where: { verificationStatus: 'VERIFIED' }, include: { skill: true } } } })]);
  // No contact data, no unverified information.
  return { total, rows: rows.map((s) => ({ id: s.id, name: s.user.fullName, department: s.department?.name || null, degree: s.degree, graduationYear: s.graduationYear, targetRole: s.targetRole, verifiedSkills: s.skills.map((k) => ({ name: k.skill.name, proficiency: k.proficiency })) })) };
}

export async function refer(alumni, { opportunityId, studentId, note }) {
  const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId }, include: OPP_INCLUDE });
  if (!opp || opp.status !== 'PUBLISHED' || opp.deadline <= new Date()) throw badRequest('This opportunity is not open');
  if (!opp.organizationId) throw badRequest('Referrals are only for employer opportunities');
  if (!opp.institutions.some((i) => i.institutionId === alumni.institutionId)) throw forbidden('This opportunity is outside your scope');
  const st = await prisma.studentProfile.findUnique({ where: { id: studentId }, include: { user: true } });
  if (!st || st.institutionId !== alumni.institutionId || st.registrationStatus !== 'VERIFIED' || st.user.status !== 'ACTIVE') throw notFound('Student not found');
  const consent = await prisma.consentGrant.findFirst({ where: { studentId, scope: 'ALUMNI_DISCOVERY', revokedAt: null } });
  if (!consent) throw forbidden('This student has not allowed alumni referrals');
  const snap = await loadStudentSnapshot(studentId);
  const ev = await evaluateAll(snap.snapshot, snap.institutionRules, opp);
  if (ev.result === 'NOT_ELIGIBLE') throw new AppError(422, 'NOT_ELIGIBLE', 'This student does not meet the requirements for this opportunity', { checks: ev.checks.filter((c) => c.status !== 'MET').map((c) => ({ label: c.label, detail: c.detail })) });
  try {
    const r = await prisma.referral.create({ data: { opportunityId, alumniId: alumni.id, studentId, note, eligibility: ev.result } });
    await notify(st.userId, { type: 'REFERRAL', title: 'An alumnus wants to refer you', body: `${opp.title}: review and give consent to share your profile.`, linkPath: '/student/referrals' });
    await audit(null, { actorId: alumni.userId, action: 'referral.create', entityType: 'Referral', entityId: r.id, institutionId: alumni.institutionId });
    return r;
  } catch (e) {
    if (e.code === 'P2002') throw conflict('This student has already been referred for this vacancy');
    throw e;
  }
}

const rInclude = { opportunity: { select: { id: true, title: true, organization: { select: { displayName: true } } } }, alumni: { include: { user: { select: { fullName: true } } } }, student: { include: { user: { select: { fullName: true } } } } };
export const listForAlumni = (alumni) => prisma.referral.findMany({ where: { alumniId: alumni.id }, orderBy: { createdAt: 'desc' }, include: { opportunity: rInclude.opportunity, student: { include: { user: { select: { fullName: true } } } } } });
export const listForStudent = (student) => prisma.referral.findMany({ where: { studentId: student.id }, orderBy: { createdAt: 'desc' }, include: { opportunity: rInclude.opportunity, alumni: rInclude.alumni } });

export async function studentRespond(student, id, { accept, shareFields }) {
  const r = await prisma.referral.findFirst({ where: { id, studentId: student.id }, include: { opportunity: true } });
  if (!r) throw notFound();
  if (r.status !== 'PENDING_STUDENT_CONSENT') throw conflict('You have already responded');
  if (!accept) { await prisma.referral.update({ where: { id }, data: { status: 'DECLINED_BY_STUDENT' } }); return { status: 'DECLINED_BY_STUDENT' }; }
  await prisma.$transaction([
    prisma.referral.update({ where: { id }, data: { status: 'SUBMITTED', studentConsentAt: new Date() } }),
    prisma.consentGrant.create({ data: { studentId: student.id, scope: 'REFERRAL_SHARING', granteeOrganizationId: r.opportunity.organizationId, opportunityId: r.opportunityId, fields: shareFields?.length ? shareFields : ['academics', 'skills'] } }),
  ]);
  const members = await prisma.organizationMember.findMany({ where: { organizationId: r.opportunity.organizationId }, select: { userId: true } });
  await notifyMany(members.map((m) => m.userId), { type: 'REFERRAL', title: 'New alumni referral', body: `A referral was submitted for ${r.opportunity.title}.`, linkPath: '/industry/referrals' });
  return { status: 'SUBMITTED' };
}

// Recruiter side – sees only referrals the student consented to, limited to the consented fields.
export async function listForOrg(org) {
  const rows = await prisma.referral.findMany({ where: { opportunity: { organizationId: org.id }, status: { notIn: ['PENDING_STUDENT_CONSENT', 'DECLINED_BY_STUDENT'] } }, orderBy: { createdAt: 'desc' }, include: { opportunity: { select: { id: true, title: true } }, alumni: { include: { user: { select: { fullName: true } } } }, student: { include: { user: { select: { fullName: true } }, department: { select: { name: true } } } } } });
  return rows.map((r) => ({ id: r.id, status: r.status, note: r.note, eligibility: r.eligibility, applicationId: r.applicationId, createdAt: r.createdAt, opportunity: r.opportunity, alumni: { name: r.alumni.user.fullName, employer: r.alumni.currentEmployer, role: r.alumni.currentRole }, candidate: { name: r.student.user.fullName, department: r.student.department?.name || null, graduationYear: r.student.graduationYear } }));
}
export async function orgDecide(org, id, accept) {
  const r = await prisma.referral.findFirst({ where: { id, opportunity: { organizationId: org.id }, status: 'SUBMITTED' }, include: { student: true, opportunity: true } });
  if (!r) throw notFound();
  if (org.status !== 'VERIFIED') throw forbidden();
  if (!accept) { await prisma.referral.update({ where: { id }, data: { status: 'NOT_SELECTED' } }); return { status: 'NOT_SELECTED' }; }
  const existing = await prisma.application.findUnique({ where: { opportunityId_studentId: { opportunityId: r.opportunityId, studentId: r.studentId } } });
  let app = existing;
  if (!app) {
    const grant = await prisma.consentGrant.findFirst({ where: { studentId: r.studentId, scope: 'REFERRAL_SHARING', opportunityId: r.opportunityId, revokedAt: null }, orderBy: { grantedAt: 'desc' } });
    if (!grant) throw forbidden('The student has withdrawn consent');
    // Referral does not bypass eligibility: createApplication re-checks every criterion.
    app = await createApplication({ student: r.student, opportunityId: r.opportunityId, coverNote: 'Alumni referral', shareFields: grant.fields, actorId: r.student.userId });
  }
  await prisma.referral.update({ where: { id }, data: { status: 'ACCEPTED_BY_RECRUITER', applicationId: app.id } });
  await notify(r.student.userId, { type: 'REFERRAL', title: 'Referral accepted', body: `Your referral for ${r.opportunity.title} was accepted into the hiring pipeline.`, linkPath: '/student/applications' });
  return { status: 'ACCEPTED_BY_RECRUITER', applicationId: app.id };
}
