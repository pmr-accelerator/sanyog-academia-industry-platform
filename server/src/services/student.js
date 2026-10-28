import prisma from '../db.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { computeCompletion } from '../utils/completion.js';
import { audit } from './audit.js';
import { refreshApplicationEligibility } from './application.js';

const DONE_STATES = ['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED'];

// Cancel open/verified requests for an item that was materially edited and send it back to DRAFT.
async function invalidate(tx, subjectType, subjectId) {
  await tx.verificationRequest.updateMany({
    where: { subjectType, subjectId, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED'] } },
    data: { status: 'REVOKED', decisionReason: 'The item was edited after submission and needs to be submitted again.', decidedAt: new Date() },
  });
}

export async function refreshCompletion(studentId) {
  const p = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    include: { _count: { select: { academicRecords: true, skills: true, projects: true, certifications: true } }, user: { include: { documents: { where: { deletedAt: null }, select: { kind: true } } } } },
  });
  const c = computeCompletion({
    departmentId: p.departmentId, bio: p.bio, careerInterests: p.careerInterests, targetRole: p.targetRole, weeklyLearningHours: p.weeklyLearningHours,
    academicRecordCount: p._count.academicRecords, skillCount: p._count.skills, projectCount: p._count.projects, certificationCount: p._count.certifications,
    hasResume: p.user.documents.some((d) => d.kind === 'RESUME'), hasPhoto: p.user.documents.some((d) => d.kind === 'PHOTO'),
  });
  if (c.score !== p.profileCompletion) await prisma.studentProfile.update({ where: { id: studentId }, data: { profileCompletion: c.score } });
  return c;
}

async function afterChange(studentId) {
  await refreshCompletion(studentId);
  await refreshApplicationEligibility(studentId);
}

export async function getProfile(studentId) {
  const p = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { fullName: true, email: true, phone: true } }, institution: { select: { id: true, name: true } }, department: true,
      academicRecords: { orderBy: { semester: 'asc' } }, skills: { include: { skill: true }, orderBy: { createdAt: 'asc' } },
      projects: { include: { skills: true }, orderBy: { createdAt: 'desc' } }, certifications: { orderBy: { createdAt: 'desc' } },
    },
  });
  const completion = await refreshCompletion(studentId);
  const requests = await prisma.verificationRequest.findMany({
    where: { studentId }, orderBy: { updatedAt: 'desc' },
    include: { reviews: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  const latest = {};
  for (const r of requests) { const k = `${r.subjectType}:${r.subjectId}`; if (!latest[k]) latest[k] = { id: r.id, status: r.status, reason: r.decisionReason, decidedAt: r.decidedAt, revision: r.revision }; }
  return { ...p, completion, verification: latest };
}

const IDENTITY_FIELDS = ['departmentId', 'degree', 'graduationYear', 'studentIdNumber', 'registrationNumber', 'enrollmentNumber'];

export async function updateProfile(student, d) {
  if (d.departmentId && !(await prisma.department.findFirst({ where: { id: d.departmentId, institutionId: student.institutionId } }))) throw badRequest('Department does not belong to your institution');
  const identityChanged = IDENTITY_FIELDS.some((f) => d[f] !== undefined && d[f] !== student[f]);
  await prisma.$transaction(async (tx) => {
    await tx.studentProfile.update({ where: { id: student.id }, data: d });
    if (identityChanged && student.registrationStatus === 'VERIFIED') {
      // Material change: the college must verify the enrollment again.
      await tx.studentProfile.update({ where: { id: student.id }, data: { registrationStatus: 'SUBMITTED' } });
      await invalidate(tx, 'ENROLLMENT', student.id);
      await tx.verificationRequest.create({ data: { institutionId: student.institutionId, studentId: student.id, subjectType: 'ENROLLMENT', subjectId: student.id, revision: 2 } });
      await tx.credentialToken.updateMany({ where: { studentId: student.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'Profile changed; re-verification required' } });
    }
  });
  if (identityChanged) await audit(null, { actorId: student.userId, action: 'student.reverification_triggered', entityType: 'StudentProfile', entityId: student.id, institutionId: student.institutionId });
  await afterChange(student.id);
  return getProfile(student.id);
}

// ── Generic item helpers for the four verifiable item types ─────────────────
async function ownItem(model, studentId, id) {
  const item = await prisma[model].findUnique({ where: { id } });
  if (!item || item.studentId !== studentId) throw notFound();
  return item;
}
async function editItem({ model, subjectType, studentId, id, data, material }) {
  const item = await ownItem(model, studentId, id);
  const changed = material.some((f) => data[f] !== undefined && String(data[f] ?? '') !== String(item[f] ?? ''));
  await prisma.$transaction(async (tx) => {
    await tx[model].update({ where: { id }, data: { ...data, ...(changed && DONE_STATES.includes(item.verificationStatus) ? { verificationStatus: 'DRAFT', verifiedAt: null } : {}) } });
    if (changed && DONE_STATES.includes(item.verificationStatus)) await invalidate(tx, subjectType, id);
  });
  await afterChange(studentId);
}
async function removeItem(model, subjectType, studentId, id) {
  const item = await ownItem(model, studentId, id);
  if (item.verificationStatus === 'UNDER_REVIEW') throw conflict('This item is being reviewed right now');
  await prisma.$transaction(async (tx) => { await invalidate(tx, subjectType, id); await tx[model].delete({ where: { id } }); });
  await afterChange(studentId);
}

// Academic records
export async function saveRecord(studentId, d) {
  const existing = await prisma.academicRecord.findUnique({ where: { studentId_semester: { studentId, semester: d.semester } } });
  if (existing) { await editItem({ model: 'academicRecord', subjectType: 'ACADEMIC_RECORD', studentId, id: existing.id, data: d, material: ['cgpa', 'percentage', 'activeBacklogs'] }); return existing.id; }
  const r = await prisma.academicRecord.create({ data: { ...d, studentId } });
  await afterChange(studentId);
  return r.id;
}
export const deleteRecord = (studentId, id) => removeItem('academicRecord', 'ACADEMIC_RECORD', studentId, id);

// Skills
export async function saveSkill(studentId, d) {
  if (!(await prisma.skill.findUnique({ where: { id: d.skillId } }))) throw badRequest('Unknown skill');
  const existing = await prisma.studentSkill.findUnique({ where: { studentId_skillId: { studentId, skillId: d.skillId } } });
  if (existing) { await editItem({ model: 'studentSkill', subjectType: 'SKILL', studentId, id: existing.id, data: { proficiency: d.proficiency }, material: ['proficiency'] }); return existing.id; }
  const s = await prisma.studentSkill.create({ data: { studentId, skillId: d.skillId, proficiency: d.proficiency, acquiredOn: d.acquiredOn } });
  await afterChange(studentId);
  return s.id;
}
export const deleteSkill = (studentId, id) => removeItem('studentSkill', 'SKILL', studentId, id);

// Projects
export async function createProject(studentId, d) {
  const { skillIds = [], ...rest } = d;
  const p = await prisma.project.create({ data: { ...rest, studentId, skills: { connect: skillIds.map((id) => ({ id })) } } });
  await afterChange(studentId);
  return p.id;
}
export async function updateProject(studentId, id, d) {
  const { skillIds, ...rest } = d;
  await editItem({ model: 'project', subjectType: 'PROJECT', studentId, id, data: rest, material: ['title', 'description', 'projectUrl', 'repositoryUrl'] });
  if (skillIds) await prisma.project.update({ where: { id }, data: { skills: { set: skillIds.map((s) => ({ id: s })) } } });
}
export const deleteProject = (studentId, id) => removeItem('project', 'PROJECT', studentId, id);

// Certifications
export async function createCertification(studentId, d) { const c = await prisma.certification.create({ data: { ...d, studentId } }); await afterChange(studentId); return c.id; }
export const updateCertification = (studentId, id, d) => editItem({ model: 'certification', subjectType: 'CERTIFICATION', studentId, id, data: d, material: ['name', 'issuer', 'credentialId', 'issuedOn', 'expiresOn'] });
export const deleteCertification = (studentId, id) => removeItem('certification', 'CERTIFICATION', studentId, id);

export async function setExperience(student, months) {
  await prisma.studentProfile.update({ where: { id: student.id }, data: { experienceMonths: months } });
  await refreshApplicationEligibility(student.id);
}
