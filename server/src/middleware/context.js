// Authorization building blocks. Every protected route composes: requireAuth → requireRole → a context loader.
// Loaders attach the caller's own scope (student profile / institutions / organization) so services can
// enforce institution and organization boundaries instead of trusting ids sent by the client.
import prisma from '../db.js';
import { forbidden } from '../utils/errors.js';

export const requireRole = (...roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : next(forbidden()));

export const requireAdminPerm = (perm) => (req, res, next) =>
  req.user.role === 'ADMIN' && req.user.adminGrants.some((g) => g.permission === perm) ? next() : next(forbidden(`Missing admin permission: ${perm}`));

export async function studentContext(req, res, next) {
  try {
    const p = await prisma.studentProfile.findUnique({ where: { userId: req.user.id }, include: { department: true, institution: true } });
    if (!p) return next(forbidden('Student profile not found'));
    req.student = p;
    next();
  } catch (e) { next(e); }
}

export async function collegeContext(req, res, next) {
  try {
    const ms = await prisma.institutionMembership.findMany({ where: { userId: req.user.id, approvedAt: { not: null } }, include: { institution: true } });
    req.memberships = ms.filter((m) => m.institution.status === 'VERIFIED');
    if (!req.memberships.length) return next(forbidden('No verified institution is linked to your account'));
    req.institutionIds = req.memberships.map((m) => m.institutionId);
    // Default institution = ?institutionId if the user belongs to it, otherwise the first membership.
    const wanted = req.query.institutionId || req.body?.institutionId;
    req.membership = req.memberships.find((m) => m.institutionId === wanted) || req.memberships[0];
    req.institutionId = req.membership.institutionId;
    next();
  } catch (e) { next(e); }
}
// Throws unless the caller belongs to the institution (optionally with a given capability flag).
export function assertInstitution(req, institutionId, flag) {
  const m = req.memberships.find((x) => x.institutionId === institutionId);
  if (!m || (flag && !m[flag])) throw forbidden('You are not authorised for this institution');
  return m;
}
export const requireCapability = (flag) => (req, res, next) => (req.membership?.[flag] ? next() : next(forbidden('Your role at this institution does not allow this action')));

export async function orgContext(req, res, next) {
  try {
    const m = await prisma.organizationMember.findFirst({ where: { userId: req.user.id }, include: { organization: true } });
    if (!m) return next(forbidden('No organization is linked to your account'));
    req.orgMember = m;
    req.org = m.organization;
    next();
  } catch (e) { next(e); }
}
export const requireVerifiedOrg = (req, res, next) => (req.org?.status === 'VERIFIED' ? next() : next(forbidden('Your organization has not been verified yet')));

export async function alumniContext(req, res, next) {
  try {
    const a = await prisma.alumniProfile.findUnique({ where: { userId: req.user.id }, include: { institution: true, department: true } });
    if (!a) return next(forbidden('Alumni profile not found'));
    req.alumni = a;
    next();
  } catch (e) { next(e); }
}
export const requireVerifiedAlumni = (req, res, next) => (req.alumni?.verificationStatus === 'VERIFIED' ? next() : next(forbidden('Your alumni status has not been verified yet')));
