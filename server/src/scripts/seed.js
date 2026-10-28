// Synthetic DEMONSTRATION data. Everything created here is fictional and labelled "(Demo)".
// Usage:  npm run seed            (first run)
//         npm run seed -- --reset (development only: wipes ALL tables first)
// Requires SEED_DEMO_PASSWORD in .env (never hardcoded, never printed).
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import env from '../config/env.js';
import prisma from '../db.js';
import { TRACKS, DISCIPLINES, allSkillNames, categoryFor, disciplinesForSkill } from '../data/careerTracks.js';
import { refreshCompletion } from '../services/student.js';

const reset = process.argv.includes('--reset');
if (env.isProd && process.env.ALLOW_DEMO_SEED_IN_PRODUCTION !== 'I_UNDERSTAND') {
  console.error('Refusing to seed demonstration data in production.'); process.exit(1);
}
if (!env.SEED_DEMO_PASSWORD || env.SEED_DEMO_PASSWORD.length < 12) {
  console.error('Set SEED_DEMO_PASSWORD in .env (at least 12 characters). It is used for ALL demo accounts and is never printed.'); process.exit(1);
}
if (reset) {
  if (env.isProd) { console.error('--reset is not allowed in production.'); process.exit(1); }
  const tables = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  console.log('All tables truncated.');
}
if (await prisma.platformSetting.findUnique({ where: { key: 'data.demo' } })) { console.log('Demo data already present. Use `npm run seed -- --reset` in development to rebuild.'); process.exit(0); }

const hash = await bcrypt.hash(env.SEED_DEMO_PASSWORD, 12);
const D = '@demo.sanyog.invalid';
const now = new Date();
const days = (n) => new Date(now.getTime() + n * 864e5);
const mkUser = (email, fullName, role, extra = {}) => prisma.user.create({ data: { email: email + D, fullName, role, status: 'ACTIVE', emailVerifiedAt: now, passwordHash: hash, ...extra } });

await prisma.platformSetting.create({ data: { key: 'data.demo', value: true } });

// ── Taxonomy (DEMO, not official) ──
const tax = await prisma.skillTaxonomy.create({ data: { name: 'Demonstration Skill Set', version: 'demo-1', isOfficial: false, notes: 'Synthetic demonstration skills. NOT an official NSQF / NCVET / O*NET mapping. Import official data into a separate taxonomy with isOfficial=true.' } });
const skills = {};
for (const name of allSkillNames()) skills[name] = await prisma.skill.create({ data: { taxonomyId: tax.id, name, category: categoryFor(name), disciplines: disciplinesForSkill(name) } });
const sk = (n) => skills[n].id;

// ── Institutions ──
const inst1 = await prisma.institution.create({ data: { name: 'Demo Institute of Technology (Demo)', institutionCode: 'DEMO-TECH-001', universityName: 'Demo University (fictional)', type: 'Engineering college', state: 'West Bengal', city: 'Kolkata', status: 'VERIFIED', verifiedAt: now, registrationRules: { requiredStudentFields: ['registrationNumber'] }, eligibilityRules: { maxBacklogsForPlacement: 2, minCgpaForPlacement: 5.5 }, academicCalendar: { terms: [{ name: 'Odd semester', start: '07-15', end: '12-20' }, { name: 'Even semester', start: '01-10', end: '05-31' }] } } });
const inst2 = await prisma.institution.create({ data: { name: 'Demo School of Management (Demo)', institutionCode: 'DEMO-MGMT-002', type: 'Management institute', state: 'Maharashtra', city: 'Pune', status: 'VERIFIED', verifiedAt: now, registrationRules: { requiredStudentFields: [] } } });
const dept = {};
for (const [key, label] of Object.entries(DISCIPLINES)) if (key !== 'management') dept[key] = await prisma.department.create({ data: { institutionId: inst1.id, name: label, code: key.toUpperCase(), discipline: key } });
const mgmt = await prisma.department.create({ data: { institutionId: inst2.id, name: 'Management', code: 'MBA', discipline: 'management' } });

// ── Staff, organisations ──
const admin = await mkUser('admin', 'Demo Platform Admin', 'ADMIN', { mustChangePassword: true });
const ALL = ['MANAGE_USERS', 'VERIFY_INSTITUTIONS', 'VERIFY_ORGANIZATIONS', 'VIEW_AUDIT', 'MANAGE_TAXONOMY', 'MANAGE_RESOURCES', 'MANAGE_CONFIG', 'VIEW_AI_USAGE', 'MODERATE_CONTENT', 'VIEW_ANALYTICS', 'VIEW_SYSTEM_HEALTH'];
await prisma.adminGrant.createMany({ data: ALL.map((permission) => ({ userId: admin.id, permission })) });
const col1 = await mkUser('college1', 'Demo College Registrar', 'COLLEGE_AUTHORITY', { mustChangePassword: true });
await prisma.institutionMembership.create({ data: { userId: col1.id, institutionId: inst1.id, title: 'Registrar', canVerifyCredentials: true, canManagePartnerships: true, isPlacementOfficer: true, approvedAt: now } });
const col2 = await mkUser('college2', 'Demo Management Dean', 'COLLEGE_AUTHORITY', { mustChangePassword: true });
await prisma.institutionMembership.create({ data: { userId: col2.id, institutionId: inst2.id, title: 'Dean', canVerifyCredentials: true, canManagePartnerships: true, isPlacementOfficer: true, approvedAt: now } });

const orgA = await prisma.organization.create({ data: { legalName: 'Demo Tech Solutions Private Limited (Demo)', displayName: 'Demo Tech Solutions (Demo)', registrationNumber: 'DEMO-ORG-A', industry: 'Software services', sizeBand: '201-500', website: 'https://example.invalid', repName: 'Demo Recruiter', repDesignation: 'Talent Lead', status: 'VERIFIED', verifiedAt: now } });
const orgB = await prisma.organization.create({ data: { legalName: 'Demo Core Manufacturing Limited (Demo)', displayName: 'Demo Core Manufacturing (Demo)', registrationNumber: 'DEMO-ORG-B', industry: 'Manufacturing', sizeBand: '501-1000', repName: 'Demo HR Manager', repDesignation: 'HR Manager', status: 'VERIFIED', verifiedAt: now } });
const recA = await mkUser('recruiter1', 'Demo Recruiter A', 'INDUSTRY');
await prisma.organizationMember.create({ data: { userId: recA.id, organizationId: orgA.id, title: 'Talent Lead', isOwner: true } });
const recB = await mkUser('recruiter2', 'Demo Recruiter B', 'INDUSTRY');
await prisma.organizationMember.create({ data: { userId: recB.id, organizationId: orgB.id, title: 'HR Manager', isOwner: true } });

// A placeholder agreement document (clearly not a real contract)
await fs.mkdir(env.uploadRoot, { recursive: true });
const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n% DEMONSTRATION PLACEHOLDER - NOT A REAL AGREEMENT\n';
await fs.writeFile(path.join(env.uploadRoot, 'demo-agreement.bin'), pdf);
const agreementDoc = await prisma.document.create({ data: { ownerId: recA.id, kind: 'AGREEMENT', originalName: 'demo-agreement-placeholder.pdf', mimeType: 'application/pdf', sizeBytes: pdf.length, storageKey: 'demo-agreement.bin', sha256: 'demo', institutionId: inst1.id } });
const pA = await prisma.partnership.create({ data: { organizationId: orgA.id, institutionId: inst1.id, requestedById: recA.id, status: 'ACTIVE', validFrom: days(-30), validUntil: days(335), requestNote: 'Demo partnership' } });
await prisma.agreement.create({ data: { partnershipId: pA.id, documentId: agreementDoc.id, status: 'APPROVED', submittedById: recA.id, reviewedById: col1.id, reviewedAt: now, reviewNote: 'Demo approval' } });
await prisma.partnership.create({ data: { organizationId: orgB.id, institutionId: inst1.id, requestedById: recB.id, status: 'REQUESTED', requestNote: 'Demo request awaiting review' } });

// ── Students ──
async function makeStudent(key, name, deptKey, year, grad, status, opts = {}) {
  const u = await mkUser(key, name, 'STUDENT', { status: status === 'VERIFIED' ? 'ACTIVE' : 'PENDING_APPROVAL' });
  const p = await prisma.studentProfile.create({ data: { userId: u.id, institutionId: inst1.id, departmentId: dept[deptKey].id, degree: 'B.Tech', academicYear: year, semester: year * 2 - 1, graduationYear: grad, registrationNumber: `DEMO-${key.toUpperCase()}-2022`, registrationStatus: status, registrationReviewedAt: status === 'VERIFIED' ? now : null, bio: opts.bio ?? 'Demo student profile (synthetic).', careerInterests: opts.interests ?? [], targetRole: opts.target ?? null, weeklyLearningHours: opts.hours ?? 6 } });
  if (status !== 'VERIFIED') await prisma.verificationRequest.create({ data: { institutionId: inst1.id, studentId: p.id, subjectType: 'ENROLLMENT', subjectId: p.id } });
  for (const [sem, cgpa, backlogs] of opts.records ?? []) await prisma.academicRecord.create({ data: { studentId: p.id, semester: sem, cgpa, activeBacklogs: backlogs, verificationStatus: 'VERIFIED', verifiedAt: now } });
  for (const [skill, level, verified] of opts.skills ?? []) await prisma.studentSkill.create({ data: { studentId: p.id, skillId: sk(skill), proficiency: level, verificationStatus: verified ? 'VERIFIED' : 'DRAFT', verifiedAt: verified ? now : null } });
  return p;
}
const s1 = await makeStudent('student1', 'Demo Student One', 'cse', 3, 2027, 'VERIFIED', { interests: ['backend', 'databases'], target: 'Backend Software Engineer', records: [[4, 8.4, 0], [5, 8.6, 0]], skills: [['Python Programming', 4, true], ['SQL & Relational Databases', 3, true], ['Data Structures & Algorithms', 4, true], ['Git & Version Control', 3, false], ['REST API Design', 2, false]] });
const s2 = await makeStudent('student2', 'Demo Student Two', 'cse', 4, 2026, 'VERIFIED', { interests: ['machine learning'], target: 'Machine Learning Engineer', records: [[7, 6.2, 1]], skills: [['Python Programming', 3, true], ['Statistics & Probability', 2, false]] });
const s3 = await makeStudent('student3', 'Demo Student Three', 'ece', 3, 2027, 'VERIFIED', { interests: ['embedded'], target: 'Embedded Systems Engineer', records: [[5, 7.8, 0]], skills: [['Digital Electronics', 3, true], ['Embedded C Programming', 2, false]] });
const s4 = await makeStudent('student4', 'Demo Student Four (pending approval)', 'it', 2, 2028, 'SUBMITTED', { bio: null });
const s5 = await makeStudent('student5', 'Demo Student Five', 'mechanical', 4, 2026, 'VERIFIED', { interests: ['design'], target: 'Design Engineer (CAD)', records: [[7, 7.1, 0]], skills: [['CAD Modelling', 3, true], ['Engineering Mechanics', 3, true]] });

// Deterministic multi-cohort synthetic dataset for realistic filtering/matching demonstrations.
// These records are fictional; the count is intentionally modest for laptops and CI.
const benchmarkDepartments = Object.keys(DISCIPLINES).filter((key) => key !== 'management');
for (let i = 6; i <= 29; i += 1) {
  const discipline = benchmarkDepartments[(i - 6) % benchmarkDepartments.length];
  const year = ((i - 6) % 4) + 1;
  const graduationYear = 2026 + (4 - year);
  const roleTrack = TRACKS[discipline]?.[Math.floor((i - 6) / benchmarkDepartments.length) % 2] ?? TRACKS[discipline][0];
  const skillRows = roleTrack.skills.slice(0, 2 + (i % 3)).map(([name, level], idx) => [name, Math.max(1, Math.min(5, level - ((i + idx) % 2))), (i + idx) % 3 !== 0]);
  const status = i % 6 === 0 ? 'SUBMITTED' : 'VERIFIED';
  await makeStudent(`student${i}`, `Demo Cohort Student ${i}`, discipline, year, graduationYear, status, {
    interests: [roleTrack.role.toLowerCase()], target: roleTrack.role, hours: 3 + (i % 12),
    records: [[Math.max(1, year * 2 - 1), Number((6.1 + ((i * 7) % 39) / 10).toFixed(1)), i % 5 === 0 ? 1 : 0]],
    skills: skillRows, bio: `Synthetic benchmark cohort profile ${i}; not a real person.`,
  });
}
await prisma.project.create({ data: { studentId: s1.id, title: 'Library management API (demo)', description: 'A demo REST API with authentication and a relational database.', repositoryUrl: 'https://example.invalid/repo', verificationStatus: 'VERIFIED', verifiedAt: now, skills: { connect: [{ id: sk('REST API Design') }, { id: sk('SQL & Relational Databases') }] } } });
await prisma.certification.create({ data: { studentId: s1.id, name: 'Demo Database Fundamentals Certificate', issuer: 'Demo Training Provider', verificationStatus: 'DRAFT' } });
await prisma.consentGrant.create({ data: { studentId: s1.id, scope: 'ALUMNI_DISCOVERY', fields: ['name', 'department', 'skills'] } });

// ── Alumni ──
const al1 = await mkUser('alumni1', 'Demo Alumnus One', 'ALUMNI');
const a1 = await prisma.alumniProfile.create({ data: { userId: al1.id, institutionId: inst1.id, departmentId: dept.cse.id, degree: 'B.Tech', graduationYear: 2019, currentEmployer: 'Demo Tech Solutions (Demo)', currentRole: 'Software Engineer', expertise: ['Backend', 'Databases'], bio: 'Synthetic alumni profile.', availableForMentoring: true, verificationStatus: 'VERIFIED', verifiedAt: now } });
await prisma.mentorshipSession.create({ data: { alumniId: a1.id, kind: 'CAREER_SESSION', title: 'Demo: Breaking into backend engineering', description: 'A synthetic example of an alumni career session.', scheduledAt: days(14), capacity: 30 } });
const al2 = await mkUser('alumni2', 'Demo Alumnus Two (pending)', 'ALUMNI', { status: 'PENDING_APPROVAL' });
const a2 = await prisma.alumniProfile.create({ data: { userId: al2.id, institutionId: inst1.id, degree: 'B.Tech', graduationYear: 2018, verificationStatus: 'SUBMITTED' } });
await prisma.verificationRequest.create({ data: { institutionId: inst1.id, alumniId: a2.id, subjectType: 'ALUMNI_GRADUATION', subjectId: a2.id } });

// ── Opportunities (all employer opportunities are fictional) ──
const mkOpp = async (data, reqs, targets) => prisma.opportunity.create({ data: { ...data, createdById: data.organizationId ? recA.id : col1.id, publishedAt: data.status === 'PUBLISHED' ? now : null, requirements: { create: reqs.map(([n, l, m]) => ({ skillId: sk(n), minProficiency: l, isMandatory: m, weight: m ? 2 : 1 })) }, institutions: { create: targets.map((institutionId) => ({ institutionId })) } } });
const oBackend = await mkOpp({ organizationId: orgA.id, type: 'JOB', title: 'Graduate Backend Engineer (Demo)', description: 'Demonstration vacancy. Build and maintain APIs. Not a real job.', location: 'Kolkata', workMode: 'HYBRID', compensationDisclosed: false, openings: 3, deadline: days(25), status: 'PUBLISHED', minCgpa: 7, allowedDisciplines: ['cse', 'it'], allowedDegrees: ['B.Tech'], allowedGraduationYears: [2026, 2027], maxActiveBacklogs: 0, selectionCriteria: 'Online test, technical interview, HR round (demo).' }, [['Python Programming', 3, true], ['SQL & Relational Databases', 3, true], ['REST API Design', 3, false], ['Git & Version Control', 2, false]], [inst1.id]);
await mkOpp({ organizationId: orgA.id, type: 'INTERNSHIP', title: 'Software Engineering Intern (Demo)', description: 'Demonstration internship, 6 months.', location: 'Remote', workMode: 'REMOTE', compensationDisclosed: true, compensationMin: 15000, compensationMax: 25000, compensationPeriod: 'per month (demo figure)', openings: 5, deadline: days(12), status: 'PUBLISHED', minAcademicYear: 3, allowedDisciplines: ['cse', 'it', 'ece'], minCgpa: 6.5 }, [['Python Programming', 2, true], ['Data Structures & Algorithms', 3, false]], [inst1.id]);
await mkOpp({ organizationId: orgA.id, type: 'GRADUATE_TRAINEE', title: 'Embedded Software Trainee (Demo)', description: 'Demonstration trainee role for electronics graduates.', location: 'Pune', openings: 2, deadline: days(40), status: 'PUBLISHED', allowedDisciplines: ['ece', 'electrical'], minCgpa: 6.5, allowedGraduationYears: [2026, 2027] }, [['Embedded C Programming', 3, true], ['Digital Electronics', 3, true]], [inst1.id]);
await mkOpp({ postedByInstitutionId: inst1.id, type: 'COURSE', title: 'Demo Bridge Course: Databases in Practice', description: 'A demonstration short course published by the college itself.', location: 'On campus', openings: 60, deadline: days(20), status: 'PUBLISHED', allowedDisciplines: ['cse', 'it'] }, [['SQL & Relational Databases', 1, false]], [inst1.id]);
await mkOpp({ organizationId: orgA.id, type: 'APPRENTICESHIP', title: 'Draft apprenticeship (Demo, unpublished)', description: 'A draft that has not been published.', deadline: days(60), status: 'DRAFT' }, [], []);

// Role- and discipline-diverse opportunity corpus for matching, filtering and dashboard demos.
const benchmarkTypes = ['INTERNSHIP', 'JOB', 'GRADUATE_TRAINEE', 'INDUSTRY_PROJECT', 'SPONSORED_TRAINING', 'RESEARCH', 'MENTORSHIP'];
let benchmarkIndex = 0;
for (const [discipline, tracks] of Object.entries(TRACKS)) {
  for (const track of tracks) {
    const type = benchmarkTypes[benchmarkIndex % benchmarkTypes.length];
    const requirements = track.skills.slice(0, 4).map(([name, level], idx) => [name, Math.max(1, Math.min(5, level - (idx % 2))), idx < 2]);
    await mkOpp({
      organizationId: orgA.id, type, title: `${track.role} Pathway ${benchmarkIndex + 1} (Demo)`,
      description: `Synthetic ${type.toLowerCase().replaceAll('_', ' ')} opportunity for the ${discipline} discipline. Not a real vacancy.`,
      location: benchmarkIndex % 2 ? 'Remote' : 'Kolkata', workMode: benchmarkIndex % 2 ? 'REMOTE' : 'HYBRID',
      openings: 1 + (benchmarkIndex % 8), deadline: days(10 + benchmarkIndex), status: 'PUBLISHED',
      allowedDisciplines: [discipline], allowedDegrees: ['B.Tech'],
      allowedGraduationYears: [2026, 2027, 2028, 2029], minAcademicYear: type === 'INTERNSHIP' ? 2 : null,
      minCgpa: 6 + (benchmarkIndex % 3) * 0.5, maxActiveBacklogs: benchmarkIndex % 2 ? 1 : 0,
    }, requirements, [inst1.id]);
    benchmarkIndex += 1;
  }
}

// An application in progress so every dashboard has something to show
const app1 = await prisma.application.create({ data: { opportunityId: oBackend.id, studentId: s1.id, status: 'SHORTLISTED', eligibility: 'REQUIRES_REVIEW', eligibilitySnapshot: { checks: [], evaluatedAt: now.toISOString(), note: 'Seeded; will be recalculated on the next profile change.' }, matchScore: 82, coverNote: 'Demo application' } });
await prisma.applicationStatusEvent.createMany({ data: [{ applicationId: app1.id, toStatus: 'SUBMITTED', actorId: s1.userId }, { applicationId: app1.id, fromStatus: 'SUBMITTED', toStatus: 'SHORTLISTED', actorId: recA.id }] });
await prisma.consentGrant.create({ data: { studentId: s1.id, scope: 'RECRUITER_PROFILE_VIEW', granteeOrganizationId: orgA.id, opportunityId: oBackend.id, fields: ['academics', 'skills', 'projects'] } });

// ── Learning library (external links; NOT checked from the build environment) ──
const R = (title, url, type, provider, licenseNote, disc, years, skillNames, description) => prisma.learningResource.create({ data: { title, url, type, provider, licenseNote, disciplines: disc, academicYears: years, status: 'ACTIVE', description: `${description} (Demo listing — an administrator should verify this link.)`, skills: { connect: skillNames.map((n) => ({ id: sk(n) })) } } });
const ALLD = Object.keys(DISCIPLINES);
await R('The Python Tutorial', 'https://docs.python.org/3/tutorial/', 'DOCUMENTATION', 'Python Software Foundation', 'Official documentation, free to read', ['cse', 'it', 'biotech', 'electrical'], [1, 2], ['Python Programming'], 'Official introductory tutorial.');
await R('MDN Learn Web Development', 'https://developer.mozilla.org/en-US/docs/Learn', 'TUTORIAL', 'MDN Web Docs', 'Open content, see site licence', ['cse', 'it'], [1, 2, 3], ['JavaScript Programming', 'HTML & CSS'], 'Structured web development tutorials.');
await R('Pro Git (book)', 'https://git-scm.com/book/en/v2', 'OPEN_TEXTBOOK', 'git-scm.com', 'Creative Commons licence, see site', ['cse', 'it'], [1, 2], ['Git & Version Control'], 'Free online book on Git.');
await R('React documentation: Learn', 'https://react.dev/learn', 'DOCUMENTATION', 'React', 'Free to read', ['it', 'cse'], [2, 3], ['React Basics', 'JavaScript Programming'], 'Official React learning guide.');
await R('PostgreSQL Tutorial (official docs)', 'https://www.postgresql.org/docs/current/tutorial.html', 'DOCUMENTATION', 'PostgreSQL Global Development Group', 'Free to read', ['cse', 'it', 'biotech', 'management'], [2, 3], ['SQL & Relational Databases'], 'SQL and database basics from the official docs.');
await R('Docker: Get started', 'https://docs.docker.com/get-started/', 'DOCUMENTATION', 'Docker', 'Free to read', ['it', 'cse'], [3, 4], ['CI/CD Basics', 'Cloud Fundamentals'], 'Introduction to containers.');
await R('MIT OpenCourseWare', 'https://ocw.mit.edu/', 'COURSE', 'MIT', 'Mostly CC BY-NC-SA, check each course', ALLD, [1, 2, 3, 4], ['Data Structures & Algorithms', 'Statistics & Probability', 'Thermodynamics', 'Control Systems'], 'Free course materials across engineering and management.');
await R('NPTEL', 'https://nptel.ac.in/', 'COURSE', 'NPTEL', 'Free to watch; certification optional and paid', ALLD, [1, 2, 3, 4], ['Digital Electronics', 'Power Systems Analysis', 'Structural Analysis', 'Fluid Mechanics', 'Heat Transfer'], 'Indian university-level video courses.');
await R('SWAYAM', 'https://swayam.gov.in/', 'COURSE', 'SWAYAM', 'Free courses; proctored certificates may be paid', ALLD, [1, 2, 3, 4], ['Business Communication', 'Marketing Fundamentals'], 'National online course platform.');
await R('OpenStax', 'https://openstax.org/', 'OPEN_TEXTBOOK', 'OpenStax', 'Creative Commons licensed textbooks', ALLD, [1, 2], ['Statistics & Probability', 'Financial Accounting Basics', 'Microbiology'], 'Free peer-reviewed open textbooks.');
await R('Open Textbook Library', 'https://open.umn.edu/opentextbooks/', 'OPEN_TEXTBOOK', 'University of Minnesota', 'Open licences, see each book', ALLD, [1, 2, 3], ['Operations Management', 'Marketing Fundamentals', 'Business Communication'], 'Catalogue of open textbooks.');
await R('FOSSEE (IIT Bombay)', 'https://fossee.in/', 'PRACTICE', 'FOSSEE', 'Free and open-source tools and tutorials', ['electrical', 'mechanical', 'civil', 'ece', 'cse'], [2, 3], ['MATLAB / Simulink', 'Finite Element Analysis'], 'Open-source alternatives and tutorials for engineering software.');
await R('Spoken Tutorial', 'https://spoken-tutorial.org/', 'TUTORIAL', 'IIT Bombay', 'Free tutorials', ['cse', 'it', 'ece', 'biotech'], [1, 2], ['Python Programming', 'Embedded C Programming'], 'Spoken video tutorials on open-source software.');
await R('NCBI Bookshelf', 'https://www.ncbi.nlm.nih.gov/books/', 'BOOK', 'NCBI', 'Free to read; individual licences vary', ['biotech'], [2, 3, 4], ['Molecular Biology Techniques', 'Microbiology'], 'Biomedical books and documents.');
await R('EMBL-EBI Training', 'https://www.ebi.ac.uk/training/', 'COURSE', 'EMBL-EBI', 'Free online courses', ['biotech'], [3, 4], ['Bioinformatics Tools', 'Biostatistics'], 'Bioinformatics online training.');
await R('arXiv (open-access preprints)', 'https://arxiv.org/', 'RESEARCH_PAPER', 'arXiv', 'Open-access preprints', ['cse', 'ece', 'electrical', 'it'], [4], ['Machine Learning Fundamentals'], 'Open-access research preprints.');
await R('FreeCAD', 'https://www.freecad.org/', 'PRACTICE', 'FreeCAD', 'Open-source software', ['mechanical', 'civil'], [2, 3], ['CAD Modelling'], 'Free parametric 3D CAD modeller for practice.');

// A demo placement-cell request and a notification
await prisma.notification.create({ data: { userId: s1.userId, type: 'SYSTEM', title: 'Welcome to the demo', body: 'All data on this site is synthetic demonstration data.', linkPath: '/student' } });
for (const s of [s1, s2, s3, s5]) await refreshCompletion(s.id);
console.log(`Demo data created: 29 student profiles, 2 institutions, 2 organizations and ${benchmarkIndex + 5} opportunities (plus alumni, applications, skills and resources).`);
console.log('All benchmark records are synthetic and must not be presented as real people, jobs, placements or partner outcomes.');
console.log('Demo accounts use the email pattern *' + D + ' and the password from SEED_DEMO_PASSWORD.');
console.log('Privileged demo accounts (admin, college1, college2) must change their password at first login.');
await prisma.$disconnect();
