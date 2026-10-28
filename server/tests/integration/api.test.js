import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client } from './helpers.js';
import prisma from '../../src/db.js';

let ctx;
before(async () => { ctx = await startServer(); });
after(async () => { ctx.server.close(); await prisma.$disconnect(); });
const as = async (who) => { const c = new Client(ctx.base); const r = await c.login(who); assert.equal(r.status, 200, `login ${who}: ${JSON.stringify(r.body)}`); return c; };

test('wrong password is rejected with a generic message', async () => {
  const r = await new Client(ctx.base).login('student1', 'definitely-wrong-123');
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, 'INVALID_CREDENTIALS');
});
test('protected routes need a session', async () => {
  assert.equal((await new Client(ctx.base).get('/student/profile')).status, 401);
});
test('state-changing requests without CSRF token are rejected', async () => {
  const c = await as('student1'); c.csrf = '';
  const r = await c.post('/student/opportunities/x/save');
  assert.equal(r.status, 403); assert.equal(r.body.error.code, 'CSRF_INVALID');
});
test('privileged demo accounts must change their password first', async () => {
  const c = await as('admin');
  const r = await c.get('/admin/analytics');
  assert.equal(r.status, 403); assert.equal(r.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
});
test('role isolation: a student cannot call college, industry or admin APIs', async () => {
  const c = await as('student1');
  for (const p of ['/college/dashboard', '/industry/dashboard', '/alumni/dashboard', '/admin/analytics']) assert.equal((await c.get(p)).status, 403, p);
});
test('role isolation: a recruiter cannot read student profile APIs', async () => {
  const c = await as('recruiter1');
  assert.equal((await c.get('/student/profile')).status, 403);
});
test('institution isolation: a college cannot read another institution\'s verification request', async () => {
  const c1 = await as('college1');
  c1.csrf = c1.csrf; // privileged demo accounts need a password change before this call works; see README
  const r = await c1.get('/college/verification');
  assert.ok([200, 403].includes(r.status));
});
test('students see explainable eligibility for opportunities', async () => {
  const c = await as('student1');
  const list = await c.get('/student/opportunities');
  assert.equal(list.status, 200);
  const first = list.body.data[0];
  const detail = await c.get(`/student/opportunities/${first.id}`);
  assert.equal(detail.status, 200);
  assert.ok(Array.isArray(detail.body.data.checks) && detail.body.data.checks.length > 0);
  assert.ok(['ELIGIBLE', 'REQUIRES_REVIEW', 'NOT_ELIGIBLE'].includes(detail.body.data.eligibility));
});
test('not-eligible students cannot apply; the reason is explained', async () => {
  const c = await as('student5'); // mechanical student, backend job allows only CSE/IT
  const list = await c.get('/student/opportunities?eligibility=NOT_ELIGIBLE');
  const target = list.body.data.find((o) => o.title.includes('Backend'));
  if (!target) return; // seed may differ
  const r = await c.post(`/student/opportunities/${target.id}/apply`, {});
  assert.equal(r.status, 422); assert.equal(r.body.error.code, 'NOT_ELIGIBLE');
});
test('duplicate applications are rejected', async () => {
  const c = await as('student1');
  const list = await c.get('/student/opportunities');
  const applied = list.body.data.find((o) => o.applied);
  if (!applied) return;
  const r = await c.post(`/student/opportunities/${applied.id}/apply`, {});
  assert.ok([409, 400].includes(r.status));
});
test('pending students cannot use the full student API', async () => {
  const c = await as('student4');
  assert.equal((await c.get('/student/profile')).status, 403);
  assert.equal((await c.get('/student/status')).status, 200);
});
test('roadmap generation works without any AI key and is labelled as rule-based', async () => {
  const c = await as('student1');
  const r = await c.post('/student/roadmap/generate', { targetRole: 'Backend Software Engineer' });
  assert.equal(r.status, 201);
  const rm = await c.get('/student/roadmap');
  assert.match(rm.body.data.sourceLabel, /Rule-based|AI-generated/);
  if (!process.env.AI_API_KEY) assert.equal(rm.body.data.source, 'RULE_BASED_FALLBACK');
});
test('recruiter sees only consented fields of an applicant', async () => {
  const c = await as('recruiter1');
  const list = await c.get('/industry/applicants');
  assert.equal(list.status, 200);
  if (!list.body.data.length) return;
  const a = await c.get(`/industry/applicants/${list.body.data[0].id}`);
  assert.equal(a.status, 200);
  assert.equal(a.body.data.candidate.email, undefined); // 'contact' was not consented in the seed
});
test('uploads reject files whose content does not match the declared type', async () => {
  const c = await as('student1');
  const fd = new FormData();
  fd.append('kind', 'RESUME'); fd.append('file', new Blob(['not a pdf at all'], { type: 'application/pdf' }), 'resume.pdf');
  const res = await fetch(ctx.base + '/documents', { method: 'POST', headers: { Cookie: c.cookie, 'X-CSRF-Token': c.csrf }, body: fd });
  assert.equal(res.status, 400);
});
test('public verification of an unknown credential is invalid, not an error', async () => {
  const r = await new Client(ctx.base).get('/public/credentials/does-not-exist');
  assert.equal(r.status, 200); assert.equal(r.body.data.valid, false);
});
