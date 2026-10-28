// Scheduled maintenance. Runs hourly inside the server, or once via `npm run jobs:run`.
import prisma from '../db.js';
import { notify, notifyMany } from '../services/notify.js';
import { loadStudentSnapshot, OPP_INCLUDE, toEngineOpp } from '../services/eligibility.js';
import { evaluateEligibility } from '../eligibility/engine.js';

export async function runJobs() {
  const now = new Date();
  const out = {};
  out.expiredSessions = (await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } })).count;
  out.closedOpportunities = (await prisma.opportunity.updateMany({ where: { status: 'PUBLISHED', deadline: { lt: now } }, data: { status: 'CLOSED' } })).count;

  // Agreements past their end date → partnership EXPIRED
  const expiring = await prisma.partnership.findMany({ where: { status: 'ACTIVE', validUntil: { lt: now } }, include: { organization: { include: { members: true } }, institution: { include: { memberships: true } } } });
  for (const p of expiring) {
    await prisma.partnership.update({ where: { id: p.id }, data: { status: 'EXPIRED' } });
    await notifyMany([...p.organization.members.map((m) => m.userId), ...p.institution.memberships.filter((m) => m.canManagePartnerships).map((m) => m.userId)], { type: 'PARTNERSHIP', title: 'Partnership expired', body: `The agreement between ${p.organization.displayName} and ${p.institution.name} has expired. Submit a renewal.`, linkPath: '/industry/partnerships' });
  }
  out.expiredPartnerships = expiring.length;

  // 30-day renewal reminders (once per agreement period)
  const soon = await prisma.partnership.findMany({ where: { status: 'ACTIVE', renewalReminderSentAt: null, validUntil: { gt: now, lt: new Date(now.getTime() + 30 * 864e5) } }, include: { organization: { include: { members: true } }, institution: { include: { memberships: true } } } });
  for (const p of soon) {
    await notifyMany([...p.organization.members.map((m) => m.userId), ...p.institution.memberships.filter((m) => m.canManagePartnerships).map((m) => m.userId)], { type: 'PARTNERSHIP', title: 'Agreement expires within 30 days', body: `${p.organization.displayName} ↔ ${p.institution.name}: ends ${p.validUntil.toDateString()}.`, linkPath: '/industry/partnerships' });
    await prisma.partnership.update({ where: { id: p.id }, data: { renewalReminderSentAt: now } });
  }
  out.renewalReminders = soon.length;

  // Deadline alerts (≤3 days): students who saved it, plus eligible students who have not applied yet.
  const closing = await prisma.opportunity.findMany({ where: { status: 'PUBLISHED', deadline: { gt: now, lt: new Date(now.getTime() + 3 * 864e5) } }, include: OPP_INCLUDE });
  let alerts = 0;
  for (const o of closing) {
    const saved = await prisma.savedOpportunity.findMany({ where: { opportunityId: o.id }, include: { student: { select: { userId: true } } } });
    const candidates = await prisma.studentProfile.findMany({ where: { institutionId: { in: o.institutions.map((i) => i.institutionId) }, registrationStatus: 'VERIFIED', user: { status: 'ACTIVE' }, applications: { none: { opportunityId: o.id } } }, select: { id: true, userId: true }, take: 300 });
    const ids = new Set(saved.map((s) => s.student.userId));
    for (const c of candidates) { if (ids.has(c.userId)) continue; const snap = await loadStudentSnapshot(c.id); if (evaluateEligibility(snap.snapshot, toEngineOpp(o), snap.institutionRules).result !== 'NOT_ELIGIBLE') ids.add(c.userId); }
    for (const uid of ids) { const applied = await prisma.application.count({ where: { opportunityId: o.id, student: { userId: uid } } }); if (applied) continue; await notify(uid, { type: 'OPPORTUNITY_ALERT', title: 'Deadline approaching', body: `${o.title} closes on ${o.deadline.toDateString()}.`, linkPath: `/student/opportunities/${o.id}`, dedupeKey: `deadline3d:${o.id}:${uid}` }); alerts += 1; }
  }
  out.deadlineAlerts = alerts;
  return out;
}

export function startScheduler() {
  const run = () => runJobs().then((r) => console.log('[jobs]', JSON.stringify(r))).catch((e) => console.error('[jobs] failed', e.message));
  setTimeout(run, 15000);
  return setInterval(run, 60 * 60 * 1000);
}

if (process.argv.includes('--once')) { runJobs().then((r) => { console.log(r); return prisma.$disconnect(); }); }
