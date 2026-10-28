import test from 'node:test';
import assert from 'node:assert/strict';
import { DISCIPLINES, TRACKS } from '../../src/data/careerTracks.js';
import { evaluateEligibility } from '../../src/eligibility/engine.js';

// Cross-discipline regression matrix: each role track must work with the same transparent
// eligibility engine, not only the CSE happy path. Skill IDs are names in this isolated fixture.
for (const [discipline, tracks] of Object.entries(TRACKS)) {
  for (const track of tracks) {
    test(`dataset: ${discipline} / ${track.role} is eligible when all evidence is verified`, () => {
      const student = {
        registrationVerified: true, discipline, degree: 'B.Tech', academicYear: 4,
        graduationYear: 2027, cgpa: 8.2, academicVerified: true, activeBacklogs: 0,
        skills: track.skills.map(([name, proficiency]) => ({ skillId: name, name, proficiency, verified: true })),
      };
      const opportunity = {
        requireVerifiedProfile: true, allowedDisciplines: [discipline], allowedDegrees: ['B.Tech'],
        allowedGraduationYears: [2027], minAcademicYear: 3, minCgpa: 7, maxActiveBacklogs: 0,
        requirements: track.skills.map(([name, minProficiency]) => ({ skillId: name, name, minProficiency, isMandatory: true, weight: 1 })),
      };
      const result = evaluateEligibility(student, opportunity);
      assert.equal(result.result, 'ELIGIBLE', `${DISCIPLINES[discipline]}: ${JSON.stringify(result.missing)}`);
      assert.equal(result.checks.length, 7 + track.skills.length); // profile, discipline, degree, year, CGPA, backlogs, skills
    });

    test(`dataset: ${discipline} / ${track.role} rejects a disallowed discipline`, () => {
      const student = { registrationVerified: true, discipline: 'not-allowed', degree: 'B.Tech', academicYear: 4, graduationYear: 2027, cgpa: 8, academicVerified: true, activeBacklogs: 0, skills: track.skills.map(([name, proficiency]) => ({ skillId: name, name, proficiency, verified: true })) };
      const opportunity = { allowedDisciplines: [discipline], allowedDegrees: ['B.Tech'], allowedGraduationYears: [2027], minAcademicYear: 3, minCgpa: 7, maxActiveBacklogs: 0, requirements: track.skills.map(([name, minProficiency]) => ({ skillId: name, name, minProficiency, isMandatory: true })) };
      assert.equal(evaluateEligibility(student, opportunity).result, 'NOT_ELIGIBLE');
    });
  }
}
