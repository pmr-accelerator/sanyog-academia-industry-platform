import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMatch, scoreBuckets, compareRoles } from '../../src/matching/matcher.js';
import { TRACKS } from '../../src/data/careerTracks.js';

const opp = { allowedDisciplines: ['cse'], requirements: [{ skillId: 'a', minProficiency: 3, weight: 2 }, { skillId: 'b', minProficiency: 2, weight: 1 }] };

test('perfect verified match scores 100 and exposes factors', () => {
  const m = computeMatch({ discipline: 'cse', skills: [{ skillId: 'a', proficiency: 4, verified: true }, { skillId: 'b', proficiency: 2, verified: true }] }, opp);
  assert.equal(m.score, 100);
  assert.equal(m.factors.length, 4);
});
test('partial match is lower and unverified skills reduce the evidence factor', () => {
  const m = computeMatch({ discipline: 'cse', skills: [{ skillId: 'a', proficiency: 3, verified: false }] }, opp);
  assert.ok(m.score < 70 && m.score > 0);
  assert.equal(m.factors.find((f) => f.key === 'verifiedEvidence').value, 0);
});
test('no criteria => no score rather than a made-up one', () => {
  assert.equal(computeMatch({ skills: [] }, { requirements: [] }).score, null);
});
test('custom weights change the result', () => {
  const s = { discipline: 'it', skills: [{ skillId: 'a', proficiency: 3, verified: true }, { skillId: 'b', proficiency: 2, verified: true }] };
  const a = computeMatch(s, opp, { skillCoverage: 1, proficiencyFit: 0, verifiedEvidence: 0, disciplineFit: 0 }).score;
  const b = computeMatch(s, opp, { skillCoverage: 0, proficiencyFit: 0, verifiedEvidence: 0, disciplineFit: 1 }).score;
  assert.equal(a, 100); assert.equal(b, 0);
});
test('buckets and role comparison', () => {
  assert.deepEqual(scoreBuckets([10, 45, 61, 99, null]).map((b) => b.count), [1, 1, 1, 1]);
  const c = compareRoles(TRACKS.cse[0], TRACKS.cse[1], { 'Python Programming': 4 });
  assert.ok(c.shared.some((s) => s.skill === 'Python Programming'));
  assert.ok(c.readinessA >= 0 && c.readinessA <= 100);
});
