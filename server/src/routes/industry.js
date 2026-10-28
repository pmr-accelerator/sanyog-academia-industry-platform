import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { h, parse, pageParams, pageMeta, paged } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, orgContext } from '../middleware/context.js';
import { id, shortText, optText, optUrl } from '../validators/common.js';
import * as S from '../validators/schemas.js';
import * as partnership from '../services/partnership.js';
import * as opps from '../services/opportunity.js';
import * as apps from '../services/application.js';
import * as referral from '../services/referral.js';
import * as analytics from '../services/analytics.js';
import { forbidden } from '../utils/errors.js';

const r = Router();
r.use(requireAuth({ allowPending: true }), requireRole('INDUSTRY'), orgContext);
const actor = (req) => ({ kind: 'org', user: req.user, org: req.org });

r.get('/organization', h((req) => req.org));
r.put('/organization', requireAuth(), h((req) => prisma.organization.update({ where: { id: req.org.id }, data: parse(z.object({ displayName: shortText(120), website: optUrl, industry: optText(80), sizeBand: optText(40), address: optText(300), repName: shortText(120), repDesignation: shortText(120) }).strict(), req.body) })));
r.get('/institutions', h(() => prisma.institution.findMany({ where: { status: 'VERIFIED' }, select: { id: true, name: true, city: true, state: true }, orderBy: { name: 'asc' } })));

r.use(requireAuth()); // below: approved accounts only
r.get('/dashboard', h((req) => analytics.industry(req.org)));
r.get('/partnerships', h((req) => partnership.listForOrg(req.org)));
r.post('/partnerships', h((req) => partnership.request(actor(req), parse(z.object({ institutionId: id, note: optText(1000) }), req.body)), 201));
r.post('/partnerships/:id/agreements', h((req) => partnership.submitAgreement(actor(req), req.params.id, parse(z.object({ documentId: id }), req.body).documentId), 201));

r.get('/opportunities', h(async (req) => { const p = pageParams(req.query); const { total, rows } = await opps.listOwn(actor(req), req.query, p); return paged(rows, pageMeta(p, total)); }));
r.get('/opportunities/:id', h((req) => opps.loadOwned(actor(req), req.params.id)));
r.post('/opportunities', h((req) => opps.create(actor(req), parse(S.opportunitySchema, req.body)), 201));
r.put('/opportunities/:id', h((req) => opps.update(actor(req), req.params.id, parse(S.opportunityUpdateSchema, req.body))));
r.post('/opportunities/:id/publish', h((req) => opps.publish(actor(req), req.params.id)));
r.post('/opportunities/:id/close', h((req) => opps.close(actor(req), req.params.id)));

r.get('/applicants', h(async (req) => { const p = pageParams(req.query); const { total, rows } = await apps.listApplicants(actor(req), req.query, p); return paged(rows, pageMeta(p, total)); }));
r.get('/applicants/:id', h((req) => apps.getApplicant(actor(req), req.params.id)));
r.post('/applicants/:id/status', h((req) => { const d = parse(z.object({ status: z.enum(['SHORTLISTED', 'SELECTED', 'REJECTED']), note: optText(500) }), req.body); return apps.updateStatus(actor(req), req.params.id, d.status, d.note); }));
r.post('/applicants/:id/interviews', h((req) => apps.scheduleInterview(actor(req), req.params.id, parse(S.interviewSchema, req.body)), 201));
r.patch('/applicants/:id/interviews/:iid', h((req) => apps.setInterviewStatus(actor(req), req.params.id, req.params.iid, parse(z.object({ status: z.enum(['COMPLETED', 'CANCELLED', 'NO_SHOW']) }), req.body).status)));
r.post('/applicants/:id/offer', h((req) => apps.makeOffer(actor(req), req.params.id, parse(z.object({ details: optText(2000), joiningDate: z.coerce.date().optional() }), req.body)), 201));
r.post('/applicants/:id/offer/withdraw', h((req) => apps.withdrawOffer(actor(req), req.params.id)));

r.get('/referrals', h((req) => referral.listForOrg(req.org)));
r.post('/referrals/:id/decision', h((req) => referral.orgDecide(req.org, req.params.id, parse(z.object({ accept: z.boolean() }), req.body).accept)));
export default r;
export { forbidden };
