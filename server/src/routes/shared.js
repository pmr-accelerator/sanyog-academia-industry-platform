import { Router } from 'express';
import fs from 'node:fs/promises';
import { z } from 'zod';
import prisma from '../db.js';
import { h, parse, pageParams, pageMeta, paged } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { sensitiveLimiter } from '../middleware/rateLimit.js';
import { badRequest, notFound } from '../utils/errors.js';
import * as docs from '../services/documents.js';
import * as privacy from '../services/privacy.js';
import { id } from '../validators/common.js';

const r = Router();
r.use(requireAuth({ allowPending: true }));

// Notifications
r.get('/notifications', h(async (req) => {
  const p = pageParams(req.query, 30);
  const where = { userId: req.user.id, ...(req.query.unread === 'true' ? { readAt: null } : {}) };
  const [total, rows, unread] = await Promise.all([prisma.notification.count({ where }), prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }), prisma.notification.count({ where: { userId: req.user.id, readAt: null } })]);
  return paged({ items: rows, unread }, pageMeta(p, total));
}));
r.post('/notifications/read-all', h(async (req) => { await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } }); return { ok: true }; }));
r.post('/notifications/:id/read', h(async (req) => { const n = await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { readAt: new Date() } }); if (!n.count) throw notFound(); return { ok: true }; }));

// Documents (private storage; downloads are streamed only after an authorisation check)
r.post('/documents', sensitiveLimiter, upload.single('file'), h(async (req) => {
  if (!req.file) throw badRequest('Choose a file to upload');
  const kind = parse(z.object({ kind: z.string() }), req.body).kind;
  const d = await docs.saveUpload(req.user, req.file, kind);
  return { id: d.id, kind: d.kind, originalName: d.originalName, sizeBytes: d.sizeBytes };
}, 201));
r.get('/documents', h((req) => docs.listMyDocuments(req.user.id)));
r.get('/documents/:id/download', async (req, res, next) => { try { await docs.streamDocument(req.user, req.params.id, res); } catch (e) { next(e); } });
r.delete('/documents/:id', h(async (req) => { await docs.deleteDocument(req.user, req.params.id); return { deleted: true }; }));

// Privacy
r.get('/privacy/export', sensitiveLimiter, h((req) => privacy.exportData(req)));
r.post('/privacy/delete', sensitiveLimiter, h((req) => privacy.deleteAccount(req, parse(z.object({ password: z.string().min(1).max(128), confirm: z.literal('DELETE') }), req.body).password)));

export default r;
export { id };
