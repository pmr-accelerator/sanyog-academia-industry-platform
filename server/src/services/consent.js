import prisma from '../db.js';
import { notFound } from '../utils/errors.js';
import { audit } from './audit.js';

export const listConsents = (student) => prisma.consentGrant.findMany({ where: { studentId: student.id }, orderBy: { grantedAt: 'desc' } });
export async function revokeConsent(student, id) {
  const g = await prisma.consentGrant.findFirst({ where: { id, studentId: student.id, revokedAt: null } });
  if (!g) throw notFound();
  await prisma.consentGrant.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit(null, { actorId: student.userId, action: 'consent.revoke', entityType: 'ConsentGrant', entityId: id });
  return { revoked: true };
}
export async function hasDiscoveryConsent(studentId) {
  return Boolean(await prisma.consentGrant.findFirst({ where: { studentId, scope: 'ALUMNI_DISCOVERY', revokedAt: null } }));
}
export async function setDiscovery(student, allow) {
  const cur = await prisma.consentGrant.findFirst({ where: { studentId: student.id, scope: 'ALUMNI_DISCOVERY', revokedAt: null } });
  if (allow && !cur) await prisma.consentGrant.create({ data: { studentId: student.id, scope: 'ALUMNI_DISCOVERY', fields: ['name', 'department', 'skills'] } });
  if (!allow && cur) await prisma.consentGrant.update({ where: { id: cur.id }, data: { revokedAt: new Date() } });
  return { allowed: allow };
}
