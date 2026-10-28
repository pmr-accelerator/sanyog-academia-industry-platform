import env from '../config/env.js';
import prisma from '../db.js';
import { AppError } from '../utils/errors.js';

export const recentErrors = []; // in-memory ring buffer shown on the admin health page (no stack traces)

export const notFoundHandler = (req, res) => res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });

export async function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (res.headersSent) return;
  let status = 500; let code = 'INTERNAL_ERROR'; let message = 'Something went wrong. Please try again later.'; let details;

  if (err instanceof AppError) { ({ status, code, message, details } = err); }
  else if (err?.code === 'P2002') { status = 409; code = 'DUPLICATE'; message = 'This record already exists.'; }
  else if (err?.code === 'P2025') { status = 404; code = 'NOT_FOUND'; message = 'Record not found.'; }
  else if (err?.code === 'P2003') { status = 409; code = 'IN_USE'; message = 'This record is linked to other data and cannot be changed this way.'; }
  else if (err?.type === 'entity.parse.failed') { status = 400; code = 'BAD_JSON'; message = 'Malformed JSON body.'; }
  else if (err?.type === 'entity.too.large') { status = 413; code = 'TOO_LARGE'; message = 'Request body too large.'; }
  else if (err?.name === 'MulterError') { status = 400; code = 'UPLOAD_ERROR'; message = err.code === 'LIMIT_FILE_SIZE' ? `File is larger than ${env.MAX_UPLOAD_MB} MB.` : 'Upload failed.'; }

  if (status >= 500) {
    // Log server-side only; the client never sees internals.
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err?.stack || err);
    const entry = { at: new Date().toISOString(), method: req.method, path: req.originalUrl.split('?')[0], code: err?.code || err?.name || 'ERROR' };
    recentErrors.unshift(entry); recentErrors.length = Math.min(recentErrors.length, 50);
    prisma.auditEvent.create({ data: { actorId: req.user?.id ?? null, action: 'system.error', severity: 'WARNING', metadata: entry } }).catch(() => {});
  }
  res.status(status).json({ ok: false, error: { code, message, ...(details ? { details } : {}) } });
}
