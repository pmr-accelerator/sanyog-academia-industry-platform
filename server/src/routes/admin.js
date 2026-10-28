import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { h, parse, pageParams, pageMeta, paged } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireAdminPerm } from '../middleware/context.js';
import { id, shortText, optText, optUrl } from '../validators/common.js';
import * as admin from '../services/admin.js';
import * as analytics from '../services/analytics.js';
import * as resources from '../services/resources.js';

const r = Router();
r.use(requireAuth(), requireRole('ADMIN'));
const PERMS = ['MANAGE_USERS', 'VERIFY_INSTITUTIONS', 'VERIFY_ORGANIZATIONS', 'VIEW_AUDIT', 'MANAGE_TAXONOMY', 'MANAGE_RESOURCES', 'MANAGE_CONFIG', 'VIEW_AI_USAGE', 'MODERATE_CONTENT', 'VIEW_ANALYTICS', 'VIEW_SYSTEM_HEALTH'];
const decision = z.object({ status: z.enum(['VERIFIED', 'REJECTED', 'SUSPENDED']), note: optText(500) });

r.get('/analytics', requireAdminPerm('VIEW_ANALYTICS'), h(() => analytics.admin()));
r.get('/fairness', requireAdminPerm('VIEW_ANALYTICS'), h(() => analytics.fairness(5)));
r.get('/health', requireAdminPerm('VIEW_SYSTEM_HEALTH'), h(() => admin.health()));

r.get('/users', requireAdminPerm('MANAGE_USERS'), h(async (req) => { const p = pageParams(req.query); const { total, rows } = await admin.listUsers(req.query, p); return paged(rows, pageMeta(p, total)); }));
r.post('/users/:id/status', requireAdminPerm('MANAGE_USERS'), h((req) => { const d = parse(z.object({ status: z.enum(['SUSPENDED', 'ACTIVE']), reason: optText(500) }), req.body); return admin.setUserStatus(req, req.params.id, d.status, d.reason); }));
r.put('/users/:id/permissions', requireAdminPerm('MANAGE_USERS'), h((req) => admin.setGrants(req, req.params.id, parse(z.object({ permissions: z.array(z.enum(PERMS)) }), req.body).permissions)));

r.get('/institutions', requireAdminPerm('VERIFY_INSTITUTIONS'), h((req) => admin.listInstitutions(req.query.status)));
r.post('/institutions/:id/decision', requireAdminPerm('VERIFY_INSTITUTIONS'), h((req) => { const d = parse(decision, req.body); return admin.decideInstitution(req, req.params.id, d.status, d.note); }));
r.get('/memberships/pending', requireAdminPerm('VERIFY_INSTITUTIONS'), h(() => admin.pendingMemberships()));
r.get('/organizations', requireAdminPerm('VERIFY_ORGANIZATIONS'), h((req) => admin.listOrganizations(req.query.status)));
r.post('/organizations/:id/decision', requireAdminPerm('VERIFY_ORGANIZATIONS'), h((req) => { const d = parse(decision, req.body); return admin.decideOrganization(req, req.params.id, d.status, d.note); }));

r.get('/audit', requireAdminPerm('VIEW_AUDIT'), h(async (req) => { const p = pageParams(req.query, 50); const { total, rows } = await admin.listAudit(req.query, p); return paged(rows, pageMeta(p, total)); }));

r.get('/taxonomies', requireAdminPerm('MANAGE_TAXONOMY'), h(() => admin.listTaxonomies()));
r.post('/taxonomies', requireAdminPerm('MANAGE_TAXONOMY'), h((req) => admin.createTaxonomy(parse(z.object({ name: shortText(120), version: shortText(40), isOfficial: z.boolean().default(false), sourceUrl: optUrl, notes: optText(500) }), req.body)), 201));
const skillSchema = z.object({ taxonomyId: id, name: shortText(120), category: shortText(60), disciplines: z.array(shortText(30)).max(8).default([]), nsqfLevel: z.coerce.number().int().min(1).max(10).optional(), externalCode: optText(60) });
r.get('/taxonomies/:id/skills', requireAdminPerm('MANAGE_TAXONOMY'), h((req) => prisma.skill.findMany({ where: { taxonomyId: req.params.id }, orderBy: { name: 'asc' } })));
r.post('/skills', requireAdminPerm('MANAGE_TAXONOMY'), h((req) => admin.saveSkill(null, parse(skillSchema, req.body)), 201));
r.put('/skills/:id', requireAdminPerm('MANAGE_TAXONOMY'), h((req) => admin.saveSkill(req.params.id, parse(skillSchema, req.body))));
r.delete('/skills/:id', requireAdminPerm('MANAGE_TAXONOMY'), h(async (req) => { await admin.deleteSkill(req.params.id); return { deleted: true }; }));

r.get('/settings', requireAdminPerm('MANAGE_CONFIG'), h(() => admin.listSettings()));
r.put('/settings/:key', requireAdminPerm('MANAGE_CONFIG'), h((req) => admin.setSetting(req, req.params.key, req.body?.value)));
r.get('/ai-usage', requireAdminPerm('VIEW_AI_USAGE'), h(() => admin.aiUsage()));

const resSchema = z.object({ title: shortText(200), description: optText(1000), url: z.string().url().max(500).refine((u) => /^https:\/\//i.test(u), 'Resource links must use https://'), type: z.enum(['BOOK', 'OPEN_TEXTBOOK', 'RESEARCH_PAPER', 'COURSE', 'DOCUMENTATION', 'TUTORIAL', 'PRACTICE', 'PROJECT_IDEA', 'CERTIFICATION_PREP']), provider: optText(100), licenseNote: optText(200), isExternal: z.boolean().default(true), disciplines: z.array(shortText(30)).max(8).default([]), academicYears: z.array(z.number().int().min(1).max(6)).max(6).default([]), skillIds: z.array(id).max(15).optional(), language: z.string().max(10).default('en') });
r.get('/resources', requireAdminPerm('MANAGE_RESOURCES'), h(async (req) => { const p = pageParams(req.query); const { total, rows } = await resources.adminList(req.query, p); return paged(rows, pageMeta(p, total)); }));
r.post('/resources', requireAdminPerm('MANAGE_RESOURCES'), h((req) => resources.adminSave(req.user.id, null, parse(resSchema, req.body)), 201));
r.put('/resources/:id', requireAdminPerm('MANAGE_RESOURCES'), h((req) => resources.adminSave(req.user.id, req.params.id, parse(resSchema, req.body))));
r.post('/resources/:id/status', requireAdminPerm('MANAGE_RESOURCES'), h((req) => resources.adminVerify(req.params.id, parse(z.object({ status: z.string() }), req.body).status)));

r.get('/moderation/opportunities', requireAdminPerm('MODERATE_CONTENT'), h(async (req) => { const p = pageParams(req.query); const { total, rows } = await admin.moderationOpportunities(req.query, p); return paged(rows, pageMeta(p, total)); }));
r.post('/moderation/opportunities/:id/takedown', requireAdminPerm('MODERATE_CONTENT'), h((req) => admin.takedown(req, req.params.id, parse(z.object({ reason: shortText(500) }), req.body).reason)));
r.get('/moderation/messages', requireAdminPerm('MODERATE_CONTENT'), h(() => admin.listMessages()));
r.post('/moderation/messages/:id/handled', requireAdminPerm('MODERATE_CONTENT'), h((req) => admin.handleMessage(req.params.id)));
export default r;
