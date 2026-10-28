import env from '../config/env.js';
import { AppError, forbidden } from '../utils/errors.js';
import { safeEqual } from '../utils/crypto.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

// 1) Reject cross-origin browser requests. 2) For signed-in users require the per-session CSRF token header.
export function csrfProtect(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== env.CLIENT_ORIGIN) return next(forbidden('Cross-origin request blocked'));
  if (req.session) {
    const token = req.get('x-csrf-token');
    if (!token || !safeEqual(token, req.session.csrfToken)) {
      return next(new AppError(403, 'CSRF_INVALID', 'Security token missing or invalid. Refresh the page and try again.'));
    }
  }
  next();
}
