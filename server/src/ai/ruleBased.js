// Deterministic, rule-based roadmap generator. It is NOT an AI model and is always labelled as the
// "rule-based fallback" in the API and UI.
import { findTrack, findTrackAnywhere, TRACKS, DISCIPLINES } from '../data/careerTracks.js';

const PROJECT_IDEAS = {
  cse: ['Build a REST API with authentication and a relational database', 'Implement and benchmark five sorting/searching algorithms'],
  it: ['Build a small full-stack app and deploy it', 'Containerise a service and add a CI pipeline'],
  ece: ['Build a sensor-logging device on a microcontroller', 'Simulate and document a digital circuit design'],
  electrical: ['Simulate a power-flow study for a small network', 'Model and tune a PID controller in simulation'],
  mechanical: ['Model an assembly in CAD with a full drawing set', 'Run a basic thermal or stress simulation and report results'],
  civil: ['Prepare a drawing and quantity estimate for a small structure', 'Run a survey exercise and produce a plotted plan'],
  biotech: ['Write a lab protocol and statistical analysis for a mock experiment', 'Analyse a public sequence dataset with a bioinformatics tool'],
  management: ['Analyse a public dataset and present a business recommendation', 'Prepare a marketing plan and budget for a small product'],
};

const YEAR_ADVICE = {
  1: 'You are early in your degree, so the plan prioritises fundamentals and building good habits.',
  2: 'You have time to build solid depth before internships, so the plan balances fundamentals and projects.',
  3: 'Internship season is close, so the plan prioritises job-relevant skills and visible project work.',
  4: 'You are close to graduation, so the plan prioritises the highest-impact gaps and interview readiness.',
};

export function generateRuleBasedRoadmap(input) {
  const discipline = input.discipline;
  const track = findTrack(discipline, input.targetRole) || findTrackAnywhere(input.targetRole) || (TRACKS[discipline] || [])[0];
  if (!track) {
    return {
      summary: 'No target role could be matched to a known track. Choose a target role from the list to get a personalised plan.',
      skillGaps: [], milestones: [{ level: 'BEGINNER', title: 'Choose a target role', description: 'Pick a target role from the supported list, then regenerate your roadmap.', targetWeek: 1, skills: [], deliverable: null }],
      projectIdeas: [], assessments: [],
    };
  }
  const have = new Map((input.skills || []).map((s) => [s.name, s.proficiency]));
  const gaps = track.skills.map(([skill, required]) => {
    const current = Math.min(5, have.get(skill) || 0);
    return { skill, required, current, gap: Math.max(0, required - current) };
  });
  const open = gaps.filter((g) => g.gap > 0).sort((a, b) => a.required - b.required || b.gap - a.gap);
  const hours = Math.max(2, input.weeklyLearningHours || 6);
  const HOURS_PER_LEVEL = 18;

  const milestones = [];
  let week = 0;
  open.forEach((g, i) => {
    const stage = Math.min(2, Math.floor((i * 3) / Math.max(1, open.length)));
    const level = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'][stage];
    week += Math.max(1, Math.ceil((g.gap * HOURS_PER_LEVEL) / hours));
    milestones.push({
      level,
      title: `Take ${g.skill} from level ${g.current} to ${g.required}`,
      description: `${track.role} typically needs ${g.skill} at level ${g.required}. You rated yourself ${g.current}. Work through the linked resources, then apply the skill in a small exercise.`,
      targetWeek: week,
      skills: [g.skill],
      deliverable: `A short write-up or mini-project showing ${g.skill} in use`,
    });
  });
  const ideas = PROJECT_IDEAS[discipline] || [];
  week += 2;
  milestones.push({
    level: open.length ? 'ADVANCED' : 'INTERMEDIATE',
    title: 'Portfolio project and self-assessment',
    description: open.length
      ? 'Combine the skills above in one project, publish it with a clear README, and submit the evidence to your college for verification.'
      : 'You already meet the listed levels for this role. Build a portfolio project, collect verification for your skills, and look for opportunities that match.',
    targetWeek: week, skills: track.skills.map(([n]) => n).slice(0, 6), deliverable: ideas[0] || 'A portfolio project with documentation',
  });

  const total = gaps.reduce((a, g) => a + g.required, 0);
  const cur = gaps.reduce((a, g) => a + Math.min(g.required, g.current), 0);
  const readiness = total ? Math.round((cur / total) * 100) : 0;
  const summary = `${YEAR_ADVICE[Math.min(4, Math.max(1, input.academicYear || 1))]} Against the demonstration "${track.role}" track you currently cover about ${readiness}% of the listed skill levels in ${DISCIPLINES[discipline] || discipline}. ` +
    (open.length ? `${open.length} skill(s) need work; at ${hours} hours per week the plan runs about ${week} weeks.` : 'No gaps were found in the listed skills.');
  return {
    summary, skillGaps: gaps, milestones: milestones.map((m, i) => ({ ...m, position: i + 1 })),
    projectIdeas: ideas, assessments: ['Self-check: explain each skill to a classmate without notes', 'Ask your department for a mock technical interview'],
  };
}
