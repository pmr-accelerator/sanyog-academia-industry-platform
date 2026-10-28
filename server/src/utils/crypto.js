import crypto from 'node:crypto';
import env from '../config/env.js';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const hmac = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('hex');
export const hashToken = (raw) => hmac(env.SESSION_SECRET, raw);
export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Deterministic JSON so signatures are stable regardless of key order.
export function canonicalJson(obj) {
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
  if (obj && typeof obj === 'object') {
    return '{' + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
  }
  return JSON.stringify(obj);
}
export const signClaims = (claims) => hmac(env.CREDENTIAL_SIGNING_KEY, canonicalJson(claims));
