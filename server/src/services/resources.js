import prisma from '../db.js';
import { badRequest, notFound } from '../utils/errors.js';

function where(q) {
  const w = { status: 'ACTIVE' };
  if (q.type) w.type = q.type;
  if (q.discipline) w.disciplines = { has: q.discipline };
  if (q.year) w.academicYears = { has: Number(q.year) };
  if (q.skill) w.skills = { some: { name: { contains: q.skill, mode: 'insensitive' } } };
  if (q.q) w.OR = [{ title: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }, { provider: { contains: q.q, mode: 'insensitive' } }];
  return w;
}
const sel = { id: true, title: true, description: true, url: true, type: true, provider: true, licenseNote: true, isExternal: true, disciplines: true, academicYears: true, language: true, lastCheckedAt: true, skills: { select: { name: true } } };

export async function list(q, page, student = null) {
  const w = where(q);
  if (student && (q.bookmarked === 'true' || q.completed === 'true')) w.progress = { some: { studentId: student.id, ...(q.bookmarked === 'true' ? { bookmarked: true } : {}), ...(q.completed === 'true' ? { completedAt: { not: null } } : {}) } };
  const [total, rows] = await Promise.all([prisma.learningResource.count({ where: w }), prisma.learningResource.findMany({ where: w, select: { ...sel, ...(student ? { progress: { where: { studentId: student.id }, select: { bookmarked: true, completedAt: true } } } : {}) }, orderBy: { title: 'asc' }, skip: page.skip, take: page.take })]);
  return { total, rows: rows.map(({ progress, skills, ...r }) => ({ ...r, skills: skills.map((s) => s.name), bookmarked: Boolean(progress?.[0]?.bookmarked), completed: Boolean(progress?.[0]?.completedAt) })) };
}

async function ensure(id) { if (!(await prisma.learningResource.findFirst({ where: { id, status: 'ACTIVE' } }))) throw notFound(); }
export async function toggleBookmark(student, id) {
  await ensure(id);
  const key = { studentId_resourceId: { studentId: student.id, resourceId: id } };
  const cur = await prisma.resourceProgress.findUnique({ where: key });
  const bookmarked = !cur?.bookmarked;
  await prisma.resourceProgress.upsert({ where: key, update: { bookmarked }, create: { studentId: student.id, resourceId: id, bookmarked } });
  return { bookmarked };
}
export async function toggleComplete(student, id) {
  await ensure(id);
  const key = { studentId_resourceId: { studentId: student.id, resourceId: id } };
  const cur = await prisma.resourceProgress.findUnique({ where: key });
  const done = !cur?.completedAt;
  await prisma.resourceProgress.upsert({ where: key, update: { completedAt: done ? new Date() : null }, create: { studentId: student.id, resourceId: id, completedAt: done ? new Date() : null } });
  return { completed: done };
}

// Recommendations come from (1) the active roadmap's skill gaps, else (2) discipline + year.
export async function recommended(student) {
  const profile = await prisma.studentProfile.findUnique({ where: { id: student.id }, include: { department: true } });
  const roadmap = await prisma.roadmap.findFirst({ where: { studentId: student.id, status: 'ACTIVE' } });
  const gapSkills = (roadmap?.skillGaps || []).filter((g) => g.required > g.current).map((g) => g.skill);
  let rows = gapSkills.length ? await prisma.learningResource.findMany({ where: { status: 'ACTIVE', skills: { some: { name: { in: gapSkills } } } }, select: { ...sel }, take: 8 }) : [];
  const reason = rows.length ? 'Matches skill gaps in your roadmap' : 'Matches your discipline and year';
  if (!rows.length) rows = await prisma.learningResource.findMany({ where: { status: 'ACTIVE', ...(profile.department ? { disciplines: { has: profile.department.discipline } } : {}), academicYears: { has: profile.academicYear } }, select: { ...sel }, take: 8 });
  return { reason, rows: rows.map((r) => ({ ...r, skills: r.skills.map((s) => s.name) })) };
}

// ── Admin management (called from the admin routes) ──
export async function adminList(q, page) {
  const w = {}; if (q.status) w.status = q.status; if (q.q) w.title = { contains: q.q, mode: 'insensitive' };
  const [total, rows] = await Promise.all([prisma.learningResource.count({ where: w }), prisma.learningResource.findMany({ where: w, include: { skills: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip: page.skip, take: page.take })]);
  return { total, rows };
}
export async function adminSave(userId, id, d) {
  const { skillIds, ...rest } = d;
  const skills = skillIds ? (id ? { set: skillIds.map((s) => ({ id: s })) } : { connect: skillIds.map((s) => ({ id: s })) }) : undefined;
  if (id) return prisma.learningResource.update({ where: { id }, data: { ...rest, skills } });
  return prisma.learningResource.create({ data: { ...rest, skills, createdById: userId } });
}
export async function adminVerify(id, status) {
  if (!['ACTIVE', 'BROKEN_LINK', 'REMOVED', 'PENDING_REVIEW'].includes(status)) throw badRequest('Invalid status');
  return prisma.learningResource.update({ where: { id }, data: { status, lastCheckedAt: new Date() } });
}
