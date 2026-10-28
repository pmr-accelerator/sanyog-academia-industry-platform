import prisma from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { notifyMany } from './notify.js';
import { audit } from './audit.js';

const managers = async (institutionId) => (await prisma.institutionMembership.findMany({ where: { institutionId, canManagePartnerships: true, approvedAt: { not: null } }, select: { userId: true } })).map((m) => m.userId);
const orgUsers = async (organizationId) => (await prisma.organizationMember.findMany({ where: { organizationId }, select: { userId: true } })).map((m) => m.userId);

export async function request(actor, { institutionId, note }) {
  if (actor.org.status !== 'VERIFIED') throw forbidden('Your organization must be verified before requesting partnerships');
  const inst = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!inst || inst.status !== 'VERIFIED') throw badRequest('Choose a verified institution');
  const key = { organizationId_institutionId: { organizationId: actor.org.id, institutionId } };
  const ex = await prisma.partnership.findUnique({ where: key });
  let p;
  if (ex) {
    if (!['REJECTED', 'EXPIRED', 'TERMINATED'].includes(ex.status)) throw conflict('A partnership request already exists for this institution');
    p = await prisma.partnership.update({ where: key, data: { status: 'REQUESTED', requestNote: note, requestedById: actor.user.id, validFrom: null, validUntil: null } });
  } else p = await prisma.partnership.create({ data: { organizationId: actor.org.id, institutionId, requestedById: actor.user.id, requestNote: note } });
  await notifyMany(await managers(institutionId), { type: 'PARTNERSHIP', title: 'New partnership request', body: `${actor.org.displayName} requested a partnership.`, linkPath: `/college/partnerships` });
  await audit(null, { actorId: actor.user.id, action: 'partnership.request', entityType: 'Partnership', entityId: p.id, institutionId });
  return p;
}

const incl = { organization: { select: { id: true, displayName: true, legalName: true, status: true, website: true, industry: true } }, institution: { select: { id: true, name: true } }, agreements: { orderBy: { version: 'desc' }, include: { document: { select: { id: true, originalName: true, sizeBytes: true } } } } };
export const listForOrg = (org) => prisma.partnership.findMany({ where: { organizationId: org.id }, include: incl, orderBy: { updatedAt: 'desc' } });
export const listForCollege = (institutionId, status) => prisma.partnership.findMany({ where: { institutionId, ...(status ? { status } : {}) }, include: incl, orderBy: { updatedAt: 'desc' } });

export async function submitAgreement(actor, partnershipId, documentId) {
  const p = await prisma.partnership.findUnique({ where: { id: partnershipId } });
  if (!p || p.organizationId !== actor.org.id) throw notFound();
  if (['REJECTED', 'TERMINATED'].includes(p.status)) throw conflict('Create a new partnership request first');
  const doc = await prisma.document.findFirst({ where: { id: documentId, ownerId: actor.user.id, kind: 'AGREEMENT', deletedAt: null } });
  if (!doc) throw badRequest('Upload the agreement document first');
  const last = await prisma.agreement.findFirst({ where: { partnershipId }, orderBy: { version: 'desc' } });
  const ag = await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id: documentId }, data: { institutionId: p.institutionId } }); // lets the college read it
    await tx.agreement.updateMany({ where: { partnershipId, status: { in: ['SUBMITTED', 'CHANGES_REQUESTED'] } }, data: { status: 'SUPERSEDED' } });
    const a = await tx.agreement.create({ data: { partnershipId, documentId, version: (last?.version || 0) + 1, submittedById: actor.user.id } });
    if (p.status !== 'ACTIVE') await tx.partnership.update({ where: { id: partnershipId }, data: { status: 'UNDER_REVIEW' } });
    return a;
  });
  await notifyMany(await managers(p.institutionId), { type: 'PARTNERSHIP', title: 'Agreement submitted', body: `${actor.org.displayName} submitted an agreement for review.`, linkPath: '/college/partnerships' });
  return ag;
}

export async function decide(req, partnershipId, agreementId, { decision, note, validFrom, validUntil }) {
  const p = await prisma.partnership.findUnique({ where: { id: partnershipId } });
  if (!p) throw notFound();
  const m = req.memberships.find((x) => x.institutionId === p.institutionId);
  if (!m?.canManagePartnerships) throw forbidden('You cannot manage partnerships for this institution');
  const ag = await prisma.agreement.findFirst({ where: { id: agreementId, partnershipId } });
  if (!ag || ag.status !== 'SUBMITTED') throw conflict('This agreement is not awaiting review');
  if (decision !== 'APPROVED' && !note) throw badRequest('Please explain your decision');
  if (decision === 'APPROVED' && (!validFrom || !validUntil || validUntil <= validFrom)) throw badRequest('Provide valid start and end dates for the agreement');
  const wasActive = p.status === 'ACTIVE';
  await prisma.$transaction(async (tx) => {
    await tx.agreement.update({ where: { id: agreementId }, data: { status: decision, reviewedById: req.user.id, reviewNote: note, reviewedAt: new Date() } });
    if (decision === 'APPROVED') await tx.partnership.update({ where: { id: partnershipId }, data: { status: 'ACTIVE', validFrom, validUntil, renewalReminderSentAt: null } });
    else if (!wasActive) await tx.partnership.update({ where: { id: partnershipId }, data: { status: decision === 'REJECTED' ? 'REJECTED' : 'CHANGES_REQUESTED' } });
  });
  await notifyMany(await orgUsers(p.organizationId), { type: 'PARTNERSHIP', title: `Agreement ${decision.replace('_', ' ').toLowerCase()}`, body: note || 'Your agreement was approved.', linkPath: '/industry/partnerships' });
  await audit(req, { action: `partnership.agreement.${decision.toLowerCase()}`, entityType: 'Partnership', entityId: partnershipId, institutionId: p.institutionId });
  return { decision };
}

export async function terminate(req, partnershipId, reason) {
  const p = await prisma.partnership.findUnique({ where: { id: partnershipId } });
  if (!p) throw notFound();
  if (!req.memberships.find((x) => x.institutionId === p.institutionId)?.canManagePartnerships) throw forbidden();
  if (!reason) throw badRequest('A reason is required');
  await prisma.partnership.update({ where: { id: partnershipId }, data: { status: 'TERMINATED' } });
  await notifyMany(await orgUsers(p.organizationId), { type: 'PARTNERSHIP', title: 'Partnership terminated', body: reason, linkPath: '/industry/partnerships' });
  await audit(req, { action: 'partnership.terminate', entityType: 'Partnership', entityId: partnershipId, institutionId: p.institutionId, severity: 'WARNING', metadata: { reason } });
  return { status: 'TERMINATED' };
}
