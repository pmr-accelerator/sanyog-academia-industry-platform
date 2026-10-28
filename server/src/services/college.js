import PDFDocument from 'pdfkit';
import prisma from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { toCsv } from '../utils/csv.js';
import { recomputeUserStatus } from './auth.js';
import { notify } from './notify.js';
import { audit } from './audit.js';

export async function roster(institutionId, q, page) {
  const where = { institutionId, ...(q.status ? { registrationStatus: q.status } : {}), ...(q.departmentId ? { departmentId: q.departmentId } : {}), ...(q.q ? { user: { fullName: { contains: q.q, mode: 'insensitive' } } } : {}) };
  const [total, rows] = await Promise.all([prisma.studentProfile.count({ where }), prisma.studentProfile.findMany({ where, skip: page.skip, take: page.take, orderBy: { createdAt: 'desc' }, include: { user: { select: { fullName: true, email: true, status: true } }, department: { select: { name: true } }, _count: { select: { skills: true, applications: true } } } })]);
  return { total, rows: rows.map((s) => ({ id: s.id, name: s.user.fullName, email: s.user.email, accountStatus: s.user.status, department: s.department?.name || null, degree: s.degree, academicYear: s.academicYear, graduationYear: s.graduationYear, registrationNumber: s.registrationNumber, registrationStatus: s.registrationStatus, profileCompletion: s.profileCompletion, skills: s._count.skills, applications: s._count.applications })) };
}

export const listDepartments = (institutionId) => prisma.department.findMany({ where: { institutionId }, orderBy: { name: 'asc' } });
export const saveDepartment = (institutionId, id, d) => id
  ? prisma.department.updateMany({ where: { id, institutionId }, data: d }).then((r) => { if (!r.count) throw notFound(); return { updated: true }; })
  : prisma.department.create({ data: { ...d, institutionId } });
export async function deleteDepartment(institutionId, id) {
  const d = await prisma.department.findFirst({ where: { id, institutionId }, include: { _count: { select: { students: true, alumni: true } } } });
  if (!d) throw notFound();
  if (d._count.students || d._count.alumni) throw conflict('Students or alumni belong to this department');
  await prisma.department.delete({ where: { id } });
}

export const getSettings = (institutionId) => prisma.institution.findUnique({ where: { id: institutionId }, select: { id: true, name: true, institutionCode: true, universityName: true, type: true, state: true, city: true, website: true, status: true, registrationRules: true, academicCalendar: true, eligibilityRules: true } });
export async function updateSettings(req, institutionId, d) {
  await prisma.institution.update({ where: { id: institutionId }, data: d });
  await audit(req, { action: 'institution.settings_update', entityType: 'Institution', entityId: institutionId, institutionId, metadata: { keys: Object.keys(d) } });
  return getSettings(institutionId);
}

export const team = (institutionId) => prisma.institutionMembership.findMany({ where: { institutionId }, include: { user: { select: { fullName: true, email: true, status: true } } }, orderBy: { createdAt: 'asc' } });
// Approved colleagues (with partnership-management rights) can approve new staff of their own institution.
export async function decideMember(req, membershipId, { approve, canVerifyCredentials, canManagePartnerships, isPlacementOfficer }) {
  const m = await prisma.institutionMembership.findUnique({ where: { id: membershipId } });
  if (!m) throw notFound();
  const me = req.memberships.find((x) => x.institutionId === m.institutionId);
  if (!me?.canManagePartnerships) throw forbidden('Only institution administrators can manage staff');
  if (m.userId === req.user.id) throw forbidden('You cannot change your own access');
  if (!approve) { await prisma.institutionMembership.delete({ where: { id: membershipId } }); return { removed: true }; }
  await prisma.institutionMembership.update({ where: { id: membershipId }, data: { approvedAt: m.approvedAt || new Date(), canVerifyCredentials: canVerifyCredentials ?? m.canVerifyCredentials, canManagePartnerships: canManagePartnerships ?? m.canManagePartnerships, isPlacementOfficer: isPlacementOfficer ?? m.isPlacementOfficer } });
  await recomputeUserStatus(m.userId);
  await notify(m.userId, { type: 'ACCOUNT', title: 'Access approved', body: 'Your institution access was approved.', linkPath: '/college' });
  await audit(req, { action: 'institution.member_decision', entityType: 'InstitutionMembership', entityId: membershipId, institutionId: m.institutionId, metadata: { approve } });
  return { approved: true };
}

export const alumniList = (institutionId) => prisma.alumniProfile.findMany({ where: { institutionId }, include: { user: { select: { fullName: true } }, department: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });

// ── Reports ──
async function rowsFor(institutionId, kind) {
  if (kind === 'placements') {
    const students = await prisma.studentProfile.findMany({ where: { institutionId, registrationStatus: 'VERIFIED' }, include: { user: { select: { fullName: true } }, department: { select: { name: true } }, applications: { select: { status: true } } } });
    return { title: 'Placement report', columns: [{ label: 'Student', get: (r) => r.name }, { label: 'Department', get: (r) => r.department }, { label: 'Graduation year', get: (r) => r.graduationYear }, { label: 'Applications', get: (r) => r.applications }, { label: 'Offers accepted', get: (r) => r.accepted }],
      rows: students.map((s) => ({ name: s.user.fullName, department: s.department?.name || '', graduationYear: s.graduationYear, applications: s.applications.length, accepted: s.applications.filter((a) => a.status === 'OFFER_ACCEPTED').length })) };
  }
  if (kind === 'skills') {
    const rows = await prisma.studentSkill.groupBy({ by: ['skillId'], where: { verificationStatus: 'VERIFIED', student: { institutionId } }, _count: { skillId: true }, _avg: { proficiency: true } });
    const names = await prisma.skill.findMany({ where: { id: { in: rows.map((r) => r.skillId) } } });
    return { title: 'Verified skills report', columns: [{ label: 'Skill', get: (r) => r.skill }, { label: 'Verified students', get: (r) => r.students }, { label: 'Average proficiency', get: (r) => r.avg }], rows: rows.map((r) => ({ skill: names.find((n) => n.id === r.skillId)?.name, students: r._count.skillId, avg: Math.round(r._avg.proficiency * 10) / 10 })).sort((a, b) => b.students - a.students) };
  }
  if (kind === 'industry') {
    const ps = await prisma.partnership.findMany({ where: { institutionId }, include: { organization: { select: { id: true, displayName: true } } } });
    const out = [];
    for (const p of ps) {
      const [vac, apps] = await Promise.all([prisma.opportunity.count({ where: { organizationId: p.organizationId, institutions: { some: { institutionId } } } }), prisma.application.count({ where: { opportunity: { organizationId: p.organizationId }, student: { institutionId } } })]);
      out.push({ org: p.organization.displayName, status: p.status, from: p.validFrom?.toISOString().slice(0, 10) || '', until: p.validUntil?.toISOString().slice(0, 10) || '', vac, apps });
    }
    return { title: 'Industry engagement report', columns: [{ label: 'Organization', get: (r) => r.org }, { label: 'Partnership status', get: (r) => r.status }, { label: 'Valid from', get: (r) => r.from }, { label: 'Valid until', get: (r) => r.until }, { label: 'Vacancies', get: (r) => r.vac }, { label: 'Applications', get: (r) => r.apps }], rows: out };
  }
  throw badRequest('Unknown report');
}
export async function reportCsv(req, institutionId, kind) {
  const r = await rowsFor(institutionId, kind);
  await audit(req, { action: 'report.export', entityType: 'Report', entityId: kind, institutionId, metadata: { format: 'csv' } });
  return toCsv(r.rows, r.columns);
}
export async function reportPdf(req, institutionId, kind, res) {
  const r = await rowsFor(institutionId, kind);
  const inst = await prisma.institution.findUnique({ where: { id: institutionId }, select: { name: true } });
  await audit(req, { action: 'report.export', entityType: 'Report', entityId: kind, institutionId, metadata: { format: 'pdf' } });
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);
  doc.fontSize(16).text(r.title); doc.fontSize(10).fillColor('#555').text(`${inst.name} — generated ${new Date().toLocaleDateString('en-IN')}`).moveDown();
  doc.fillColor('#000');
  const w = (doc.page.width - 80) / r.columns.length;
  const row = (cells, bold) => { const y = doc.y; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9); cells.forEach((c, i) => doc.text(String(c ?? ''), 40 + i * w, y, { width: w - 6 })); doc.moveDown(0.6); if (doc.y > doc.page.height - 60) doc.addPage(); };
  row(r.columns.map((c) => c.label), true);
  r.rows.forEach((x) => row(r.columns.map((c) => c.get(x)), false));
  doc.end();
}
