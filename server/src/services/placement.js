import prisma from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { notify, notifyMany } from './notify.js';

const CHECKLISTS = {
  INTERVIEW_PREPARATION: ['Read the job description', 'Prepare a two-minute introduction', 'Review core subject topics', 'Prepare questions for the interviewer'],
  RESUME_REVIEW: ['Upload the latest resume', 'List target roles', 'Update project descriptions'],
  MOCK_INTERVIEW: ['Choose a role to practise', 'Pick a slot', 'Prepare a short self-introduction'],
  OFFER_GUIDANCE: ['Read the offer letter fully', 'List questions about role, pay and joining terms', 'Confirm response deadline'],
  DOCUMENT_CHECKLIST: ['Identity proof', 'Marksheets and degree certificates', 'Passport-size photographs', 'Bank account details'],
  ONBOARDING_PREPARATION: ['Confirm joining date and location', 'Collect required documents', 'Plan relocation or remote setup', 'Save HR contact details'],
};
const NEEDS_APPLICATION = { INTERVIEW_PREPARATION: ['INTERVIEW_SCHEDULED'], OFFER_GUIDANCE: ['OFFER_MADE', 'OFFER_ACCEPTED'], ONBOARDING_PREPARATION: ['OFFER_ACCEPTED'] };

export async function create(student, { type, details, applicationId }) {
  const need = NEEDS_APPLICATION[type];
  let app = null;
  if (applicationId) { app = await prisma.application.findFirst({ where: { id: applicationId, studentId: student.id } }); if (!app) throw notFound('Application not found'); }
  if (need && (!app || !need.includes(app.status))) throw badRequest('This kind of help is available once you have the matching interview invitation or offer. Link the application.');
  const r = await prisma.placementRequest.create({ data: { studentId: student.id, institutionId: student.institutionId, applicationId: app?.id, type, details, checklist: CHECKLISTS[type].map((label) => ({ label, done: false })) } });
  const officers = await prisma.institutionMembership.findMany({ where: { institutionId: student.institutionId, isPlacementOfficer: true, approvedAt: { not: null } }, select: { userId: true } });
  await notifyMany(officers.map((o) => o.userId), { type: 'PLACEMENT_SUPPORT', title: 'New placement support request', body: type.replace(/_/g, ' ').toLowerCase(), linkPath: `/college/placement/${r.id}` });
  return r;
}

const include = { student: { include: { user: { select: { fullName: true } } } }, application: { select: { id: true, status: true, opportunity: { select: { title: true } } } }, appointments: { orderBy: { scheduledAt: 'asc' } } };
export const listForStudent = (student) => prisma.placementRequest.findMany({ where: { studentId: student.id }, orderBy: { createdAt: 'desc' }, include });
export const listForCollege = (institutionId, status) => prisma.placementRequest.findMany({ where: { institutionId, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, include });

// Access: the student who owns it, or a placement officer of the same institution.
export async function load(req, id) {
  const r = await prisma.placementRequest.findUnique({ where: { id }, include: { ...include, messages: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { fullName: true, role: true } } } } } });
  if (!r) throw notFound();
  if (req.user.role === 'STUDENT') { if (r.student.userId !== req.user.id) throw notFound(); return { r, side: 'student' }; }
  if (req.user.role === 'COLLEGE_AUTHORITY' && req.memberships?.some((m) => m.institutionId === r.institutionId && m.isPlacementOfficer)) return { r, side: 'officer' };
  throw forbidden();
}
export const get = async (req, id) => (await load(req, id)).r;

export async function addMessage(req, id, body) {
  const { r, side } = await load(req, id);
  if (r.status === 'CLOSED') throw conflict('This request is closed');
  const m = await prisma.placementMessage.create({ data: { requestId: id, senderId: req.user.id, body } });
  if (side === 'student') { if (r.assignedOfficerId) await notify(r.assignedOfficerId, { type: 'PLACEMENT_SUPPORT', title: 'New message from a student', body: body.slice(0, 80), linkPath: `/college/placement/${id}` }); }
  else await notify(r.student.userId, { type: 'PLACEMENT_SUPPORT', title: 'New message from the placement cell', body: body.slice(0, 80), linkPath: `/student/placement/${id}` });
  return m;
}
export async function assign(req, id, officerUserId) {
  const { r, side } = await load(req, id);
  if (side !== 'officer') throw forbidden();
  const target = officerUserId || req.user.id;
  if (!(await prisma.institutionMembership.findFirst({ where: { userId: target, institutionId: r.institutionId, isPlacementOfficer: true, approvedAt: { not: null } } }))) throw badRequest('That person is not a placement officer here');
  await prisma.placementRequest.update({ where: { id }, data: { assignedOfficerId: target, status: r.status === 'OPEN' ? 'ASSIGNED' : r.status } });
  await notify(r.student.userId, { type: 'PLACEMENT_SUPPORT', title: 'A placement officer was assigned', body: 'Your request is now being handled.', linkPath: `/student/placement/${id}` });
  return { assigned: target };
}
export async function schedule(req, id, d) {
  const { r, side } = await load(req, id);
  if (side !== 'officer') throw forbidden();
  if (new Date(d.scheduledAt) <= new Date()) throw badRequest('Choose a future time');
  const a = await prisma.placementAppointment.create({ data: { requestId: id, scheduledAt: d.scheduledAt, mode: d.mode, locationOrLink: d.locationOrLink } });
  await prisma.placementRequest.update({ where: { id }, data: { status: 'SCHEDULED' } });
  await notify(r.student.userId, { type: 'PLACEMENT_SUPPORT', title: 'Appointment scheduled', body: new Date(d.scheduledAt).toLocaleString('en-IN'), linkPath: `/student/placement/${id}` });
  return a;
}
export async function setStatus(req, id, { status, resolutionNote }) {
  const { r, side } = await load(req, id);
  if (side !== 'officer') throw forbidden();
  if (status === 'RESOLVED' && !resolutionNote) throw badRequest('Add a resolution note');
  await prisma.placementRequest.update({ where: { id }, data: { status, resolutionNote: resolutionNote ?? r.resolutionNote } });
  await notify(r.student.userId, { type: 'PLACEMENT_SUPPORT', title: `Request ${status.toLowerCase()}`, body: resolutionNote || '', linkPath: `/student/placement/${id}` });
  return { status };
}
export async function toggleChecklist(req, id, index) {
  const { r } = await load(req, id);
  const list = Array.isArray(r.checklist) ? [...r.checklist] : [];
  if (!list[index]) throw badRequest('No such checklist item');
  list[index] = { ...list[index], done: !list[index].done };
  await prisma.placementRequest.update({ where: { id }, data: { checklist: list } });
  return list;
}
export async function feedback(req, id, { rating, text }) {
  const { r, side } = await load(req, id);
  if (side !== 'student') throw forbidden();
  if (!['RESOLVED', 'CLOSED'].includes(r.status)) throw conflict('Feedback is available after the request is resolved');
  await prisma.placementRequest.update({ where: { id }, data: { feedbackRating: rating, feedbackText: text, status: 'CLOSED' } });
  return { ok: true };
}
