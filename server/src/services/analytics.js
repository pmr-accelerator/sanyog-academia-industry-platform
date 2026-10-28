// Every number here is computed from database rows. Definitions:
//  • Placement conversion = students with ≥1 accepted offer ÷ verified students of the institution.
//  • Time-to-placement    = average days from a student's FIRST application to their FIRST accepted offer.
//  • Time-to-fill         = average days from an opportunity's publish date to its FIRST accepted offer.
import prisma from '../db.js';
import { daysBetween, monthKey } from '../utils/dates.js';
import { scoreBuckets } from '../matching/matcher.js';
import { listForStudent as oppsForStudent } from './opportunity.js';
import { recentErrors } from '../middleware/errorHandler.js';

const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
const countBy = (rows, key) => rows.reduce((m, r) => { m[r[key]] = (m[r[key]] || 0) + 1; return m; }, {});

export async function student(st) {
  const sid = st.id;
  const [profile, skills, apps, roadmap, progress, interviews] = await Promise.all([
    prisma.studentProfile.findUnique({ where: { id: sid } }),
    prisma.studentSkill.findMany({ where: { studentId: sid }, orderBy: { createdAt: 'asc' } }),
    prisma.application.findMany({ where: { studentId: sid }, select: { status: true } }),
    prisma.roadmap.findFirst({ where: { studentId: sid, status: 'ACTIVE' }, include: { milestones: { select: { status: true } } } }),
    prisma.resourceProgress.findMany({ where: { studentId: sid } }),
    prisma.interview.findMany({ where: { application: { studentId: sid }, scheduledAt: { gte: new Date() }, status: 'SCHEDULED' }, orderBy: { scheduledAt: 'asc' }, take: 5, include: { application: { select: { opportunity: { select: { title: true } } } } } }),
  ]);
  const verifiedCounts = {};
  for (const [label, model] of [['skills', 'studentSkill'], ['projects', 'project'], ['certifications', 'certification'], ['academicRecords', 'academicRecord']]) {
    verifiedCounts[label] = { verified: await prisma[model].count({ where: { studentId: sid, verificationStatus: 'VERIFIED' } }), total: await prisma[model].count({ where: { studentId: sid } }) };
  }
  let cumulative = 0; const byMonth = {};
  for (const s of skills) { cumulative += 1; byMonth[monthKey(s.createdAt)] = cumulative; }
  const { rows: opps } = await oppsForStudent(st, {}, { skip: 0, take: 300 });
  const gaps = roadmap?.skillGaps || [];
  const haveByName = new Map((await prisma.studentSkill.findMany({ where: { studentId: sid }, include: { skill: true } })).map((x) => [x.skill.name, x.proficiency]));
  const need = gaps.reduce((a, g) => a + g.required, 0);
  const closed = gaps.reduce((a, g) => a + Math.min(g.required, haveByName.get(g.skill) || 0), 0);
  return {
    profileCompletion: profile.profileCompletion, registrationStatus: profile.registrationStatus, verifiedCounts,
    skillsOverTime: Object.entries(byMonth).map(([month, total]) => ({ month, total })),
    roadmap: roadmap ? { targetRole: roadmap.targetRole, source: roadmap.source, done: roadmap.milestones.filter((m) => m.status === 'COMPLETED').length, total: roadmap.milestones.length, gapSkillsOpen: gaps.filter((g) => g.required > g.current).length, gapSkillsTotal: gaps.length, gapClosurePercent: need ? Math.round((closed / need) * 100) : 0 } : null,
    applicationsByStatus: countBy(apps, 'status'), upcomingInterviews: interviews.map((i) => ({ id: i.id, at: i.scheduledAt, title: i.application.opportunity.title, mode: i.mode })),
    eligibility: countBy(opps, 'eligibility'), resources: { bookmarked: progress.filter((p) => p.bookmarked).length, completed: progress.filter((p) => p.completedAt).length },
  };
}

async function acceptedEvents(where) {
  return prisma.applicationStatusEvent.findMany({ where: { toStatus: 'OFFER_ACCEPTED', application: where }, include: { application: { select: { studentId: true, opportunityId: true, opportunity: { select: { publishedAt: true } } } } }, orderBy: { createdAt: 'asc' } });
}

export async function college(institutionId) {
  const now = new Date();
  const studentWhere = { institutionId, registrationStatus: 'VERIFIED' };
  const appWhere = { student: { institutionId } };
  const [verified, pendingReg, pendingTasks, departments, apps, partnerships, firstApps, accepted] = await Promise.all([
    prisma.studentProfile.count({ where: studentWhere }),
    prisma.studentProfile.count({ where: { institutionId, registrationStatus: { in: ['SUBMITTED', 'CHANGES_REQUESTED'] } } }),
    prisma.verificationRequest.count({ where: { institutionId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
    prisma.department.findMany({ where: { institutionId }, include: { students: { where: studentWhere, select: { id: true, skills: { where: { verificationStatus: 'VERIFIED' }, select: { skill: { select: { name: true } } } } } } } } ),
    prisma.application.findMany({ where: appWhere, select: { status: true, studentId: true } }),
    prisma.partnership.findMany({ where: { institutionId }, include: { organization: { select: { displayName: true } } } }),
    prisma.application.groupBy({ by: ['studentId'], where: appWhere, _min: { appliedAt: true } }),
    acceptedEvents(appWhere),
  ]);
  const placed = new Set(accepted.map((e) => e.application.studentId));
  const firstApp = new Map(firstApps.map((f) => [f.studentId, f._min.appliedAt]));
  const firstAccept = new Map();
  for (const e of accepted) if (!firstAccept.has(e.application.studentId)) firstAccept.set(e.application.studentId, e.createdAt);
  const days = [...firstAccept].map(([sid, at]) => daysBetween(firstApp.get(sid), at));
  const deptStats = departments.map((d) => {
    const counts = {};
    d.students.forEach((s) => s.skills.forEach((k) => { counts[k.skill.name] = (counts[k.skill.name] || 0) + 1; }));
    return { department: d.name, verifiedStudents: d.students.length, topSkills: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([skill, students]) => ({ skill, students })) };
  });
  // Skill-gap trend: skills demanded by live opportunities vs. verified students holding them.
  const demand = await prisma.opportunityRequirement.findMany({ where: { opportunity: { status: 'PUBLISHED', institutions: { some: { institutionId } } } }, include: { skill: true } });
  const demandBy = {}; demand.forEach((d) => { demandBy[d.skill.name] = (demandBy[d.skill.name] || 0) + 1; });
  const supply = await prisma.studentSkill.groupBy({ by: ['skillId'], where: { verificationStatus: 'VERIFIED', student: studentWhere }, _count: { skillId: true } });
  const supplyNames = await prisma.skill.findMany({ where: { id: { in: supply.map((s) => s.skillId) } } });
  const supplyBy = Object.fromEntries(supply.map((s) => [supplyNames.find((n) => n.id === s.skillId)?.name, s._count.skillId]));
  const skillGaps = Object.entries(demandBy).map(([skill, demanded]) => ({ skill, openings: demanded, verifiedStudents: supplyBy[skill] || 0 })).sort((a, b) => b.openings - a.openings || a.verifiedStudents - b.verifiedStudents).slice(0, 10);
  const library = await prisma.learningResource.findMany({ where: { status: 'ACTIVE' }, select: { skills: { select: { name: true } } } });
  const covered = new Set(library.flatMap((r) => r.skills.map((s) => s.name)));
  const demandedNames = Object.keys(demandBy);
  return {
    verifiedStudents: verified, pendingRegistrations: pendingReg, pendingVerificationTasks: pendingTasks,
    applications: { total: apps.length, byStatus: countBy(apps, 'status') },
    placement: { placedStudents: placed.size, conversionPercent: verified ? Math.round((placed.size / verified) * 1000) / 10 : null, avgDaysToPlacement: avg(days), definition: 'Conversion = students with an accepted offer ÷ verified students. Time-to-placement = days from first application to first accepted offer, averaged.' },
    departments: deptStats, skillGaps,
    industryEngagement: { activePartnerships: partnerships.filter((p) => p.status === 'ACTIVE').length, organizations: new Set(partnerships.map((p) => p.organizationId)).size, publishedOpportunities: await prisma.opportunity.count({ where: { status: 'PUBLISHED', institutions: { some: { institutionId } } } }) },
    mouStatus: { byStatus: countBy(partnerships, 'status'), expiringWithin60Days: partnerships.filter((p) => p.status === 'ACTIVE' && p.validUntil && p.validUntil > now && daysBetween(now, p.validUntil) <= 60).map((p) => ({ organization: p.organization.displayName, validUntil: p.validUntil })) },
    employerFeedback: { available: false, note: 'Employer feedback is not collected in this version.' },
    courseAlignment: { demandedSkills: demandedNames.length, skillsWithLibraryResources: demandedNames.filter((n) => covered.has(n)).length, definition: 'Share of skills demanded by live opportunities that have at least one active library resource.' },
  };
}

export async function industry(org) {
  const opps = await prisma.opportunity.findMany({ where: { organizationId: org.id }, select: { id: true, status: true, publishedAt: true } });
  const apps = await prisma.application.findMany({ where: { opportunity: { organizationId: org.id } }, select: { status: true, eligibility: true, matchScore: true } });
  const accepted = await acceptedEvents({ opportunity: { organizationId: org.id } });
  const firstByOpp = new Map();
  for (const e of accepted) if (!firstByOpp.has(e.application.opportunityId)) firstByOpp.set(e.application.opportunityId, e);
  const fill = [...firstByOpp.values()].filter((e) => e.application.opportunity.publishedAt).map((e) => daysBetween(e.application.opportunity.publishedAt, e.createdAt));
  const pipeline = countBy(apps, 'status');
  return {
    publishedVacancies: opps.filter((o) => o.status === 'PUBLISHED').length, totalVacancies: opps.length, applicants: apps.length,
    eligibleApplicants: apps.filter((a) => a.eligibility === 'ELIGIBLE').length, pipeline,
    conversionPercent: apps.length ? Math.round(((pipeline.OFFER_ACCEPTED || 0) / apps.length) * 1000) / 10 : null,
    avgDaysToFill: avg(fill), definition: 'Time-to-fill = days from publish date to the first accepted offer for a vacancy, averaged over vacancies with an accepted offer.',
    matchDistribution: scoreBuckets(apps.map((a) => a.matchScore)),
  };
}

export async function alumni(a) {
  const [refs, sessions, enrol] = await Promise.all([prisma.referral.findMany({ where: { alumniId: a.id }, select: { status: true } }), prisma.mentorshipSession.count({ where: { alumniId: a.id } }), prisma.sessionEnrollment.count({ where: { session: { alumniId: a.id } } })]);
  return { referralsMade: refs.length, outcomes: countBy(refs, 'status'), hires: refs.filter((r) => r.status === 'HIRED').length, sessionsPublished: sessions, studentEnrollments: enrol };
}

export async function admin() {
  const since = new Date(Date.now() - 7 * 864e5);
  const [users, insts, orgs, apps, ai, audits, studentsByDisc] = await Promise.all([
    prisma.user.findMany({ select: { role: true, status: true } }), prisma.institution.findMany({ select: { status: true } }), prisma.organization.findMany({ select: { status: true } }),
    prisma.application.count(), prisma.aiUsageLog.findMany({ where: { createdAt: { gte: since } }, select: { usedFallback: true, success: true, provider: true } }),
    prisma.auditEvent.groupBy({ by: ['severity'], where: { createdAt: { gte: since } }, _count: { severity: true } }),
    prisma.studentProfile.findMany({ select: { department: { select: { discipline: true } } } }),
  ]);
  return {
    usersByRole: countBy(users, 'role'), usersByStatus: countBy(users, 'status'), institutionsByStatus: countBy(insts, 'status'), organizationsByStatus: countBy(orgs, 'status'), totalApplications: apps,
    aiLast7Days: { requests: ai.length, fallbackUsed: ai.filter((a) => a.usedFallback).length, providerCalls: ai.filter((a) => !a.usedFallback).length },
    eventsLast7Days: Object.fromEntries(audits.map((a) => [a.severity, a._count.severity])), studentsByDiscipline: countBy(studentsByDisc.map((s) => ({ d: s.department?.discipline || 'unassigned' })), 'd'),
    recentServerErrors: recentErrors.slice(0, 10),
  };
}

// Fairness monitoring: outcome rates by DISCIPLINE and INSTITUTION only (never protected characteristics, which are not stored).
// Groups smaller than K are suppressed to avoid re-identification. This is a monitoring aid, not a legal audit.
export async function fairness(K = 5) {
  const rows = await prisma.application.findMany({ select: { status: true, eligibility: true, student: { select: { institution: { select: { name: true } }, department: { select: { discipline: true } } } } } });
  const build = (keyFn) => {
    const g = {};
    for (const r of rows) { const k = keyFn(r); g[k] = g[k] || { applications: 0, shortlistedOrBetter: 0, offers: 0 }; g[k].applications += 1; if (!['SUBMITTED', 'REJECTED', 'WITHDRAWN'].includes(r.status)) g[k].shortlistedOrBetter += 1; if (['OFFER_MADE', 'OFFER_ACCEPTED'].includes(r.status)) g[k].offers += 1; }
    return Object.entries(g).map(([group, v]) => v.applications < K ? { group, suppressed: true, note: `Fewer than ${K} applications` } : { group, applications: v.applications, shortlistRate: Math.round((v.shortlistedOrBetter / v.applications) * 100), offerRate: Math.round((v.offers / v.applications) * 100) });
  };
  return { minGroupSize: K, byDiscipline: build((r) => r.student.department?.discipline || 'unassigned'), byInstitution: build((r) => r.student.institution.name), note: 'Large gaps between groups are a prompt to investigate, not proof of bias.' };
}
