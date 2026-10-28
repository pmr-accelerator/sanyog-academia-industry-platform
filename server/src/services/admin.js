import prisma from '../db.js';
import env from '../config/env.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { audit } from './audit.js';
import { notify, notifyMany } from './notify.js';
import { recomputeUserStatus } from './auth.js';
import { resetWeightsCache } from './eligibility.js';
import { recentErrors } from '../middleware/errorHandler.js';

export async function listUsers(q, page) {
  const where = { ...(q.role ? { role: q.role } : {}), ...(q.status ? { status: q.status } : {}), ...(q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { fullName: { contains: q.q, mode: 'insensitive' } }] } : {}) };
  const [total, rows] = await Promise.all([prisma.user.count({ where }), prisma.user.findMany({ where, skip: page.skip, take: page.take, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, fullName: true, role: true, status: true, createdAt: true, lastLoginAt: true, adminGrants: { select: { permission: true } } } })]);
  return { total, rows };
}
export async function setUserStatus(req, id, status, reason) {
  if (id === req.user.id) throw forbidden('You cannot change your own account status');
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || u.status === 'DELETED') throw notFound();
  if (status === 'SUSPENDED') {
    if (!reason) throw badRequest('A reason is required');
    await prisma.$transaction([prisma.user.update({ where: { id }, data: { status: 'SUSPENDED' } }), prisma.session.deleteMany({ where: { userId: id } })]);
  } else {
    await prisma.user.update({ where: { id }, data: { status: 'PENDING_APPROVAL' } });
    await recomputeUserStatus(id);
  }
  await audit(req, { action: status === 'SUSPENDED' ? 'admin.user_suspend' : 'admin.user_reactivate', entityType: 'User', entityId: id, severity: 'SECURITY', metadata: { reason: reason || null } });
  return { status };
}
export async function setGrants(req, id, permissions) {
  if (id === req.user.id) throw forbidden('You cannot change your own permissions');
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || u.role !== 'ADMIN') throw badRequest('Permissions apply to administrator accounts only');
  await prisma.$transaction([prisma.adminGrant.deleteMany({ where: { userId: id } }), prisma.adminGrant.createMany({ data: permissions.map((permission) => ({ userId: id, permission, grantedBy: req.user.id })) })]);
  await audit(req, { action: 'admin.grants_set', entityType: 'User', entityId: id, severity: 'SECURITY', metadata: { permissions } });
  return { permissions };
}

export const listInstitutions = (status) => prisma.institution.findMany({ where: status ? { status } : {}, include: { _count: { select: { students: true, memberships: true } }, memberships: { include: { user: { select: { fullName: true, email: true } } } } }, orderBy: { createdAt: 'desc' }, take: 200 });
export async function decideInstitution(req, id, status, note) {
  const inst = await prisma.institution.findUnique({ where: { id } });
  if (!inst) throw notFound();
  if (status !== 'VERIFIED' && !note) throw badRequest('Please give a reason');
  await prisma.institution.update({ where: { id }, data: { status, ...(status === 'VERIFIED' ? { verifiedAt: new Date(), verifiedById: req.user.id } : {}) } });
  if (status === 'VERIFIED') {
    // The first registered staff member becomes the institution administrator.
    const first = await prisma.institutionMembership.findFirst({ where: { institutionId: id, approvedAt: null }, orderBy: { createdAt: 'asc' } });
    if (first) await prisma.institutionMembership.update({ where: { id: first.id }, data: { approvedAt: new Date(), canManagePartnerships: true, canVerifyCredentials: true, isPlacementOfficer: true } });
  }
  const members = await prisma.institutionMembership.findMany({ where: { institutionId: id }, select: { userId: true } });
  for (const m of members) await recomputeUserStatus(m.userId);
  await notifyMany(members.map((m) => m.userId), { type: 'ACCOUNT', title: `Institution ${status.toLowerCase()}`, body: note || 'Your institution was verified.', linkPath: '/college' });
  await audit(req, { action: `institution.${status.toLowerCase()}`, entityType: 'Institution', entityId: id, institutionId: id, severity: 'SECURITY', metadata: { note: note || null } });
  return { status };
}
export const pendingMemberships = () => prisma.institutionMembership.findMany({ where: { approvedAt: null, institution: { status: 'VERIFIED' } }, include: { user: { select: { fullName: true, email: true } }, institution: { select: { name: true } } } });

export const listOrganizations = (status) => prisma.organization.findMany({ where: status ? { status } : {}, include: { members: { include: { user: { select: { fullName: true, email: true } } } } }, orderBy: { createdAt: 'desc' }, take: 200 });
export async function decideOrganization(req, id, status, note) {
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) throw notFound();
  if (status !== 'VERIFIED' && !note) throw badRequest('Please give a reason');
  await prisma.organization.update({ where: { id }, data: { status, verificationNote: note, ...(status === 'VERIFIED' ? { verifiedAt: new Date(), verifiedById: req.user.id } : {}) } });
  const members = await prisma.organizationMember.findMany({ where: { organizationId: id }, select: { userId: true } });
  for (const m of members) await recomputeUserStatus(m.userId);
  if (status !== 'VERIFIED') await prisma.opportunity.updateMany({ where: { organizationId: id, status: 'PUBLISHED' }, data: { status: 'CLOSED' } });
  await notifyMany(members.map((m) => m.userId), { type: 'ACCOUNT', title: `Organization ${status.toLowerCase()}`, body: note || 'Your organization was verified.', linkPath: '/industry' });
  await audit(req, { action: `organization.${status.toLowerCase()}`, entityType: 'Organization', entityId: id, severity: 'SECURITY', metadata: { note: note || null } });
  return { status };
}

export async function listAudit(q, page) {
  const where = { ...(q.action ? { action: { contains: q.action } } : {}), ...(q.severity ? { severity: q.severity } : {}), ...(q.actorId ? { actorId: q.actorId } : {}), ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}) };
  const [total, rows] = await Promise.all([prisma.auditEvent.count({ where }), prisma.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: page.skip, take: page.take })]);
  return { total, rows };
}

// Taxonomy
export const listTaxonomies = () => prisma.skillTaxonomy.findMany({ include: { _count: { select: { skills: true } } }, orderBy: { createdAt: 'asc' } });
export const createTaxonomy = (d) => prisma.skillTaxonomy.create({ data: d });
export async function saveSkill(id, d) {
  if (d.nsqfLevel != null) { const t = await prisma.skillTaxonomy.findUnique({ where: { id: d.taxonomyId } }); if (!t?.isOfficial) throw badRequest('NSQF levels may only be set on an official taxonomy'); }
  return id ? prisma.skill.update({ where: { id }, data: d }) : prisma.skill.create({ data: d });
}
export async function deleteSkill(id) {
  const used = (await prisma.studentSkill.count({ where: { skillId: id } })) + (await prisma.opportunityRequirement.count({ where: { skillId: id } }));
  if (used) throw conflict('This skill is in use and cannot be deleted');
  await prisma.skill.delete({ where: { id } });
}

// Settings (allow-list so config cannot be used to store arbitrary data)
const SETTING_KEYS = {
  'ai.enabled': (v) => typeof v === 'boolean',
  'ai.dailyLimit': (v) => Number.isInteger(v) && v >= 0 && v <= 100,
  'matching.weights': (v) => v && ['skillCoverage', 'proficiencyFit', 'verifiedEvidence', 'disciplineFit'].every((k) => typeof v[k] === 'number' && v[k] >= 0 && v[k] <= 1),
  'platform.announcement': (v) => typeof v === 'string' && v.length <= 300,
};
export const listSettings = async () => ({ allowedKeys: Object.keys(SETTING_KEYS), values: await prisma.platformSetting.findMany() });
export async function setSetting(req, key, value) {
  if (!SETTING_KEYS[key]?.(value)) throw badRequest('Unknown setting or invalid value');
  const row = await prisma.platformSetting.upsert({ where: { key }, update: { value, updatedById: req.user.id }, create: { key, value, updatedById: req.user.id } });
  resetWeightsCache();
  await audit(req, { action: 'admin.setting_update', entityType: 'PlatformSetting', entityId: key, metadata: { key } });
  return row;
}

export async function aiUsage() {
  const since = new Date(Date.now() - 30 * 864e5);
  const logs = await prisma.aiUsageLog.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 200 });
  const byDay = {}; logs.forEach((l) => { const d = l.createdAt.toISOString().slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; });
  return { provider: env.AI_PROVIDER === 'none' || !env.AI_API_KEY ? 'none (rule-based fallback only)' : env.AI_PROVIDER, model: env.AI_MODEL || null, last30Days: { requests: logs.length, fallback: logs.filter((l) => l.usedFallback).length, errors: logs.filter((l) => l.errorCode && l.errorCode !== 'NO_PROVIDER_CONFIGURED').length, avgLatencyMs: logs.length ? Math.round(logs.reduce((a, l) => a + (l.latencyMs || 0), 0) / logs.length) : null }, byDay: Object.entries(byDay).sort().map(([day, count]) => ({ day, count })), recent: logs.slice(0, 20).map((l) => ({ at: l.createdAt, feature: l.feature, provider: l.provider, usedFallback: l.usedFallback, errorCode: l.errorCode, latencyMs: l.latencyMs })) };
}

export async function moderationOpportunities(q, page) {
  const where = { ...(q.status ? { status: q.status } : {}), ...(q.q ? { title: { contains: q.q, mode: 'insensitive' } } : {}) };
  const [total, rows] = await Promise.all([prisma.opportunity.count({ where }), prisma.opportunity.findMany({ where, skip: page.skip, take: page.take, orderBy: { createdAt: 'desc' }, include: { organization: { select: { displayName: true } }, postedBy: { select: { name: true } } } })]);
  return { total, rows };
}
export async function takedown(req, id, reason) {
  const o = await prisma.opportunity.findUnique({ where: { id } });
  if (!o) throw notFound();
  if (!reason) throw badRequest('A reason is required');
  await prisma.opportunity.update({ where: { id }, data: { status: 'CANCELLED' } });
  await notify(o.createdById, { type: 'SYSTEM', title: 'Opportunity removed by moderation', body: `${o.title}: ${reason}`, linkPath: '/industry/opportunities' });
  await audit(req, { action: 'moderation.opportunity_takedown', entityType: 'Opportunity', entityId: id, severity: 'WARNING', metadata: { reason } });
  return { status: 'CANCELLED' };
}
export const listMessages = () => prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
export const handleMessage = (id) => prisma.contactMessage.update({ where: { id }, data: { handledAt: new Date() } });

export async function health() {
  const t0 = Date.now();
  let db = 'ok'; try { await prisma.$queryRaw`SELECT 1`; } catch { db = 'error'; }
  const mem = process.memoryUsage();
  return { database: db, dbLatencyMs: Date.now() - t0, uptimeSeconds: Math.round(process.uptime()), node: process.version, memoryMb: Math.round(mem.rss / 1048576), aiProviderConfigured: env.AI_PROVIDER !== 'none' && Boolean(env.AI_API_KEY), mailTransport: env.MAIL_TRANSPORT, environment: env.NODE_ENV, recentErrors: recentErrors.slice(0, 20) };
}
