import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../db.js';
import env from '../config/env.js';
import { badRequest, forbidden } from '../utils/errors.js';
import { randomToken } from '../utils/crypto.js';
import { audit } from './audit.js';

export async function exportData(req) {
  const u = req.user;
  const base = await prisma.user.findUnique({ where: { id: u.id }, select: { id: true, email: true, fullName: true, phone: true, role: true, createdAt: true, lastLoginAt: true } });
  const data = { exportedAt: new Date().toISOString(), account: base };
  const [notifications, documents, consents] = await Promise.all([
    prisma.notification.findMany({ where: { userId: u.id }, select: { type: true, title: true, body: true, createdAt: true } }),
    prisma.document.findMany({ where: { ownerId: u.id, deletedAt: null }, select: { kind: true, originalName: true, sizeBytes: true, createdAt: true } }),
    u.role === 'STUDENT' ? prisma.consentGrant.findMany({ where: { student: { userId: u.id } } }) : [],
  ]);
  Object.assign(data, { notifications, documents, consents });
  if (u.role === 'STUDENT') data.studentProfile = await prisma.studentProfile.findUnique({ where: { userId: u.id }, include: { academicRecords: true, skills: { include: { skill: true } }, projects: true, certifications: true, applications: { include: { statusEvents: true, interviews: true, offer: true } }, roadmaps: { include: { milestones: true } }, referrals: true, placementRequests: { include: { messages: true } } } });
  if (u.role === 'ALUMNI') data.alumniProfile = await prisma.alumniProfile.findUnique({ where: { userId: u.id }, include: { employment: true, referrals: true, sessions: true } });
  await prisma.privacyRequest.create({ data: { userId: u.id, type: 'DATA_EXPORT', status: 'COMPLETED', completedAt: new Date() } });
  await audit(req, { action: 'privacy.export', entityType: 'User', entityId: u.id });
  return data;
}

// Account deletion = anonymisation. Aggregate records (applications, audit history) are kept without personal data.
export async function deleteAccount(req, passwordPlain) {
  const u = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (u.role === 'ADMIN') throw forbidden('Administrator accounts must be removed by another administrator');
  if (!(await bcrypt.compare(passwordPlain, u.passwordHash))) throw badRequest('Password is incorrect');
  const docs = await prisma.document.findMany({ where: { ownerId: u.id, deletedAt: null } });
  for (const d of docs) await fs.unlink(path.join(env.uploadRoot, d.storageKey)).catch(() => {});
  await prisma.$transaction(async (tx) => {
    await tx.document.updateMany({ where: { ownerId: u.id }, data: { deletedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId: u.id } });
    await tx.emailToken.deleteMany({ where: { userId: u.id } });
    await tx.notification.deleteMany({ where: { userId: u.id } });
    if (u.role === 'STUDENT') {
      const sp = await tx.studentProfile.findUnique({ where: { userId: u.id } });
      if (sp) {
        await tx.consentGrant.updateMany({ where: { studentId: sp.id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.credentialToken.updateMany({ where: { studentId: sp.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'Account deleted' } });
        await tx.application.updateMany({ where: { studentId: sp.id, status: { in: ['SUBMITTED', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'SELECTED'] } }, data: { status: 'WITHDRAWN' } });
        await tx.project.deleteMany({ where: { studentId: sp.id } });
        await tx.certification.deleteMany({ where: { studentId: sp.id } });
        await tx.studentProfile.update({ where: { id: sp.id }, data: { bio: null, careerInterests: [], targetRole: null, studentIdNumber: null, registrationNumber: null, enrollmentNumber: null } });
      }
    }
    if (u.role === 'ALUMNI') await tx.alumniProfile.update({ where: { userId: u.id }, data: { bio: null, linkedinUrl: null, currentEmployer: null, currentRole: null, expertise: [] } });
    await tx.privacyRequest.create({ data: { userId: u.id, type: 'ACCOUNT_DELETION', status: 'COMPLETED', completedAt: new Date() } });
    await tx.user.update({ where: { id: u.id }, data: { email: `deleted-${u.id}@deleted.invalid`, fullName: 'Deleted user', phone: null, passwordHash: await bcrypt.hash(randomToken(24), 10), status: 'DELETED' } });
  });
  await audit(null, { actorId: u.id, action: 'privacy.account_deleted', entityType: 'User', entityId: u.id, severity: 'SECURITY' });
  return { deleted: true };
}
