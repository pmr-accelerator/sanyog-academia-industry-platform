import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { h, parse, pageParams, pageMeta, paged } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, alumniContext, requireVerifiedAlumni } from '../middleware/context.js';
import { id, shortText, optText, optUrl, year } from '../validators/common.js';
import * as referral from '../services/referral.js';
import * as opps from '../services/opportunity.js';
import * as verification from '../services/verification.js';
import * as analytics from '../services/analytics.js';
import { notFound, badRequest } from '../utils/errors.js';

const r = Router();
r.use(requireAuth({ allowPending: true }), requireRole('ALUMNI'), alumniContext);
r.get('/profile', h(async (req) => prisma.alumniProfile.findUnique({ where: { id: req.alumni.id }, include: { employment: true, institution: { select: { name: true } }, department: { select: { name: true } } } })));
r.post('/evidence', h((req) => verification.attachAlumniEvidence(req.alumni, parse(z.object({ documentIds: z.array(id).min(1).max(5) }), req.body).documentIds)));

r.use(requireAuth(), requireVerifiedAlumni);
r.put('/profile', h((req) => prisma.alumniProfile.update({ where: { id: req.alumni.id }, data: parse(z.object({ currentEmployer: optText(150), currentRole: optText(150), expertise: z.array(shortText(60)).max(15).optional(), bio: optText(1000), linkedinUrl: optUrl, availableForMentoring: z.boolean().optional() }).strict(), req.body) })));
r.post('/employment', h((req) => prisma.employmentHistory.create({ data: { ...parse(z.object({ employer: shortText(150), jobTitle: shortText(150), startYear: year, endYear: year.optional() }), req.body), alumniId: req.alumni.id } }), 201));
r.delete('/employment/:id', h(async (req) => { const n = await prisma.employmentHistory.deleteMany({ where: { id: req.params.id, alumniId: req.alumni.id } }); if (!n.count) throw notFound(); return { deleted: true }; }));
r.get('/dashboard', h((req) => analytics.alumni(req.alumni)));
r.get('/students', h(async (req) => { const p = pageParams(req.query); const { total, rows } = await referral.discoverStudents(req.alumni, req.query, p); return paged(rows, pageMeta(p, total)); }));
r.get('/opportunities', h(async (req) => { const p = pageParams(req.query); const { total, rows } = await opps.listForAlumni(req.alumni, req.query, p); return paged(rows, pageMeta(p, total)); }));
r.get('/referrals', h((req) => referral.listForAlumni(req.alumni)));
r.post('/referrals', h((req) => referral.refer(req.alumni, parse(z.object({ opportunityId: id, studentId: id, note: optText(1000) }), req.body)), 201));

const sessionSchema = z.object({ kind: z.enum(['MENTORSHIP', 'CAREER_SESSION', 'WORKSHOP']), title: shortText(150), description: shortText(2000), scheduledAt: z.coerce.date().optional(), capacity: z.coerce.number().int().min(1).max(500).default(20), isOpen: z.boolean().default(true) });
r.get('/sessions', h((req) => prisma.mentorshipSession.findMany({ where: { alumniId: req.alumni.id }, include: { _count: { select: { enrollments: true } } }, orderBy: { createdAt: 'desc' } })));
r.post('/sessions', h((req) => prisma.mentorshipSession.create({ data: { ...parse(sessionSchema, req.body), alumniId: req.alumni.id } }), 201));
r.put('/sessions/:id', h(async (req) => { const n = await prisma.mentorshipSession.updateMany({ where: { id: req.params.id, alumniId: req.alumni.id }, data: parse(sessionSchema, req.body) }); if (!n.count) throw notFound(); return { ok: true }; }));
r.delete('/sessions/:id', h(async (req) => { const n = await prisma.mentorshipSession.deleteMany({ where: { id: req.params.id, alumniId: req.alumni.id } }); if (!n.count) throw notFound(); return { deleted: true }; }));
export default r;
export { badRequest };
