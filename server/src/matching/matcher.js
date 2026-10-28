// Interpretable skill matching. Score = weighted sum of named factors; every factor is returned so
// the UI can show "why". This is keyword/ID based matching, NOT a semantic embedding model.

export const DEFAULT_WEIGHTS = { skillCoverage: 0.55, proficiencyFit: 0.2, verifiedEvidence: 0.15, disciplineFit: 0.1 };

export function computeMatch(student, opp, weights = DEFAULT_WEIGHTS) {
  const reqs = opp.requirements || [];
  const have = new Map((student.skills || []).map((s) => [s.skillId, s]));
  const factors = [];

  if (reqs.length) {
    const totalW = reqs.reduce((a, r) => a + (r.weight || 1), 0);
    let cov = 0; let fit = 0; let ver = 0;
    for (const r of reqs) {
      const w = (r.weight || 1) / totalW;
      const s = have.get(r.skillId);
      if (s) {
        cov += w;
        fit += w * Math.min(1, s.proficiency / Math.max(1, r.minProficiency));
        if (s.verified) ver += w;
      }
    }
    factors.push({ key: 'skillCoverage', label: 'Required skills present', value: cov, weight: weights.skillCoverage });
    factors.push({ key: 'proficiencyFit', label: 'Proficiency vs required level', value: fit, weight: weights.proficiencyFit });
    factors.push({ key: 'verifiedEvidence', label: 'Skills verified by college', value: ver, weight: weights.verifiedEvidence });
  }
  if (opp.allowedDisciplines?.length) {
    const ok = opp.allowedDisciplines.map((d) => d.toLowerCase()).includes(String(student.discipline || '').toLowerCase());
    factors.push({ key: 'disciplineFit', label: 'Discipline fit', value: ok ? 1 : 0, weight: weights.disciplineFit });
  }
  const totalWeight = factors.reduce((a, f) => a + f.weight, 0);
  if (!totalWeight) return { score: null, factors: [], note: 'This opportunity lists no skill or discipline criteria, so no match score is computed.' };
  let score = 0;
  for (const f of factors) { f.contribution = Math.round((f.value * f.weight / totalWeight) * 100); score += f.value * f.weight / totalWeight; }
  return { score: Math.round(score * 100), factors };
}

// Distribution of scores into buckets for recruiter analytics.
export function scoreBuckets(scores) {
  const buckets = [{ label: '0–39', min: 0, max: 39, count: 0 }, { label: '40–59', min: 40, max: 59, count: 0 }, { label: '60–79', min: 60, max: 79, count: 0 }, { label: '80–100', min: 80, max: 100, count: 0 }];
  for (const s of scores) { if (s === null || s === undefined) continue; const b = buckets.find((x) => s >= x.min && s <= x.max); if (b) b.count += 1; }
  return buckets.map(({ label, count }) => ({ label, count }));
}

// Compare two role tracks (career path comparison).
export function compareRoles(a, b, studentLevels = {}) {
  const A = new Map(a.skills.map(([n, l]) => [n, l]));
  const B = new Map(b.skills.map(([n, l]) => [n, l]));
  const shared = [...A.keys()].filter((n) => B.has(n)).map((n) => ({ skill: n, levelA: A.get(n), levelB: B.get(n) }));
  const onlyA = [...A.keys()].filter((n) => !B.has(n)).map((n) => ({ skill: n, level: A.get(n) }));
  const onlyB = [...B.keys()].filter((n) => !A.has(n)).map((n) => ({ skill: n, level: B.get(n) }));
  const readiness = (m) => { let have = 0; let tot = 0; for (const [n, l] of m) { tot += l; have += Math.min(l, studentLevels[n] || 0); } return tot ? Math.round((have / tot) * 100) : 0; };
  return { roleA: a.role, roleB: b.role, shared, onlyA, onlyB, readinessA: readiness(A), readinessB: readiness(B) };
}
