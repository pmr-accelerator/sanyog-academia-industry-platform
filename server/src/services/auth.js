import bcrypt from 'bcryptjs';
import prisma from '../db.js';
import env from '../config/env.js';
import { randomToken, hashToken } from '../utils/crypto.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { sendMail } from './mail.js';
import { audit } from './audit.js';
import { cookieOptions, COOKIE } from '../middleware/auth.js';

const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);
const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_ROUNDS);

async function issueEmailToken(userId, purpose, hours) {
  const raw = randomToken(32);
  await prisma.emailToken.create({ data: { userId, purpose, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + hours * 3600e3) } });
  return raw;
}
async function sendVerification(user) {
  const raw = await issueEmailToken(user.id, 'VERIFY_EMAIL', 48);
  await sendMail({ to: user.email, subject: `Verify your ${env.PLATFORM_NAME} email`, text: `Hello ${user.fullName},\n\nVerify your email: ${env.CLIENT_ORIGIN}/verify-email?token=${raw}\n\nThis link expires in 48 hours. If you did not register, ignore this message.` });
}

// ── Status management ────────────────────────────────────────────────────────
export async function recomputeUserStatus(userId, db = prisma) {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || u.status === 'SUSPENDED' || u.status === 'DELETED') return u;
  let approved = false;
  if (u.role === 'STUDENT') approved = (await db.studentProfile.findUnique({ where: { userId } }))?.registrationStatus === 'VERIFIED';
  else if (u.role === 'ALUMNI') approved = (await db.alumniProfile.findUnique({ where: { userId } }))?.verificationStatus === 'VERIFIED';
  else if (u.role === 'COLLEGE_AUTHORITY') approved = Boolean(await db.institutionMembership.findFirst({ where: { userId, approvedAt: { not: null }, institution: { status: 'VERIFIED' } } }));
  else if (u.role === 'INDUSTRY') approved = Boolean(await db.organizationMember.findFirst({ where: { userId, organization: { status: 'VERIFIED' } } }));
  else if (u.role === 'ADMIN') approved = true;
  const status = !u.emailVerifiedAt ? 'PENDING_EMAIL' : approved ? 'ACTIVE' : 'PENDING_APPROVAL';
  return status === u.status ? u : db.user.update({ where: { id: userId }, data: { status } });
}

// ── Registration (one function per role; all create PENDING accounts) ───────
async function ensureEmailFree(email) {
  if (await prisma.user.findUnique({ where: { email } })) throw conflict('An account with this email already exists');
}
const baseUser = async (d, role) => ({ email: d.email, passwordHash: await hashPassword(d.password), role, fullName: d.fullName, phone: d.phone, status: 'PENDING_EMAIL' });

export async function registerStudent(d) {
  await ensureEmailFree(d.email);
  const inst = await prisma.institution.findUnique({ where: { id: d.institutionId } });
  if (!inst || inst.status !== 'VERIFIED') throw badRequest('Choose a verified institution');
  const required = inst.registrationRules?.requiredStudentFields || [];
  const missing = required.filter((f) => !d[f]);
  if (missing.length) throw badRequest(`${inst.name} requires: ${missing.join(', ')}`);
  if (d.departmentId && !(await prisma.department.findFirst({ where: { id: d.departmentId, institutionId: inst.id } }))) throw badRequest('Department does not belong to this institution');
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: await baseUser(d, 'STUDENT') });
    const p = await tx.studentProfile.create({ data: { userId: u.id, institutionId: inst.id, departmentId: d.departmentId, degree: d.degree, academicYear: d.academicYear, semester: d.semester, graduationYear: d.graduationYear, studentIdNumber: d.studentIdNumber, registrationNumber: d.registrationNumber, enrollmentNumber: d.enrollmentNumber, registrationStatus: 'SUBMITTED' } });
    await tx.verificationRequest.create({ data: { institutionId: inst.id, studentId: p.id, subjectType: 'ENROLLMENT', subjectId: p.id } });
    return u;
  });
  await sendVerification(user);
  return { id: user.id };
}

export async function registerCollege(d) {
  await ensureEmailFree(d.email);
  let institutionId = d.institutionId;
  const user = await prisma.$transaction(async (tx) => {
    if (!institutionId) {
      if (!d.newInstitution) throw badRequest('Select an institution or provide details for a new one');
      if (d.newInstitution.institutionCode && await tx.institution.findUnique({ where: { institutionCode: d.newInstitution.institutionCode } })) throw conflict('An institution with this code is already registered');
      institutionId = (await tx.institution.create({ data: { ...d.newInstitution, status: 'PENDING' } })).id;
    } else if (!(await tx.institution.findUnique({ where: { id: institutionId } }))) throw badRequest('Institution not found');
    const u = await tx.user.create({ data: await baseUser(d, 'COLLEGE_AUTHORITY') });
    // approvedAt stays NULL until a platform admin (new institution) or an approved colleague approves.
    await tx.institutionMembership.create({ data: { userId: u.id, institutionId, title: d.title, canVerifyCredentials: true, canManagePartnerships: !d.institutionId, isPlacementOfficer: false } });
    return u;
  });
  await sendVerification(user);
  return { id: user.id };
}

export async function registerIndustry(d) {
  await ensureEmailFree(d.email);
  if (d.organization.registrationNumber && await prisma.organization.findUnique({ where: { registrationNumber: d.organization.registrationNumber } })) throw conflict('An organization with this registration number already exists');
  const user = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { ...d.organization, repName: d.repName, repDesignation: d.repDesignation, status: 'PENDING' } });
    const u = await tx.user.create({ data: await baseUser(d, 'INDUSTRY') });
    await tx.organizationMember.create({ data: { userId: u.id, organizationId: org.id, title: d.repDesignation, isOwner: true } });
    return u;
  });
  await sendVerification(user);
  return { id: user.id };
}

export async function registerAlumni(d) {
  await ensureEmailFree(d.email);
  const inst = await prisma.institution.findUnique({ where: { id: d.institutionId } });
  if (!inst || inst.status !== 'VERIFIED') throw badRequest('Choose a verified institution');
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: await baseUser(d, 'ALUMNI') });
    const a = await tx.alumniProfile.create({ data: { userId: u.id, institutionId: inst.id, departmentId: d.departmentId, degree: d.degree, graduationYear: d.graduationYear, currentEmployer: d.currentEmployer, currentRole: d.currentRole, expertise: d.expertise || [], bio: d.bio, linkedinUrl: d.linkedinUrl, verificationStatus: 'SUBMITTED' } });
    await tx.verificationRequest.create({ data: { institutionId: inst.id, alumniId: a.id, subjectType: 'ALUMNI_GRADUATION', subjectId: a.id } });
    return u;
  });
  await sendVerification(user);
  return { id: user.id };
}

// ── Email verification / password flows ──────────────────────────────────────
export async function verifyEmail(raw) {
  const tok = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(raw || '') } });
  if (!tok || tok.purpose !== 'VERIFY_EMAIL' || tok.usedAt || tok.expiresAt < new Date()) throw badRequest('This verification link is invalid or has expired');
  await prisma.$transaction([prisma.emailToken.update({ where: { id: tok.id }, data: { usedAt: new Date() } }), prisma.user.update({ where: { id: tok.userId }, data: { emailVerifiedAt: new Date() } })]);
  const u = await recomputeUserStatus(tok.userId);
  return { status: u.status };
}
export async function resendVerification(email) {
  const u = await prisma.user.findUnique({ where: { email } });
  if (u && !u.emailVerifiedAt && u.status === 'PENDING_EMAIL') await sendVerification(u);
  return { sent: true }; // identical response whether or not the account exists
}
export async function forgotPassword(email) {
  const u = await prisma.user.findUnique({ where: { email } });
  if (u && !['DELETED', 'SUSPENDED'].includes(u.status)) {
    const raw = await issueEmailToken(u.id, 'RESET_PASSWORD', 1);
    await sendMail({ to: u.email, subject: `Reset your ${env.PLATFORM_NAME} password`, text: `Reset your password: ${env.CLIENT_ORIGIN}/reset-password?token=${raw}\n\nThis link expires in 1 hour. If you did not ask for it, ignore this message.` });
  }
  return { sent: true };
}
export async function resetPassword(raw, newPassword) {
  const tok = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(raw || '') } });
  if (!tok || tok.purpose !== 'RESET_PASSWORD' || tok.usedAt || tok.expiresAt < new Date()) throw badRequest('This reset link is invalid or has expired');
  await prisma.$transaction([
    prisma.emailToken.update({ where: { id: tok.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: tok.userId }, data: { passwordHash: await hashPassword(newPassword), failedLoginCount: 0, lockedUntil: null, mustChangePassword: false } }),
    prisma.session.deleteMany({ where: { userId: tok.userId } }),
  ]);
  return { reset: true };
}
export async function changePassword(req, current, next) {
  const u = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(current, u.passwordHash))) throw badRequest('Current password is incorrect');
  if (current === next) throw badRequest('Choose a different password');
  await prisma.$transaction([
    prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } }),
    prisma.session.deleteMany({ where: { userId: u.id, NOT: { id: req.session.id } } }),
  ]);
  await audit(req, { action: 'auth.password_changed', entityType: 'User', entityId: u.id });
  return { changed: true };
}

// ── Login / sessions ────────────────────────────────────────────────────────
export async function login(req, res, email, pw) {
  const u = await prisma.user.findUnique({ where: { email } });
  const bad = () => new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  if (!u || u.status === 'DELETED') { await bcrypt.compare(pw, DUMMY_HASH); await audit(req, { action: 'auth.login_failed', severity: 'WARNING', metadata: { reason: 'unknown_account' } }); throw bad(); }
  if (u.lockedUntil && u.lockedUntil > new Date()) throw new AppError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in a few minutes.');
  const ok = await bcrypt.compare(pw, u.passwordHash);
  if (!ok) {
    const count = u.failedLoginCount + 1;
    await prisma.user.update({ where: { id: u.id }, data: { failedLoginCount: count, lockedUntil: count >= 5 ? new Date(Date.now() + 15 * 60e3) : null } });
    await audit(req, { action: 'auth.login_failed', actorId: u.id, severity: count >= 5 ? 'SECURITY' : 'WARNING', metadata: { attempts: count } });
    throw bad();
  }
  if (u.status === 'SUSPENDED') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account has been suspended. Contact support.');
  if (u.status === 'PENDING_EMAIL') throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email first. Check your inbox for the link.');
  await prisma.user.update({ where: { id: u.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const raw = randomToken(32);
  const session = await prisma.session.create({ data: { userId: u.id, tokenHash: hashToken(raw), csrfToken: randomToken(24), ip: req.ip, userAgent: (req.get('user-agent') || '').slice(0, 250), expiresAt: new Date(Date.now() + 7 * 864e5) } });
  res.cookie(COOKIE, raw, cookieOptions());
  await audit(req, { action: 'auth.login', actorId: u.id });
  const adminGrants = u.role === 'ADMIN' ? await prisma.adminGrant.findMany({ where: { userId: u.id } }) : [];
  return { user: { ...u, adminGrants }, session };
}

export async function logout(req, res) {
  if (req.session) await prisma.session.delete({ where: { id: req.session.id } }).catch(() => {});
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
  return { loggedOut: true };
}

export async function me(req) {
  const u = req.user;
  const out = {
    platformName: env.PLATFORM_NAME,
    csrfToken: req.session.csrfToken,
    user: { id: u.id, email: u.email, fullName: u.fullName, role: u.role, status: u.status, mustChangePassword: u.mustChangePassword },
    permissions: u.role === 'ADMIN' ? u.adminGrants.map((g) => g.permission) : [],
  };
  if (u.role === 'STUDENT') {
    const p = await prisma.studentProfile.findUnique({ where: { userId: u.id }, include: { institution: true, department: true } });
    out.profile = p && { id: p.id, institutionId: p.institutionId, institutionName: p.institution.name, department: p.department?.name || null, discipline: p.department?.discipline || null, registrationStatus: p.registrationStatus };
  } else if (u.role === 'COLLEGE_AUTHORITY') {
    const ms = await prisma.institutionMembership.findMany({ where: { userId: u.id }, include: { institution: true } });
    out.memberships = ms.map((m) => ({ institutionId: m.institutionId, name: m.institution.name, institutionStatus: m.institution.status, approved: Boolean(m.approvedAt), canVerifyCredentials: m.canVerifyCredentials, canManagePartnerships: m.canManagePartnerships, isPlacementOfficer: m.isPlacementOfficer }));
  } else if (u.role === 'INDUSTRY') {
    const m = await prisma.organizationMember.findFirst({ where: { userId: u.id }, include: { organization: true } });
    out.organization = m && { id: m.organizationId, name: m.organization.displayName, status: m.organization.status };
  } else if (u.role === 'ALUMNI') {
    const a = await prisma.alumniProfile.findUnique({ where: { userId: u.id }, include: { institution: true } });
    out.profile = a && { id: a.id, institutionId: a.institutionId, institutionName: a.institution.name, verificationStatus: a.verificationStatus };
  }
  return out;
}
