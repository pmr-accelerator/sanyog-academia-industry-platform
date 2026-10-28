import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibility, readinessPlan } from '../../src/eligibility/engine.js';

const student = (o = {}) => ({
  registrationVerified: true, discipline: 'cse', degree: 'B.Tech', academicYear: 3, graduationYear: 2027,
  cgpa: 8.1, academicVerified: true, activeBacklogs: 0, experienceMonths: 0,
  skills: [{ skillId: 's1', name: 'Python Programming', proficiency: 4, verified: true }], ...o,
});
const opp = (o = {}) => ({ requireVerifiedProfile: true, allowedDisciplines: ['cse', 'it'], allowedDegrees: ['B.Tech'], allowedGraduationYears: [2027], minAcademicYear: 3, minCgpa: 7, maxActiveBacklogs: 0,
  requirements: [{ skillId: 's1', name: 'Python Programming', minProficiency: 3, isMandatory: true, weight: 1 }], ...o });

test('eligible when every criterion is met and verified', () => {
  const r = evaluateEligibility(student(), opp());
  assert.equal(r.result, 'ELIGIBLE');
  assert.equal(r.missing.length, 0);
});
test('not eligible when discipline is not accepted, with an explanation', () => {
  const r = evaluateEligibility(student({ discipline: 'civil' }), opp());
  assert.equal(r.result, 'NOT_ELIGIBLE');
  assert.match(r.missing.find((c) => c.key === 'discipline').detail, /civil/);
});
test('requires review when CGPA is not verified', () => {
  const r = evaluateEligibility(student({ academicVerified: false }), opp());
  assert.equal(r.result, 'REQUIRES_REVIEW');
});
test('requires review when a mandatory skill is self-declared', () => {
  const r = evaluateEligibility(student({ skills: [{ skillId: 's1', name: 'Python Programming', proficiency: 4, verified: false }] }), opp());
  assert.equal(r.result, 'REQUIRES_REVIEW');
});
test('not eligible when mandatory skill is missing or too low', () => {
  assert.equal(evaluateEligibility(student({ skills: [] }), opp()).result, 'NOT_ELIGIBLE');
  assert.equal(evaluateEligibility(student({ skills: [{ skillId: 's1', name: 'Python Programming', proficiency: 2, verified: true }] }), opp()).result, 'NOT_ELIGIBLE');
});
test('optional skills never block', () => {
  const o = opp({ requirements: [{ skillId: 's9', name: 'Rust', minProficiency: 3, isMandatory: false, weight: 1 }] });
  const r = evaluateEligibility(student(), o);
  assert.equal(r.result, 'ELIGIBLE');
  assert.equal(r.missing.length, 1);
});
test('institution rules apply in addition to opportunity rules', () => {
  const r = evaluateEligibility(student({ activeBacklogs: 2 }), opp({ maxActiveBacklogs: null }), { maxBacklogsForPlacement: 1 });
  assert.equal(r.result, 'NOT_ELIGIBLE');
  assert.ok(r.checks.some((c) => c.key === 'instBacklogs' && c.status === 'NOT_MET'));
});
test('unverified profile blocks when required', () => {
  assert.equal(evaluateEligibility(student({ registrationVerified: false }), opp()).result, 'NOT_ELIGIBLE');
  assert.equal(evaluateEligibility(student({ registrationVerified: false }), opp({ requireVerifiedProfile: false })).result, 'ELIGIBLE');
});
test('missing CGPA data leads to review, not silent rejection', () => {
  assert.equal(evaluateEligibility(student({ cgpa: null }), opp()).result, 'REQUIRES_REVIEW');
});
test('readiness plan lists actionable blockers', () => {
  const ev = evaluateEligibility(student({ skills: [{ skillId: 's1', name: 'Python Programming', proficiency: 2, verified: true }] }), opp());
  const plan = readinessPlan(ev);
  assert.equal(plan.blockers.length, 1);
  assert.equal(plan.wouldQualifyIfActionableDone, true);
});
test('a hypothetical added skill turns the result eligible', () => {
  const base = student({ skills: [] });
  assert.equal(evaluateEligibility(base, opp()).result, 'NOT_ELIGIBLE');
  const sim = { ...base, skills: [{ skillId: 's1', name: 'Python Programming', proficiency: 3, verified: true }] };
  assert.equal(evaluateEligibility(sim, opp()).result, 'ELIGIBLE');
});
