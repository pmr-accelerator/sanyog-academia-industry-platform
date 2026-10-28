// Pure, dependency-free eligibility engine. It reads ONLY the structured criteria on the opportunity
// (plus the institution's own configured rules) and the student's saved profile. No AI, no hidden inputs.
//
// Result: ELIGIBLE | REQUIRES_REVIEW | NOT_ELIGIBLE, with one explained check per criterion.

export const MET = 'MET';
export const NOT_MET = 'NOT_MET';
export const REVIEW = 'REVIEW';

const norm = (s) => String(s ?? '').trim().toLowerCase();
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

function check(key, label, status, detail, extra = {}) {
  return { key, label, status, detail, blocking: true, ...extra };
}

export function evaluateEligibility(student, opp, institutionRules = {}) {
  const checks = [];

  // 1. Verified profile
  if (opp.requireVerifiedProfile !== false) {
    checks.push(student.registrationVerified
      ? check('profile', 'Profile verified by your college', MET, 'Your enrollment is verified.')
      : check('profile', 'Profile verified by your college', NOT_MET, 'Your college has not verified your enrollment yet (or re-verification is pending).',
        { improvement: 'Complete college verification of your profile.' }));
  }

  // 2. Discipline
  if (opp.allowedDisciplines?.length) {
    if (!student.discipline) checks.push(check('discipline', 'Discipline', REVIEW, 'Your department is not set.', { improvement: 'Set your department on your profile.' }));
    else if (opp.allowedDisciplines.map(norm).includes(norm(student.discipline))) checks.push(check('discipline', 'Discipline', MET, `${student.discipline} is accepted.`));
    else checks.push(check('discipline', 'Discipline', NOT_MET, `Open to ${opp.allowedDisciplines.join(', ')}; your discipline is ${student.discipline}.`));
  }

  // 3. Degree
  if (opp.allowedDegrees?.length) {
    if (opp.allowedDegrees.map(norm).includes(norm(student.degree))) checks.push(check('degree', 'Degree', MET, `${student.degree} is accepted.`));
    else checks.push(check('degree', 'Degree', NOT_MET, `Open to ${opp.allowedDegrees.join(', ')}; your degree is ${student.degree || 'not set'}.`));
  }

  // 4. Graduation year
  if (opp.allowedGraduationYears?.length) {
    if (opp.allowedGraduationYears.includes(student.graduationYear)) checks.push(check('graduationYear', 'Graduation year', MET, `${student.graduationYear} is accepted.`));
    else checks.push(check('graduationYear', 'Graduation year', NOT_MET, `Open to graduating batches ${opp.allowedGraduationYears.join(', ')}; yours is ${student.graduationYear}.`));
  }

  // 5. Academic year
  if (opp.minAcademicYear) {
    if (student.academicYear >= opp.minAcademicYear) checks.push(check('academicYear', 'Academic year', MET, `Year ${student.academicYear} meets the minimum of year ${opp.minAcademicYear}.`));
    else checks.push(check('academicYear', 'Academic year', NOT_MET, `Requires year ${opp.minAcademicYear} or above; you are in year ${student.academicYear}.`));
  }

  // 6. CGPA / percentage – opportunity level, then institution level
  const academicCheck = (key, label, have, min, unit) => {
    if (min === null) return;
    if (have === null) { checks.push(check(key, label, REVIEW, `No ${unit} on record.`, { improvement: `Add your ${unit} to your academic records.` })); return; }
    if (have < min) { checks.push(check(key, label, NOT_MET, `Requires at least ${min}; yours is ${have}.`)); return; }
    if (!student.academicVerified) checks.push(check(key, label, REVIEW, `${have} meets ${min}, but the record is not verified by your college yet.`, { improvement: 'Submit your academic record for verification.' }));
    else checks.push(check(key, label, MET, `${have} meets the minimum of ${min}.`));
  };
  academicCheck('cgpa', 'Minimum CGPA', num(student.cgpa), num(opp.minCgpa), 'CGPA');
  academicCheck('percentage', 'Minimum percentage', num(student.percentage), num(opp.minPercentage), 'percentage');
  academicCheck('instCgpa', 'Institution CGPA rule', num(student.cgpa), num(institutionRules.minCgpaForPlacement), 'CGPA');

  // 7. Backlogs
  const backlogLimits = [['backlogs', 'Active backlogs', num(opp.maxActiveBacklogs)], ['instBacklogs', 'Institution backlog rule', num(institutionRules.maxBacklogsForPlacement)]];
  for (const [key, label, limit] of backlogLimits) {
    if (limit === null) continue;
    const have = num(student.activeBacklogs) ?? 0;
    checks.push(have <= limit
      ? check(key, label, MET, `${have} active backlog(s); limit is ${limit}.`)
      : check(key, label, NOT_MET, `${have} active backlog(s); limit is ${limit}.`, { improvement: `Clear backlogs to ${limit} or fewer.` }));
  }

  // 8. Experience
  if (opp.minExperienceMonths) {
    const have = num(student.experienceMonths) ?? 0;
    checks.push(have >= opp.minExperienceMonths
      ? check('experience', 'Experience', MET, `${have} months meets ${opp.minExperienceMonths}.`)
      : check('experience', 'Experience', NOT_MET, `Requires ${opp.minExperienceMonths} months; you have ${have}.`));
  }

  // 9. Skills
  const have = new Map((student.skills || []).map((s) => [s.skillId, s]));
  for (const r of opp.requirements || []) {
    const s = have.get(r.skillId);
    const label = `Skill: ${r.name}`;
    const blocking = r.isMandatory !== false;
    let c;
    if (!s) c = check(`skill:${r.skillId}`, label, NOT_MET, `Requires ${r.name} at level ${r.minProficiency}; not on your profile.`, { improvement: `Add ${r.name} and build it to level ${r.minProficiency}.` });
    else if (s.proficiency < r.minProficiency) c = check(`skill:${r.skillId}`, label, NOT_MET, `Requires level ${r.minProficiency}; yours is ${s.proficiency}.`, { improvement: `Raise ${r.name} from ${s.proficiency} to ${r.minProficiency}.` });
    else if (!s.verified) c = check(`skill:${r.skillId}`, label, REVIEW, `Level ${s.proficiency} meets ${r.minProficiency}, but it is self-declared and not yet verified.`, { improvement: `Submit ${r.name} evidence for verification.` });
    else c = check(`skill:${r.skillId}`, label, MET, `Verified level ${s.proficiency} meets ${r.minProficiency}.`);
    c.blocking = blocking;
    if (!blocking && c.status === REVIEW) c.status = MET; // optional skills never trigger review
    checks.push(c);
  }

  const blockingChecks = checks.filter((c) => c.blocking);
  let result = 'ELIGIBLE';
  if (blockingChecks.some((c) => c.status === NOT_MET)) result = 'NOT_ELIGIBLE';
  else if (blockingChecks.some((c) => c.status === REVIEW)) result = 'REQUIRES_REVIEW';

  return {
    result,
    checks,
    matched: checks.filter((c) => c.status === MET),
    missing: checks.filter((c) => c.status !== MET),
  };
}

// "What would qualify me?" – lists the blocking failures that the student can act on.
export function readinessPlan(evaluation) {
  const blockers = evaluation.checks.filter((c) => c.blocking && c.status !== MET);
  return {
    result: evaluation.result,
    blockers: blockers.map((c) => ({ key: c.key, label: c.label, status: c.status, detail: c.detail, improvement: c.improvement || null, actionable: Boolean(c.improvement) })),
    wouldQualifyIfActionableDone: blockers.length > 0 && blockers.every((c) => Boolean(c.improvement)),
  };
}
