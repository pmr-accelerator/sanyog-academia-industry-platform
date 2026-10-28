// Glue between the database and the pure eligibility / matching engines.
import prisma from '../db.js';
import { evaluateEligibility } from '../eligibility/engine.js';
import { computeMatch, DEFAULT_WEIGHTS } from '../matching/matcher.js';

export const OPP_INCLUDE = {
  requirements: { include: { skill: true } },
  organization: { select: { id: true, displayName: true, status: true, website: true, industry: true } },
  postedBy: { select: { id: true, name: true } },
  institutions: { select: { institutionId: true } },
};

let weightsCache = { at: 0, value: DEFAULT_WEIGHTS };
export async function getMatchWeights() {
  if (Date.now() - weightsCache.at < 60000) return weightsCache.value;
  const row = await prisma.platformSetting.findUnique({ where: { key: 'matching.weights' } });
  const v = row?.value;
  const ok = v && ['skillCoverage', 'proficiencyFit', 'verifiedEvidence', 'disciplineFit'].every((k) => typeof v[k] === 'number' && v[k] >= 0);
  weightsCache = { at: Date.now(), value: ok ? v : DEFAULT_WEIGHTS };
  return weightsCache.value;
}
export const resetWeightsCache = () => { weightsCache.at = 0; };

export async function loadStudentSnapshot(studentId, db = prisma) {
  const p = await db.studentProfile.findUnique({
    where: { id: studentId },
    include: { department: true, institution: true, academicRecords: { orderBy: { semester: 'desc' } }, skills: { include: { skill: true } } },
  });
  if (!p) return null;
  const rec = p.academicRecords[0];
  return {
    profile: p,
    institutionRules: p.institution.eligibilityRules || {},
    snapshot: {
      registrationVerified: p.registrationStatus === 'VERIFIED',
      discipline: p.department?.discipline || null,
      degree: p.degree, academicYear: p.academicYear, graduationYear: p.graduationYear,
      cgpa: rec?.cgpa != null ? Number(rec.cgpa) : null,
      percentage: rec?.percentage != null ? Number(rec.percentage) : null,
      academicVerified: rec?.verificationStatus === 'VERIFIED',
      activeBacklogs: rec?.activeBacklogs ?? 0,
      experienceMonths: p.experienceMonths,
      skills: p.skills.map((s) => ({ skillId: s.skillId, name: s.skill.name, proficiency: s.proficiency, verified: s.verificationStatus === 'VERIFIED' })),
    },
  };
}

export function toEngineOpp(o) {
  return {
    ...o,
    minCgpa: o.minCgpa != null ? Number(o.minCgpa) : null,
    minPercentage: o.minPercentage != null ? Number(o.minPercentage) : null,
    requirements: (o.requirements || []).map((r) => ({ skillId: r.skillId, name: r.skill?.name || r.name, minProficiency: r.minProficiency, isMandatory: r.isMandatory, weight: r.weight })),
  };
}

export async function evaluateAll(snapshot, rules, oppRow) {
  const o = toEngineOpp(oppRow);
  const ev = evaluateEligibility(snapshot, o, rules);
  const match = computeMatch(snapshot, o, await getMatchWeights());
  return { ...ev, match };
}
