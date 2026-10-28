import prisma from '../db.js';

// Never put secrets, tokens or full document contents in metadata.
export async function audit(req, { action, entityType, entityId, institutionId, severity = 'INFO', metadata = {}, actorId }) {
  try {
    await prisma.auditEvent.create({
      data: { actorId: actorId ?? req?.user?.id ?? null, action, entityType, entityId, institutionId, severity, metadata, ip: req?.ip ?? null },
    });
  } catch (e) { console.error('audit write failed', e.message); }
}
