// Profile completion: transparent weights so students can see exactly what is missing.
export function computeCompletion(p) {
  const items = [
    { key: 'basics', label: 'Department, bio, interests and target role', weight: 20, done: Boolean(p.departmentId && p.bio && p.careerInterests?.length && p.targetRole) },
    { key: 'academic', label: 'At least one academic record', weight: 15, done: p.academicRecordCount >= 1 },
    { key: 'skills', label: 'At least three skills', weight: 20, done: p.skillCount >= 3 },
    { key: 'project', label: 'At least one project', weight: 15, done: p.projectCount >= 1 },
    { key: 'certification', label: 'At least one certification', weight: 10, done: p.certificationCount >= 1 },
    { key: 'resume', label: 'Resume uploaded', weight: 10, done: Boolean(p.hasResume) },
    { key: 'photo', label: 'Profile photograph', weight: 5, done: Boolean(p.hasPhoto) },
    { key: 'learning', label: 'Weekly learning hours set', weight: 5, done: Boolean(p.weeklyLearningHours) },
  ];
  const score = items.filter((i) => i.done).reduce((a, i) => a + i.weight, 0);
  return { score, items };
}
