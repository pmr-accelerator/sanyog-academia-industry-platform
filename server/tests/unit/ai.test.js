import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiService } from '../../src/ai/service.js';
import { validateRoadmap } from '../../src/ai/schema.js';
import { generateRuleBasedRoadmap } from '../../src/ai/ruleBased.js';
import { DISCIPLINES, TRACKS } from '../../src/data/careerTracks.js';
import { computeCompletion } from '../../src/utils/completion.js';

const input = { discipline: 'cse', degree: 'B.Tech', academicYear: 3, semester: 5, targetRole: 'Backend Software Engineer', weeklyLearningHours: 6, skills: [{ name: 'Python Programming', proficiency: 2 }] };
const goodOutput = { summary: 'ok', skillGaps: [{ skill: 'Python Programming', required: 3, current: 2 }], milestones: [{ level: 'BEGINNER', title: 't', description: 'd', targetWeek: 2, skills: ['Python Programming'], deliverable: 'x' }] };

test('rule-based fallback is valid for every discipline and role', () => {
  for (const d of Object.keys(DISCIPLINES)) for (const t of TRACKS[d]) {
    const out = validateRoadmap(generateRuleBasedRoadmap({ ...input, discipline: d, targetRole: t.role }));
    assert.equal(out.ok, true, `${d}/${t.role}: ${out.errors}`);
  }
});
test('no provider => fallback, clearly labelled', async () => {
  const r = await createAiService({ provider: null }).generateRoadmap(input);
  assert.equal(r.meta.source, 'RULE_BASED_FALLBACK');
  assert.equal(r.meta.provider, null);
  assert.equal(r.meta.reason, 'NO_PROVIDER_CONFIGURED');
});
test('valid provider output is accepted and labelled as AI', async () => {
  const r = await createAiService({ provider: { name: 'fake', model: 'm1', generateRoadmap: async () => goodOutput } }).generateRoadmap(input);
  assert.equal(r.meta.source, 'AI_PROVIDER');
  assert.equal(r.roadmap.skillGaps[0].gap, 1);
});
test('provider error, timeout and invalid output all fall back', async () => {
  const boom = { name: 'fake', model: 'm', generateRoadmap: async () => { throw Object.assign(new Error('x'), { code: 'AI_RATE_LIMITED' }); } };
  assert.equal((await createAiService({ provider: boom }).generateRoadmap(input)).meta.reason, 'AI_RATE_LIMITED');
  const slow = { name: 'fake', model: 'm', generateRoadmap: (_i, signal) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))) };
  assert.equal((await createAiService({ provider: slow, timeoutMs: 20 }).generateRoadmap(input)).meta.reason, 'AI_TIMEOUT');
  const bad = { name: 'fake', model: 'm', generateRoadmap: async () => ({ summary: 5 }) };
  const r = await createAiService({ provider: bad }).generateRoadmap(input);
  assert.equal(r.meta.reason, 'INVALID_PROVIDER_OUTPUT');
  assert.equal(r.meta.usedFallback, true);
});
test('oversized or malformed AI output is rejected', () => {
  assert.equal(validateRoadmap({ ...goodOutput, milestones: [{ level: 'EXPERT', title: 't', description: 'd' }] }).ok, false);
  assert.equal(validateRoadmap({ ...goodOutput, summary: 'x'.repeat(5000) }).ok, false);
});
test('profile completion uses transparent weights', () => {
  const c = computeCompletion({ departmentId: 'd', bio: 'b', careerInterests: ['x'], targetRole: 'r', academicRecordCount: 1, skillCount: 3, projectCount: 1, certificationCount: 1, hasResume: true, hasPhoto: true, weeklyLearningHours: 5 });
  assert.equal(c.score, 100);
  assert.equal(computeCompletion({ academicRecordCount: 0, skillCount: 0 }).score, 0);
});
