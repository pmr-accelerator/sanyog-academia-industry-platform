import prisma from '../db.js';
import env from '../config/env.js';
import { hashToken } from '../utils/crypto.js';
import { AppError, unauthorized } from '../utils/errors.js';

export const COOKIE = 'sanyog_sid';
const IDLE_MS = 8 * 60 * 60 * 1000; // sign out after 8 hours without activity
const TOUCH_MS = 5 * 60 * 1000;

export function cookieOptions() {
  return { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAMESITE, path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 };
}

// Loads the session (if any) from the HTTP-only cookie. The raw cookie value is never stored.
export async function attachSession(req, res, next) {
  try {
    const raw = req.cookies?.[COOKIE];
    if (!raw) return next();
    const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(raw) }, include: { user: { include: { adminGrants: true } } } });
    const now = Date.now();
    if (!session || session.expiresAt.getTime() < now || now - session.lastSeenAt.getTime() > IDLE_MS) {
      if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
      req.sessionExpired = Boolean(session);
      return next();
    }
    if (now - session.lastSeenAt.getTime() > TOUCH_MS) {
      await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
    }
    const { user, ...rest } = session;
    req.session = rest;
    req.user = user;
    next();
  } catch (e) { next(e); }
}

// opts.allowPending: let PENDING_APPROVAL users through (status page, uploads)
// opts.allowMustChange: let users with a forced password change through (the change-password route)
export const requireAuth = (opts = {}) => (req, res, next) => {
  if (!req.user) return next(req.sessionExpired ? new AppError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.') : unauthorized());
  const { status } = req.user;
  if (status === 'PENDING_APPROVAL' && !opts.allowPending) return next(new AppError(403, 'ACCOUNT_PENDING', 'Your account is awaiting approval.'));
  if (status !== 'ACTIVE' && status !== 'PENDING_APPROVAL') return next(new AppError(403, 'ACCOUNT_INACTIVE', 'This account is not active.'));
  if (req.user.mustChangePassword && !opts.allowMustChange) return next(new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'You must change your password before continuing.'));
  next();
};
