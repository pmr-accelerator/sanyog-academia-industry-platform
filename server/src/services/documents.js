import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import prisma from '../db.js';
import env from '../config/env.js';
import { sha256 } from '../utils/crypto.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';

const MAGIC = [
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/png', test: (b) => b.length > 8 && b[0] === 0x89 && b.subarray(1, 4).toString('latin1') === 'PNG' },
  { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
];
const KINDS = ['PHOTO', 'RESUME', 'ID_PROOF', 'MARKSHEET', 'CERTIFICATE', 'PROJECT_EVIDENCE', 'AGREEMENT', 'ORGANIZATION_PROOF', 'OTHER'];
const roleKinds = { STUDENT: ['PHOTO', 'RESUME', 'ID_PROOF', 'MARKSHEET', 'CERTIFICATE', 'PROJECT_EVIDENCE', 'OTHER'], ALUMNI: ['ID_PROOF', 'CERTIFICATE', 'OTHER'], INDUSTRY: ['AGREEMENT', 'ORGANIZATION_PROOF', 'OTHER'], COLLEGE_AUTHORITY: ['AGREEMENT', 'OTHER'], ADMIN: ['OTHER'] };

export async function saveUpload(user, file, kind, institutionId = null) {
  const cleanup = () => fs.unlink(file.path).catch(() => {});
  try {
    if (!KINDS.includes(kind) || !(roleKinds[user.role] || []).includes(kind)) throw badRequest('This document type is not allowed for your account');
    const buf = await fs.readFile(file.path);
    const magicOk = MAGIC.find((m) => m.mime === file.mimetype)?.test(buf);
    if (!magicOk) throw badRequest('The file content does not match its type');
    return await prisma.document.create({
      data: { ownerId: user.id, kind, originalName: path.basename(file.originalname).slice(0, 150), mimeType: file.mimetype, sizeBytes: file.size, storageKey: path.basename(file.path), sha256: sha256(buf), institutionId },
    });
  } catch (e) { await cleanup(); throw e; }
}

// Who may read a document: the owner; reviewers of the document's institution; for agreements the
// partner organization's members and the partnership institution's members; recruiters only for a RESUME
// the student shared with their organization.
export async function canReadDocument(user, doc) {
  if (doc.deletedAt) return false;
  if (doc.ownerId === user.id) return true;
  if (user.role === 'COLLEGE_AUTHORITY' && doc.institutionId) {
    const m = await prisma.institutionMembership.findFirst({ where: { userId: user.id, institutionId: doc.institutionId, approvedAt: { not: null } } });
    if (m) return true;
  }
  if (doc.kind === 'AGREEMENT') {
    const ag = await prisma.agreement.findFirst({ where: { documentId: doc.id }, include: { partnership: true } });
    if (ag) {
      if (user.role === 'INDUSTRY') return Boolean(await prisma.organizationMember.findFirst({ where: { userId: user.id, organizationId: ag.partnership.organizationId } }));
      if (user.role === 'COLLEGE_AUTHORITY') return Boolean(await prisma.institutionMembership.findFirst({ where: { userId: user.id, institutionId: ag.partnership.institutionId, approvedAt: { not: null } } }));
    }
  }
  if (doc.kind === 'RESUME' && user.role === 'INDUSTRY') {
    const m = await prisma.organizationMember.findFirst({ where: { userId: user.id } });
    if (!m) return false;
    const grant = await prisma.consentGrant.findFirst({
      where: { scope: 'RECRUITER_PROFILE_VIEW', granteeOrganizationId: m.organizationId, revokedAt: null, fields: { has: 'resume' }, student: { userId: doc.ownerId } },
    });
    return Boolean(grant);
  }
  return false;
}

export async function streamDocument(user, id, res) {
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || !(await canReadDocument(user, doc))) throw doc ? forbidden() : notFound('Document not found');
  const full = path.join(env.uploadRoot, doc.storageKey);
  await fs.access(full).catch(() => { throw notFound('File is no longer available'); });
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${doc.originalName.replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  createReadStream(full).pipe(res);
}

export async function deleteDocument(user, id) {
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== user.id) throw notFound('Document not found');
  const used = await prisma.verificationEvidence.count({ where: { documentId: id } });
  const inAgreement = await prisma.agreement.count({ where: { documentId: id } });
  if (used || inAgreement) throw badRequest('This document is attached to a verification or agreement and cannot be deleted');
  await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
  await fs.unlink(path.join(env.uploadRoot, doc.storageKey)).catch(() => {});
}

export const listMyDocuments = (userId) => prisma.document.findMany({ where: { ownerId: userId, deletedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, kind: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true } });
