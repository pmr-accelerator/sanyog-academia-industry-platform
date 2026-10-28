import { Router } from 'express';
import { z } from 'zod';
import { h, parse, pageParams, pageMeta, paged } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, collegeContext, requireCapability } from '../middleware/context.js';
import { id, shortText, optText, optUrl } from '../validators/common.js';
import * as S from '../validators/schemas.js';
import * as college from '../services/college.js';
import * as verification from '../services/verification.js';
import * as partnership from '../services/partnership.js';
import * as opps from '../services/opportunity.js';
import * as apps from '../services/application.js';
import * as placement from '../services/placement.js';
import * as analytics from '../services/analytics.js';

const r = Router();
r.use(requireAuth(), requireRole('COLLEGE_AUTHORITY'), collegeContext);
const actor = (req) => ({ kind: 'college', user: req.user, membership: req.membership, memberships: req.memberships });

r.get('/dashboard', h((req) => analytics.college(req.institutionId)));

// Verification queue
r.get('/verification', requireCapability('canVerifyCredentials'), h(async (req) => { const p = pageParams(req.query); const { total, rows } = await verification.queue(req.institutionId, { status: req.query.status, subjectType: req.query.subjectType }, p); return paged(rows, pageMeta(p, total)); }));
r.get('/verification/:id', h((req) => verification.getRequest(req, req.params.id)));
r.post('/verification/:id/claim', h((req) => verification.claim(req, req.params.id)));
r.post('/verification/:id/decide', h((req) => verification.decide(req, req.params.id, parse(z.object({ decision: z.enum(['VERIFIED', 'REJECTED', 'CHANGES_REQUESTED']), reason: optText(1000) }), req.body))));
r.post('/verification/:id/revoke', h((req) => verification.revoke(req, req.params.id, parse(z.object({ reason: shortText(1000) }), req.body).reason)));

// Roster, alumni, departments, settings, team
r.get('/students', h(async (req) => { const p = pageParams(req.query); const { total, rows } = await college.roster(req.institutionId, req.query, p); return paged(rows, pageMeta(p, total)); }));
r.get('/alumni', h((req) => college.alumniList(req.institutionId)));
r.get('/departments', h((req) => college.listDepartments(req.institutionId)));
const deptSchema = z.object({ name: shortText(120), code: optText(20), discipline: S.disciplineKey });
r.post('/departments', requireCapability('canManagePartnerships'), h((req) => college.saveDepartment(req.institutionId, null, parse(deptSchema, req.body)), 201));
r.put('/departments/:id', requireCapability('canManagePartnerships'), h((req) => college.saveDepartment(req.institutionId, req.params.id, parse(deptSchema, req.body))));
r.delete('/departments/:id', requireCapability('canManagePartnerships'), h(async (req) => { await college.deleteDepartment(req.institutionId, req.params.id); return { deleted: true }; }));
r.get('/settings', h((req) => college.getSettings(req.institutionId)));
const settingsSchema = z.object({
  universityName: optText(200), type: optText(80), state: optText(80), city: optText(80), website: optUrl,
  registrationRules: z.object({ requiredStudentFields: z.array(z.enum(['studentIdNumber', 'registrationNumber', 'enrollmentNumber'])).max(3) }).optional(),
  academicCalendar: z.object({ terms: z.array(z.object({ name: shortText(40), start: z.string().regex(/^\d{2}-\d{2}$/), end: z.string().regex(/^\d{2}-\d{2}$/) })).max(6) }).optional(),
  eligibilityRules: z.object({ maxBacklogsForPlacement: z.coerce.number().int().min(0).max(50).optional().nullable(), minCgpaForPlacement: z.coerce.number().min(0).max(10).optional().nullable() }).optional(),
}).strict();
r.put('/settings', requireCapability('canManagePartnerships'), h((req) => college.updateSettings(req, req.institutionId, parse(settingsSchema, req.body))));
r.get('/team', h((req) => college.team(req.institutionId)));
r.post('/team/:id/decision', h((req) => college.decideMember(req, req.params.id, parse(z.object({ approve: z.boolean(), canVerifyCredentials: z.boolean().optional(), canManagePartnerships: z.boolean().optional(), isPlacementOfficer: z.boolean().optional() }), req.body))));

// Partnerships / MoUs
r.get('/partnerships', h((req) => partnership.listForCollege(req.institutionId, req.query.status)));
r.post('/partnerships/:pid/agreements/:aid/decide', h((req) => partnership.decide(req, req.params.pid, req.params.aid, parse(z.object({ decision: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']), note: optText(1000), validFrom: z.coerce.date().optional(), validUntil: z.coerce.date().optional() }), req.body))));
r.post('/partnerships/:pid/terminate', h((req) => partnership.terminate(req, req.params.pid, parse(z.object({ reason: shortText(500) }), req.body).reason)));

// Vacancies published by the college
r.get('/opportunities', h(async (req) => { const p = pageParams(req.query); const { total, rows } = await opps.listOwn(actor(req), req.query, p); return paged(rows, pageMeta(p, total)); }));
r.post('/opportunities', h((req) => opps.create(actor(req), parse(S.opportunitySchema, req.body)), 201));
r.put('/opportunities/:id', h((req) => opps.update(actor(req), req.params.id, parse(S.opportunityUpdateSchema, req.body))));
r.post('/opportunities/:id/publish', h((req) => opps.publish(actor(req), req.params.id)));
r.post('/opportunities/:id/close', h((req) => opps.close(actor(req), req.params.id)));
r.get('/applications', h(async (req) => { const p = pageParams(req.query); const { total, rows } = await apps.listApplicants(actor(req), req.query, p); return paged(rows, pageMeta(p, total)); }));
r.get('/applications/:id', h((req) => apps.getApplicant(actor(req), req.params.id)));
r.post('/applications/:id/status', h((req) => { const d = parse(z.object({ status: z.enum(['SHORTLISTED', 'INTERVIEW_SCHEDULED', 'SELECTED', 'REJECTED']), note: optText(500) }), req.body); return apps.updateStatus(actor(req), req.params.id, d.status, d.note); }));

// Placement cell
const officer = requireCapability('isPlacementOfficer');
r.get('/placement', officer, h((req) => placement.listForCollege(req.institutionId, req.query.status)));
r.get('/placement/:id', officer, h((req) => placement.get(req, req.params.id)));
r.post('/placement/:id/messages', officer, h((req) => placement.addMessage(req, req.params.id, parse(S.messageSchema, req.body).body), 201));
r.post('/placement/:id/assign', officer, h((req) => placement.assign(req, req.params.id, parse(z.object({ officerUserId: id.optional() }), req.body).officerUserId)));
r.post('/placement/:id/appointments', officer, h((req) => placement.schedule(req, req.params.id, parse(S.interviewSchema, req.body)), 201));
r.post('/placement/:id/status', officer, h((req) => placement.setStatus(req, req.params.id, parse(z.object({ status: z.enum(['ASSIGNED', 'SCHEDULED', 'RESOLVED', 'CLOSED']), resolutionNote: optText(1500) }), req.body))));
r.post('/placement/:id/checklist/:index', officer, h((req) => placement.toggleChecklist(req, req.params.id, Number(req.params.index))));

// Reports (authorised, institution-scoped)
r.get('/reports/:kind.csv', async (req, res, next) => { try { const csv = await college.reportCsv(req, req.institutionId, req.params.kind); res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${req.params.kind}-report.csv"`); res.send(csv); } catch (e) { next(e); } });
r.get('/reports/:kind.pdf', async (req, res, next) => { try { res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${req.params.kind}-report.pdf"`); await college.reportPdf(req, req.institutionId, req.params.kind, res); } catch (e) { if (!res.headersSent) next(e); else res.end(); } });
export default r;
