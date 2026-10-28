import prisma from '../db.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { audit } from './audit.js';
import { notify, notifyMany } from './notify.js';
import { recomputeUserStatus } from './auth.js';
import { refreshApplicationEligibility } from './application.js';

const ITEM_MODEL = { ACADEMIC_RECORD: 'academicRecord', SKILL: 'studentSkill', PROJECT: 'project', CERTIFICATION: 'certification' };
const NEEDS_EVIDENCE = new Set(['ACADEMIC_RECORD', 'CERTIFICATION']);
const SUBMITTABLE = ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED', 'REVOKED', 'EXPIRED'];

async function reviewerIds(institutionId) {
  const ms = await prisma.institutionMembership.findMany({ where: { institutionId, canVerifyCredentials: true, approvedAt: { not: null } }, select: { userId: true } });
  return ms.map((m) => m.userId);
}

// Student submits one item (record / skill / project / certification) for verification.
export async function submitItem(student, { subjectType, subjectId, documentIds = [] }) {
  const model = ITEM_MODEL[subjectType];
  if (!model) throw badRequest('This item type cannot be submitted this way');
  if (student.registrationStatus !== 'VERIFIED') throw forbidden('Your enrollment must be verified before you can submit other items');
  const item = await prisma[model].findUnique({ where: { id: subjectId } });
  if (!item || item.studentId !== student.id) throw notFound();
  if (!SUBMITTABLE.includes(item.verificationStatus)) throw conflict(`This item is already ${item.verificationStatus.toLowerCase().replace('_', ' ')}`);
  const docs = documentIds.length ? await prisma.document.findMany({ where: { id: { in: documentIds }, ownerId: student.userId, deletedAt: null } }) : [];
  if (docs.length !== documentIds.length) throw badRequest('One or more documents were not found');
  if (NEEDS_EVIDENCE.has(subjectType) && !docs.length) throw badRequest('Attach at least one supporting document');
  if (subjectType === 'PROJECT' && !docs.length && !item.projectUrl && !item.repositoryUrl) throw badRequest('Add a project link or attach evidence');

  const reqId = await prisma.$transaction(async (tx) => {
    // Reviewers of this institution (and only them) may read the evidence documents.
    await tx.document.updateMany({ where: { id: { in: documentIds } }, data: { institutionId: student.institutionId } });
    const prev = await tx.verificationRequest.findFirst({ where: { subjectType, subjectId }, orderBy: { submittedAt: 'desc' } });
    let r;
    if (prev && ['CHANGES_REQUESTED', 'REJECTED'].includes(prev.status)) {
      r = await tx.verificationRequest.update({ where: { id: prev.id }, data: { status: 'SUBMITTED', revision: prev.revision + 1, decisionReason: null, decidedAt: null, submittedAt: new Date() } });
      await tx.verificationEvidence.deleteMany({ where: { requestId: r.id } });
    } else {
      r = await tx.verificationRequest.create({ data: { institutionId: student.institutionId, studentId: student.id, subjectType, subjectId, revision: (prev?.revision || 0) + 1 } });
    }
    if (documentIds.length) await tx.verificationEvidence.createMany({ data: documentIds.map((documentId) => ({ requestId: r.id, documentId })) });
    await tx[model].update({ where: { id: subjectId }, data: { verificationStatus: 'SUBMITTED', verifiedAt: null } });
    return r.id;
  });
  await notifyMany(await reviewerIds(student.institutionId), { type: 'VERIFICATION', title: 'New verification task', body: `A student submitted a ${subjectType.toLowerCase().replace('_', ' ')} for review.`, linkPath: `/college/verification/${reqId}` });
  return { requestId: reqId };
}

// Fetch details of the verified subject, grouped to avoid N+1 queries.
async function subjectDetails(requests) {
  const out = new Map();
  for (const [type, model] of Object.entries(ITEM_MODEL)) {
    const ids = requests.filter((r) => r.subjectType === type).map((r) => r.subjectId);
    if (!ids.length) continue;
    const rows = await prisma[model].findMany({ where: { id: { in: ids } }, include: type === 'SKILL' ? { skill: true } : undefined });
    rows.forEach((row) => out.set(`${type}:${row.id}`, row));
  }
  const enrollIds = requests.filter((r) => r.subjectType === 'ENROLLMENT').map((r) => r.subjectId);
  if (enrollIds.length) (await prisma.studentProfile.findMany({ where: { id: { in: enrollIds } }, include: { department: true } })).forEach((p) => out.set(`ENROLLMENT:${p.id}`, p));
  const alumniIds = requests.filter((r) => r.subjectType === 'ALUMNI_GRADUATION').map((r) => r.subjectId);
  if (alumniIds.length) (await prisma.alumniProfile.findMany({ where: { id: { in: alumniIds } }, include: { department: true } })).forEach((a) => out.set(`ALUMNI_GRADUATION:${a.id}`, a));
  return out;
}

export async function queue(institutionId, { status, subjectType, page }) {
  const where = { institutionId, ...(status ? { status } : { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } }), ...(subjectType ? { subjectType } : {}) };
  const [total, rows] = await Promise.all([
    prisma.verificationRequest.count({ where }),
    prisma.verificationRequest.findMany({ where, orderBy: { submittedAt: 'asc' }, skip: page.skip, take: page.take, include: { student: { include: { user: { select: { fullName: true } }, department: true } }, evidence: { include: { document: { select: { id: true, originalName: true, kind: true } } } } } }),
  ]);
  const details = await subjectDetails(rows);
  const alumniIds = rows.filter((r) => r.alumniId).map((r) => r.alumniId);
  const alumni = alumniIds.length ? await prisma.alumniProfile.findMany({ where: { id: { in: alumniIds } }, include: { user: { select: { fullName: true } } } }) : [];
  return { total, rows: rows.map((r) => ({
    id: r.id, subjectType: r.subjectType, subjectId: r.subjectId, status: r.status, revision: r.revision, submittedAt: r.submittedAt, decisionReason: r.decisionReason,
    applicantName: r.student?.user.fullName || alumni.find((a) => a.id === r.alumniId)?.user.fullName || 'Unknown',
    department: r.student?.department?.name || null,
    subject: details.get(`${r.subjectType}:${r.subjectId}`) || null,
    evidence: r.evidence.map((e) => e.document),
  })) };
}

async function loadScoped(req, id) {
  const r = await prisma.verificationRequest.findUnique({ where: { id } });
  if (!r) throw notFound();
  const m = req.memberships.find((x) => x.institutionId === r.institutionId);
  if (!m || !m.canVerifyCredentials) throw forbidden('You cannot review requests of this institution');
  return r;
}

export async function getRequest(req, id) {
  const r = await loadScoped(req, id);
  const full = await prisma.verificationRequest.findUnique({
    where: { id },
    include: { reviews: { orderBy: { createdAt: 'desc' }, include: { reviewer: { select: { fullName: true } } } }, evidence: { include: { document: { select: { id: true, originalName: true, kind: true, sizeBytes: true } } } }, student: { include: { user: { select: { fullName: true, email: true } }, department: true } } },
  });
  const details = await subjectDetails([r]);
  return { ...full, subject: details.get(`${r.subjectType}:${r.subjectId}`) || null };
}

export async function claim(req, id) {
  const r = await loadScoped(req, id);
  if (r.status !== 'SUBMITTED') throw conflict('This request is not waiting for review');
  const u = await prisma.verificationRequest.update({ where: { id }, data: { status: 'UNDER_REVIEW', assignedReviewerId: req.user.id } });
  await prisma.verificationReview.create({ data: { requestId: id, reviewerId: req.user.id, fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW' } });
  return u;
}

const TERMINAL = { VERIFIED: 'verified', REJECTED: 'rejected', CHANGES_REQUESTED: 'sent back for changes' };

export async function decide(req, id, { decision, reason }) {
  const r = await loadScoped(req, id);
  if (!['SUBMITTED', 'UNDER_REVIEW'].includes(r.status)) throw conflict('This request has already been decided');
  if (decision !== 'VERIFIED' && !reason) throw badRequest('A reason is required when rejecting or requesting changes');
  const now = new Date();
  let ownerUserId; let studentId = r.studentId;
  await prisma.$transaction(async (tx) => {
    await tx.verificationRequest.update({ where: { id }, data: { status: decision, decisionReason: reason || null, decidedAt: now, assignedReviewerId: req.user.id } });
    await tx.verificationReview.create({ data: { requestId: id, reviewerId: req.user.id, fromStatus: r.status, toStatus: decision, reason } });
    const verifiedAt = decision === 'VERIFIED' ? now : null;
    if (r.subjectType === 'ENROLLMENT') {
      const p = await tx.studentProfile.update({ where: { id: r.subjectId }, data: { registrationStatus: decision, registrationReviewedAt: now } });
      ownerUserId = p.userId;
      if (decision !== 'VERIFIED') await tx.credentialToken.updateMany({ where: { studentId: p.id, revokedAt: null }, data: { revokedAt: now, revokedReason: 'Enrollment no longer verified' } });
    } else if (r.subjectType === 'ALUMNI_GRADUATION') {
      const a = await tx.alumniProfile.update({ where: { id: r.subjectId }, data: { verificationStatus: decision, verifiedAt } });
      ownerUserId = a.userId;
    } else {
      const model = ITEM_MODEL[r.subjectType];
      const item = await tx[model].update({ where: { id: r.subjectId }, data: { verificationStatus: decision, verifiedAt } });
      const sp = await tx.studentProfile.findUnique({ where: { id: item.studentId } });
      ownerUserId = sp.userId;
    }
  });
  if (r.subjectType === 'ENROLLMENT' || r.subjectType === 'ALUMNI_GRADUATION') await recomputeUserStatus(ownerUserId);
  if (studentId) await refreshApplicationEligibility(studentId);
  await notify(ownerUserId, { type: 'VERIFICATION', title: `Verification ${TERMINAL[decision]}`, body: `Your ${r.subjectType.toLowerCase().replace('_', ' ')} was ${TERMINAL[decision]}.${reason ? ' Reason: ' + reason : ''}`, linkPath: r.subjectType === 'ALUMNI_GRADUATION' ? '/alumni/profile' : '/student/profile' });
  await audit(req, { action: `verification.${decision.toLowerCase()}`, entityType: r.subjectType, entityId: r.subjectId, institutionId: r.institutionId, metadata: { requestId: id, reason: reason || null } });
  return { status: decision };
}

export async function revoke(req, id, reason) {
  const r = await loadScoped(req, id);
  if (r.status !== 'VERIFIED') throw conflict('Only verified items can be revoked');
  if (!reason) throw badRequest('A reason is required');
  const now = new Date();
  let userId;
  await prisma.$transaction(async (tx) => {
    await tx.verificationRequest.update({ where: { id }, data: { status: 'REVOKED', decisionReason: reason, decidedAt: now } });
    await tx.verificationReview.create({ data: { requestId: id, reviewerId: req.user.id, fromStatus: 'VERIFIED', toStatus: 'REVOKED', reason } });
    if (r.subjectType === 'ENROLLMENT') { const p = await tx.studentProfile.update({ where: { id: r.subjectId }, data: { registrationStatus: 'REVOKED' } }); userId = p.userId; await tx.credentialToken.updateMany({ where: { studentId: p.id, revokedAt: null }, data: { revokedAt: now, revokedReason: reason } }); }
    else if (r.subjectType === 'ALUMNI_GRADUATION') { const a = await tx.alumniProfile.update({ where: { id: r.subjectId }, data: { verificationStatus: 'REVOKED' } }); userId = a.userId; }
    else { const item = await tx[ITEM_MODEL[r.subjectType]].update({ where: { id: r.subjectId }, data: { verificationStatus: 'REVOKED', verifiedAt: null } }); userId = (await tx.studentProfile.findUnique({ where: { id: item.studentId } })).userId; }
  });
  if (r.subjectType === 'ENROLLMENT' || r.subjectType === 'ALUMNI_GRADUATION') await recomputeUserStatus(userId);
  if (r.studentId) await refreshApplicationEligibility(r.studentId);
  await notify(userId, { type: 'VERIFICATION', title: 'Verification revoked', body: `A verification was revoked. Reason: ${reason}`, linkPath: '/student/profile' });
  await audit(req, { action: 'verification.revoke', entityType: r.subjectType, entityId: r.subjectId, institutionId: r.institutionId, severity: 'WARNING', metadata: { requestId: id, reason } });
  return { status: 'REVOKED' };
}

// Student re-submits a rejected / change-requested enrollment (e.g. after fixing identifiers).
export async function resubmitEnrollment(student, documentIds = []) {
  if (!['CHANGES_REQUESTED', 'REJECTED', 'SUBMITTED'].includes(student.registrationStatus)) throw conflict('Nothing to resubmit');
  const docs = await prisma.document.findMany({ where: { id: { in: documentIds }, ownerId: student.userId, deletedAt: null } });
  if (docs.length !== documentIds.length) throw badRequest('One or more documents were not found');
  const reqId = await prisma.$transaction(async (tx) => {
    await tx.document.updateMany({ where: { id: { in: documentIds } }, data: { institutionId: student.institutionId } });
    let r = await tx.verificationRequest.findFirst({ where: { subjectType: 'ENROLLMENT', subjectId: student.id }, orderBy: { submittedAt: 'desc' } });
    if (!r || !['SUBMITTED', 'UNDER_REVIEW'].includes(r.status)) {
      r = r && ['CHANGES_REQUESTED', 'REJECTED'].includes(r.status)
        ? await tx.verificationRequest.update({ where: { id: r.id }, data: { status: 'SUBMITTED', revision: r.revision + 1, decisionReason: null, decidedAt: null, submittedAt: new Date() } })
        : await tx.verificationRequest.create({ data: { institutionId: student.institutionId, studentId: student.id, subjectType: 'ENROLLMENT', subjectId: student.id } });
    }
    await tx.verificationEvidence.deleteMany({ where: { requestId: r.id } });
    if (documentIds.length) await tx.verificationEvidence.createMany({ data: documentIds.map((documentId) => ({ requestId: r.id, documentId })) });
    await tx.studentProfile.update({ where: { id: student.id }, data: { registrationStatus: 'SUBMITTED' } });
    return r.id;
  });
  await notifyMany(await reviewerIds(student.institutionId), { type: 'VERIFICATION', title: 'Student registration awaiting review', body: 'A student registration needs review.', linkPath: `/college/verification/${reqId}` });
  return { requestId: reqId };
}

// Attach evidence to a still-open alumni verification request.
export async function attachAlumniEvidence(alumni, documentIds) {
  const docs = await prisma.document.findMany({ where: { id: { in: documentIds }, ownerId: alumni.userId, deletedAt: null } });
  if (docs.length !== documentIds.length) throw badRequest('One or more documents were not found');
  const r = await prisma.verificationRequest.findFirst({ where: { subjectType: 'ALUMNI_GRADUATION', subjectId: alumni.id }, orderBy: { submittedAt: 'desc' } });
  if (!r) throw new AppError(404, 'NOT_FOUND', 'No verification request found');
  await prisma.$transaction(async (tx) => {
    await tx.document.updateMany({ where: { id: { in: documentIds } }, data: { institutionId: alumni.institutionId } });
    await tx.verificationEvidence.createMany({ data: documentIds.map((documentId) => ({ requestId: r.id, documentId })), skipDuplicates: true });
    if (['CHANGES_REQUESTED', 'REJECTED'].includes(r.status)) { await tx.verificationRequest.update({ where: { id: r.id }, data: { status: 'SUBMITTED', revision: r.revision + 1, decisionReason: null } }); await tx.alumniProfile.update({ where: { id: alumni.id }, data: { verificationStatus: 'SUBMITTED' } }); }
  });
  return { requestId: r.id };
}
