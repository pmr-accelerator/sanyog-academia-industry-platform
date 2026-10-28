import prisma from '../db.js';

export async function notify(userId, { type, title, body, linkPath, dedupeKey }, db = prisma) {
  if (!userId) return;
  try {
    if (dedupeKey) {
      await db.notification.upsert({ where: { dedupeKey }, update: {}, create: { userId, type, title, body, linkPath, dedupeKey } });
    } else {
      await db.notification.create({ data: { userId, type, title, body, linkPath } });
    }
  } catch (e) { console.error('notify failed', e.message); }
}
export async function notifyMany(userIds, payload, db = prisma) {
  for (const id of new Set(userIds.filter(Boolean))) await notify(id, payload, db);
}
