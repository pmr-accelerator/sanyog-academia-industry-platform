import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { h, parse, pageParams, pageMeta, paged } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, studentContext } from '../middleware/context.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { id, shortText } from '../validators/common.js';
import * as S from '../validators/schemas.js';
import * as student from '../services/student.js';
import * as verification from '../services/verification.js';
import * as opps from '../services/opportunity.js';
import * as apps from '../services/application.js';
import * as roadmap from '../services/roadmap.js';
import * as resources from '../services/resources.js';
import * as placement from '../services/placement.js';
import * as referral from '../services/referral.js';
import * as consent from '../services/consent.js';
import * as credential from '../services/credential.js';
import * as analytics from '../services/analytics.js';
import { notFound, conflict } from '../utils/errors.js';

const r = Router();
r.use(requireAuth({ allowPending: true }), requireRole('STUDENT'), studentContext);

// Allowed while the registration is still awaiting approval
r.get('/status', h((req) => ({ registrationStatus: req.student.registrationStatus, institution: req.student.institution.name })));
r.post('/enrollment/resubmit', h((req) => verification.resubmitEnrollment(req.student, parse(z.object({ documentIds: z.array(id).max(5).default([]) }), req.body).documentIds)));

// Everything below needs an approved (ACTIVE) account
r.use(requireAuth());
r.get('/dashboard', h((req) => analytics.student(req.student)));

r.get('/profile', h((req) => student.getProfile(req.student.id)));
r.put('/profile', h((req) => student.updateProfile(req.student, parse(S.profileSchema, req.body))));
r.put('/experience', h(async (req) => { await student.setExperience(req.student, parse(z.object({ months: z.coerce.number().int().min(0).max(240) }), req.body).months); return { ok: true }; }));
r.post('/records', h(async (req) => ({ id: await student.saveRecord(req.student.id, parse(S.recordSchema, req.body)) }), 201));
r.delete('/records/:id', h(async (req) => { await student.deleteRecord(req.student.id, req.params.id); return { deleted: true }; }));
r.post('/skills', h(async (req) => ({ id: await student.saveSkill(req.student.id, parse(S.skillSchema, req.body)) }), 201));
r.delete('/skills/:id', h(async (req) => { await student.deleteSkill(req.student.id, req.params.id); return { deleted: true }; }));
r.post('/projects', h(async (req) => ({ id: await student.createProject(req.student.id, parse(S.projectSchema, req.body)) }), 201));
r.put('/projects/:id', h(async (req) => { await student.updateProject(req.student.id, req.params.id, parse(S.projectSchema, req.body)); return { ok: true }; }));
r.delete('/projects/:id', h(async (req) => { await student.deleteProject(req.student.id, req.params.id); return { deleted: true }; }));
r.post('/certifications', h(async (req) => ({ id: await student.createCertification(req.student.id, parse(S.certSchema, req.body)) }), 201));
r.put('/certifications/:id', h(async (req) => { await student.updateCertification(req.student.id, req.params.id, parse(S.certSchema, req.body)); return { ok: true }; }));
r.delete('/certifications/:id', h(async (req) => { await student.deleteCertification(req.student.id, req.params.id); return { deleted: true }; }));
r.post('/verification/submit', h((req) => verification.submitItem(req.student, parse(S.submitSchema, req.body)), 201));
r.get('/verification', h((req) => prisma.verificationRequest.findMany({ where: { studentId: req.student.id }, orderBy: { updatedAt: 'desc' }, include: { reviews: { orderBy: { createdAt: 'desc' }, include: { reviewer: { select: { fullName: true } } } } } })));

// Opportunities and applications
r.get('/opportunities', h(async (req) => { const p = pageParams(req.query, 12); const { total, rows } = await opps.listForStudent(req.student, req.query, p); return paged(rows, pageMeta(p, total)); }));
r.get('/opportunities/:id', h((req) => opps.studentDetail(req.student, req.params.id)));
r.post('/opportunities/:id/simulate', h((req) => opps.simulate(req.student, req.params.id, parse(z.object({ addSkills: z.array(z.object({ skillId: id, proficiency: z.coerce.number().int().min(1).max(5) })).max(10).default([]) }), req.body).addSkills)));
r.post('/opportunities/:id/save', h((req) => opps.toggleSave(req.student, req.params.id)));
r.post('/opportunities/:id/apply', h((req) => apps.apply(req.student, req.params.id, parse(S.applySchema, req.body)), 201));
r.get('/applications', h((req) => apps.listForStudent(req.student)));
r.post('/applications/:id/withdraw', h((req) => apps.withdraw(req.student, req.params.id)));
r.post('/applications/:id/offer', h((req) => apps.respondOffer(req.student, req.params.id, parse(z.object({ accept: z.boolean() }), req.body).accept)));

// AI career roadmap
r.get('/career/tracks', h(() => roadmap.listTracks()));
r.get('/career/compare', h((req) => roadmap.compare(req.student, String(req.query.a || ''), String(req.query.b || ''))));
r.get('/roadmap', h((req) => roadmap.getActive(req.student)));
r.get('/roadmap/history', h((req) => roadmap.history(req.student)));
r.get('/roadmap/opportunities', h((req) => roadmap.recommendedOpportunities(req.student)));
r.post('/roadmap/generate', aiLimiter, h((req) => roadmap.generate(req.student, req.user, parse(z.object({ targetRole: shortText(100), weeklyLearningHours: z.coerce.number().int().min(1).max(80).optional() }), req.body)), 201));
r.patch('/roadmap/milestones/:id', h((req) => roadmap.setMilestone(req.student, req.params.id, parse(z.object({ status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']) }), req.body).status)));

// Library
r.get('/resources', h(async (req) => { const p = pageParams(req.query, 12); const { total, rows } = await resources.list(req.query, p, req.student); return paged(rows, pageMeta(p, total)); }));
r.get('/resources/recommended', h((req) => resources.recommended(req.student)));
r.post('/resources/:id/bookmark', h((req) => resources.toggleBookmark(req.student, req.params.id)));
r.post('/resources/:id/complete', h((req) => resources.toggleComplete(req.student, req.params.id)));

// Placement cell
r.get('/placement', h((req) => placement.listForStudent(req.student)));
r.post('/placement', h((req) => placement.create(req.student, parse(S.placementCreateSchema, req.body)), 201));
r.get('/placement/:id', h((req) => placement.get(req, req.params.id)));
r.post('/placement/:id/messages', h((req) => placement.addMessage(req, req.params.id, parse(S.messageSchema, req.body).body), 201));
r.post('/placement/:id/checklist/:index', h((req) => placement.toggleChecklist(req, req.params.id, Number(req.params.index))));
r.post('/placement/:id/feedback', h((req) => placement.feedback(req, req.params.id, parse(z.object({ rating: z.coerce.number().int().min(1).max(5), text: z.string().max(1000).optional() }), req.body))));

// Referrals, consent, credentials
r.get('/referrals', h((req) => referral.listForStudent(req.student)));
r.post('/referrals/:id/respond', h((req) => referral.studentRespond(req.student, req.params.id, parse(z.object({ accept: z.boolean(), shareFields: z.array(z.enum(['academics', 'skills', 'projects', 'certifications', 'contact', 'resume'])).optional() }), req.body))));
r.get('/consents', h(async (req) => ({ grants: await consent.listConsents(req.student), alumniDiscovery: await consent.hasDiscoveryConsent(req.student.id) })));
r.put('/consents/discovery', h((req) => consent.setDiscovery(req.student, parse(z.object({ allow: z.boolean() }), req.body).allow)));
r.delete('/consents/:id', h((req) => consent.revokeConsent(req.student, req.params.id)));
r.get('/credentials', h((req) => credential.list(req.student)));
r.post('/credentials', h((req) => credential.issue(req.student), 201));
r.delete('/credentials/:jti', h((req) => credential.revoke(req.student, req.params.jti)));

// Skill passport: only verified evidence is marked verified; everything else is clearly labelled.
r.get('/passport', h(async (req) => {
  const p = await student.getProfile(req.student.id);
  const tag = (x) => ({ ...x, verified: x.verificationStatus === 'VERIFIED' });
  return { institution: p.institution.name, department: p.department?.name, skills: p.skills.map((s) => tag({ name: s.skill.name, proficiency: s.proficiency, verificationStatus: s.verificationStatus })), projects: p.projects.map((x) => tag({ title: x.title, verificationStatus: x.verificationStatus })), certifications: p.certifications.map((x) => tag({ name: x.name, issuer: x.issuer, verificationStatus: x.verificationStatus })), enrollmentVerified: p.registrationStatus === 'VERIFIED' };
}));
// Alumni career sessions (same institution only)
r.get('/sessions', h(async (req) => prisma.mentorshipSession.findMany({ where: { isOpen: true, alumni: { institutionId: req.student.institutionId, verificationStatus: 'VERIFIED' } }, include: { alumni: { include: { user: { select: { fullName: true } } } }, enrollments: { where: { studentId: req.student.id }, select: { studentId: true } }, _count: { select: { enrollments: true } } }, orderBy: { scheduledAt: 'asc' } })));
r.post('/sessions/:id/enroll', h(async (req) => {
  const s = await prisma.mentorshipSession.findFirst({ where: { id: req.params.id, isOpen: true, alumni: { institutionId: req.student.institutionId } }, include: { _count: { select: { enrollments: true } } } });
  if (!s) throw notFound();
  if (s._count.enrollments >= s.capacity) throw conflict('This session is full');
  await prisma.sessionEnrollment.upsert({ where: { sessionId_studentId: { sessionId: s.id, studentId: req.student.id } }, update: {}, create: { sessionId: s.id, studentId: req.student.id } });
  return { enrolled: true };
}));
export default r;
