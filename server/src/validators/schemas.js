import { z } from 'zod';
import { shortText, optText, optUrl, id, dateStr } from './common.js';
import { DISCIPLINES } from '../data/careerTracks.js';

export const disciplineKey = z.enum(Object.keys(DISCIPLINES));
const optInt = (min, max) => z.coerce.number().int().min(min).max(max).optional().nullable().or(z.literal('').transform(() => undefined));
const optNum = (min, max) => z.coerce.number().min(min).max(max).optional().nullable().or(z.literal('').transform(() => undefined));
const status = (arr) => z.enum(arr);

export const OPP_TYPES = ['JOB', 'INTERNSHIP', 'APPRENTICESHIP', 'GRADUATE_TRAINEE', 'INDUSTRY_PROJECT', 'SPONSORED_TRAINING', 'COURSE', 'RESEARCH', 'MENTORSHIP'];

export const opportunitySchema = z.object({
  type: z.enum(OPP_TYPES), title: shortText(200), description: shortText(8000), location: optText(150),
  workMode: z.enum(['ONSITE', 'REMOTE', 'HYBRID']).default('ONSITE'),
  compensationDisclosed: z.boolean().default(false), compensationMin: optInt(0, 1e9), compensationMax: optInt(0, 1e9), compensationPeriod: optText(40),
  openings: z.coerce.number().int().min(1).max(10000).default(1), deadline: dateStr, startDate: dateStr.optional().or(z.literal('').transform(() => undefined)),
  minCgpa: optNum(0, 10), minPercentage: optNum(0, 100), allowedDisciplines: z.array(disciplineKey).max(8).default([]),
  allowedDegrees: z.array(shortText(60)).max(20).default([]), allowedGraduationYears: z.array(z.coerce.number().int().min(1990).max(2100)).max(10).default([]),
  minAcademicYear: optInt(1, 6), maxActiveBacklogs: optInt(0, 50), minExperienceMonths: optInt(0, 240), requireVerifiedProfile: z.boolean().default(true),
  additionalRequirements: optText(2000), selectionCriteria: optText(2000),
  requirements: z.array(z.object({ skillId: id, minProficiency: z.coerce.number().int().min(1).max(5).default(1), isMandatory: z.boolean().default(true), weight: z.coerce.number().int().min(1).max(5).default(1) })).max(25).default([]),
  targetInstitutionIds: z.array(id).max(50).default([]), organizationId: id.optional(), publish: z.boolean().default(false),
});
export const opportunityUpdateSchema = opportunitySchema.partial();

export const profileSchema = z.object({
  departmentId: id.optional(), degree: shortText(60).optional(), academicYear: z.coerce.number().int().min(1).max(6).optional(), semester: z.coerce.number().int().min(1).max(12).optional(),
  graduationYear: z.coerce.number().int().min(1990).max(2100).optional(), bio: optText(1500), careerInterests: z.array(shortText(60)).max(10).optional(), targetRole: optText(100),
  weeklyLearningHours: z.coerce.number().int().min(1).max(80).optional(), studentIdNumber: optText(60), registrationNumber: optText(60), enrollmentNumber: optText(60),
}).strict();
export const recordSchema = z.object({ semester: z.coerce.number().int().min(1).max(12), cgpa: optNum(0, 10), percentage: optNum(0, 100), activeBacklogs: z.coerce.number().int().min(0).max(50).default(0) }).refine((d) => d.cgpa != null || d.percentage != null, 'Enter a CGPA or a percentage');
export const skillSchema = z.object({ skillId: id, proficiency: z.coerce.number().int().min(1).max(5), acquiredOn: dateStr.optional().or(z.literal('').transform(() => undefined)) });
export const projectSchema = z.object({ title: shortText(150), description: shortText(3000), projectUrl: optUrl, repositoryUrl: optUrl, startedOn: dateStr.optional().or(z.literal('').transform(() => undefined)), endedOn: dateStr.optional().or(z.literal('').transform(() => undefined)), skillIds: z.array(id).max(15).optional() });
export const certSchema = z.object({ name: shortText(150), issuer: shortText(150), credentialId: optText(100), credentialUrl: optUrl, issuedOn: dateStr.optional().or(z.literal('').transform(() => undefined)), expiresOn: dateStr.optional().or(z.literal('').transform(() => undefined)) });
export const submitSchema = z.object({ subjectType: z.enum(['ACADEMIC_RECORD', 'SKILL', 'PROJECT', 'CERTIFICATION']), subjectId: id, documentIds: z.array(id).max(5).default([]) });
export const applySchema = z.object({ coverNote: optText(1500), shareFields: z.array(z.enum(['academics', 'skills', 'projects', 'certifications', 'contact', 'resume'])).max(6).optional() });
export const interviewSchema = z.object({ scheduledAt: dateStr, mode: z.enum(['ONSITE', 'REMOTE', 'HYBRID']).default('ONSITE'), locationOrLink: optText(300), notes: optText(1000) });
export const placementCreateSchema = z.object({ type: z.enum(['INTERVIEW_PREPARATION', 'RESUME_REVIEW', 'MOCK_INTERVIEW', 'OFFER_GUIDANCE', 'DOCUMENT_CHECKLIST', 'ONBOARDING_PREPARATION']), details: optText(1500), applicationId: id.optional() });
export const messageSchema = z.object({ body: shortText(2000) });
export { z, status };
