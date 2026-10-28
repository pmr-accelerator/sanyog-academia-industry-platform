import prisma from '../db.js';
import env from '../config/env.js';
import { randomToken, signClaims, safeEqual } from '../utils/crypto.js';
import { forbidden, notFound } from '../utils/errors.js';
import { audit } from './audit.js';

// Signed verification token: proves "this institution verified a student with these (non-personal) attributes".
// Claims deliberately exclude name, email, phone and identifiers. Revocation is checked on every verification.
export async function issue(student) {
  if (student.registrationStatus !== 'VERIFIED') throw forbidden('Only verified students can issue credentials');
  const full = await prisma.studentProfile.findUnique({ where: { id: student.id }, include: { institution: true, department: true } });
  const [skills, projects, certs, records] = await Promise.all(['studentSkill', 'project', 'certification', 'academicRecord'].map((m) => prisma[m].count({ where: { studentId: student.id, verificationStatus: 'VERIFIED' } })));
  const jti = randomToken(16);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 180 * 864e5);
  const claims = { v: 1, jti, issuer: env.PLATFORM_NAME, institution: full.institution.name, discipline: full.department?.discipline || null, degree: full.degree, graduationYear: full.graduationYear, verifiedCounts: { skills, projects, certifications: certs, academicRecords: records }, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString() };
  await prisma.credentialToken.create({ data: { studentId: student.id, jti, claims, signature: signClaims(claims), issuedAt, expiresAt } });
  await audit(null, { actorId: student.userId, action: 'credential.issue', entityType: 'CredentialToken', entityId: jti });
  return { jti, verifyPath: `/verify-credential/${jti}`, claims };
}
export const list = (student) => prisma.credentialToken.findMany({ where: { studentId: student.id }, orderBy: { issuedAt: 'desc' }, select: { jti: true, issuedAt: true, expiresAt: true, revokedAt: true, revokedReason: true, claims: true } });
export async function revoke(student, jti) {
  const t = await prisma.credentialToken.findFirst({ where: { jti, studentId: student.id, revokedAt: null } });
  if (!t) throw notFound();
  await prisma.credentialToken.update({ where: { jti }, data: { revokedAt: new Date(), revokedReason: 'Revoked by the student' } });
  return { revoked: true };
}
export async function verifyPublic(jti) {
  const t = await prisma.credentialToken.findUnique({ where: { jti }, include: { student: { select: { registrationStatus: true } } } });
  if (!t) return { valid: false, reason: 'NOT_FOUND' };
  if (!safeEqual(t.signature, signClaims(t.claims))) return { valid: false, reason: 'SIGNATURE_MISMATCH' };
  if (t.revokedAt) return { valid: false, reason: 'REVOKED' };
  if (t.expiresAt < new Date()) return { valid: false, reason: 'EXPIRED' };
  if (t.student.registrationStatus !== 'VERIFIED') return { valid: false, reason: 'NO_LONGER_VERIFIED' };
  return { valid: true, claims: t.claims };
}
