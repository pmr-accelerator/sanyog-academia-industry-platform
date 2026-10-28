// Hand-written validator for roadmap output (used for BOTH provider output and the fallback).
// AI output is untrusted: it is validated and size-limited before it is stored or shown.
const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const strArr = (v, maxItems, maxLen) => Array.isArray(v) && v.length <= maxItems && v.every((x) => str(x, maxLen));

export function validateRoadmap(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['Output is not an object'] };
  if (!str(raw.summary, 1500)) errors.push('summary');
  if (!Array.isArray(raw.skillGaps) || raw.skillGaps.length > 40) errors.push('skillGaps');
  else raw.skillGaps.forEach((g, i) => {
    if (!str(g?.skill, 120) || !Number.isInteger(g.required) || g.required < 1 || g.required > 5 || !Number.isInteger(g.current) || g.current < 0 || g.current > 5) errors.push(`skillGaps[${i}]`);
  });
  if (!Array.isArray(raw.milestones) || raw.milestones.length < 1 || raw.milestones.length > 30) errors.push('milestones');
  else raw.milestones.forEach((m, i) => {
    if (!LEVELS.includes(m?.level) || !str(m.title, 200) || !str(m.description, 1200)) errors.push(`milestones[${i}]`);
    if (m && m.targetWeek !== undefined && m.targetWeek !== null && (!Number.isInteger(m.targetWeek) || m.targetWeek < 1 || m.targetWeek > 260)) errors.push(`milestones[${i}].targetWeek`);
    if (m && m.skills !== undefined && !strArr(m.skills, 10, 120)) errors.push(`milestones[${i}].skills`);
    if (m && m.deliverable !== undefined && m.deliverable !== null && !str(m.deliverable, 400)) errors.push(`milestones[${i}].deliverable`);
  });
  if (raw.projectIdeas !== undefined && !strArr(raw.projectIdeas, 10, 300)) errors.push('projectIdeas');
  if (raw.assessments !== undefined && !strArr(raw.assessments, 10, 300)) errors.push('assessments');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      summary: raw.summary.trim(),
      skillGaps: raw.skillGaps.map((g) => ({ skill: g.skill.trim(), required: g.required, current: g.current, gap: Math.max(0, g.required - g.current) })),
      milestones: raw.milestones.map((m, i) => ({
        position: i + 1, level: m.level, title: m.title.trim(), description: m.description.trim(),
        targetWeek: m.targetWeek ?? null, skills: (m.skills || []).map((s) => s.trim()), deliverable: m.deliverable ? m.deliverable.trim() : null,
      })),
      projectIdeas: raw.projectIdeas || [],
      assessments: raw.assessments || [],
    },
  };
}
