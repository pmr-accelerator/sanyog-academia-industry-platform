import { Router } from 'express';
import { z } from 'zod';
import { h, parse } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, sensitiveLimiter } from '../middleware/rateLimit.js';
import * as auth from '../services/auth.js';
import { email, password, shortText, optText, optUrl, phone, id, year } from '../validators/common.js';

const r = Router();
const account = { email, password, fullName: shortText(120), phone };
const studentSchema = z.object({
  ...account, institutionId: id, departmentId: id.optional(), degree: shortText(60),
  academicYear: z.coerce.number().int().min(1).max(6), semester: z.coerce.number().int().min(1).max(12), graduationYear: year,
  studentIdNumber: optText(60), registrationNumber: optText(60), enrollmentNumber: optText(60),
});
const collegeSchema = z.object({
  ...account, title: optText(100), institutionId: id.optional(),
  newInstitution: z.object({ name: shortText(200), institutionCode: optText(40), universityName: optText(200), type: optText(80), state: optText(80), city: optText(80), website: optUrl }).optional(),
});
const industrySchema = z.object({
  ...account, repName: shortText(120), repDesignation: shortText(120),
  organization: z.object({ legalName: shortText(200), displayName: shortText(120), registrationNumber: optText(60), website: optUrl, industry: optText(80), sizeBand: optText(40), address: optText(300) }),
});
const alumniSchema = z.object({
  ...account, institutionId: id, departmentId: id.optional(), degree: shortText(60), graduationYear: year,
  currentEmployer: optText(150), currentRole: optText(150), expertise: z.array(shortText(60)).max(15).optional(), bio: optText(1000), linkedinUrl: optUrl,
});

r.post('/register/student', authLimiter, h((req) => auth.registerStudent(parse(studentSchema, req.body)), 201));
r.post('/register/college', authLimiter, h((req) => auth.registerCollege(parse(collegeSchema, req.body)), 201));
r.post('/register/industry', authLimiter, h((req) => auth.registerIndustry(parse(industrySchema, req.body)), 201));
r.post('/register/alumni', authLimiter, h((req) => auth.registerAlumni(parse(alumniSchema, req.body)), 201));

r.post('/login', authLimiter, h(async (req, res) => {
  const d = parse(z.object({ email, password: z.string().min(1).max(128) }), req.body);
  const { user, session } = await auth.login(req, res, d.email, d.password);
  // Same payload as /me so the client can bootstrap immediately.
  return auth.me({ user, session });
}));
r.post('/logout', h((req, res) => auth.logout(req, res)));
r.get('/me', requireAuth({ allowPending: true, allowMustChange: true }), h((req) => auth.me(req)));
r.post('/verify-email', authLimiter, h((req) => auth.verifyEmail(parse(z.object({ token: z.string().min(10).max(200) }), req.body).token)));
r.post('/resend-verification', sensitiveLimiter, h((req) => auth.resendVerification(parse(z.object({ email }), req.body).email)));
r.post('/forgot-password', sensitiveLimiter, h((req) => auth.forgotPassword(parse(z.object({ email }), req.body).email)));
r.post('/reset-password', authLimiter, h((req) => { const d = parse(z.object({ token: z.string().min(10).max(200), password }), req.body); return auth.resetPassword(d.token, d.password); }));
r.post('/change-password', requireAuth({ allowPending: true, allowMustChange: true }), h((req) => { const d = parse(z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }), req.body); return auth.changePassword(req, d.currentPassword, d.newPassword); }));

export default r;
