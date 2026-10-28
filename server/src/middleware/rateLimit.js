import rateLimit from 'express-rate-limit';

const make = (windowMs, limit, message, keyGenerator) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator,
  handler: (req, res) => res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message } }),
});

export const globalLimiter = make(15 * 60 * 1000, 600, 'Too many requests. Please slow down.');
export const authLimiter = make(15 * 60 * 1000, 30, 'Too many attempts. Please wait 15 minutes and try again.');
export const sensitiveLimiter = make(60 * 60 * 1000, 10, 'Too many requests of this kind. Please try later.');
export const publicFormLimiter = make(60 * 60 * 1000, 5, 'Too many messages. Please try later.');
export const aiLimiter = make(60 * 60 * 1000, 10, 'AI request limit reached for this hour.', (req) => req.user?.id || req.ip);
