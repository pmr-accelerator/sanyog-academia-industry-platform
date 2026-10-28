import prisma from '../db.js';
import env from '../config/env.js';
import { skillDemand } from './opportunity.js';

export async function stats() {
  const [institutions, orgs, opps, students, partnerships, resources, demo] = await Promise.all([
    prisma.institution.count({ where: { status: 'VERIFIED' } }), prisma.organization.count({ where: { status: 'VERIFIED' } }),
    prisma.opportunity.count({ where: { status: 'PUBLISHED', deadline: { gt: new Date() } } }), prisma.studentProfile.count({ where: { registrationStatus: 'VERIFIED' } }),
    prisma.partnership.count({ where: { status: 'ACTIVE' } }), prisma.learningResource.count({ where: { status: 'ACTIVE' } }), prisma.platformSetting.findUnique({ where: { key: 'data.demo' } }),
  ]);
  return { verifiedInstitutions: institutions, verifiedOrganizations: orgs, openOpportunities: opps, verifiedStudents: students, activePartnerships: partnerships, libraryResources: resources, isDemoData: Boolean(demo?.value), note: 'Counts are live database records. When isDemoData is true they come from the synthetic demonstration seed, not from real institutions.' };
}

export const institutionsForRegistration = () => prisma.institution.findMany({ where: { status: 'VERIFIED' }, select: { id: true, name: true, city: true, state: true, registrationRules: true, departments: { select: { id: true, name: true, discipline: true }, orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } });
export const institutionsAll = () => prisma.institution.findMany({ select: { id: true, name: true, city: true, state: true, status: true }, orderBy: { name: 'asc' } });

export async function graph() {
  const parts = await prisma.partnership.findMany({ where: { status: 'ACTIVE', institution: { status: 'VERIFIED' }, organization: { status: 'VERIFIED' } }, include: { institution: { select: { id: true, name: true } }, organization: { select: { id: true, displayName: true } } } });
  const reqs = await prisma.opportunityRequirement.findMany({ where: { opportunity: { status: 'PUBLISHED', organizationId: { not: null } } }, include: { skill: { select: { id: true, name: true } }, opportunity: { select: { organizationId: true } } } });
  const nodes = new Map(); const edges = [];
  parts.forEach((p) => { nodes.set(`i:${p.institution.id}`, { id: `i:${p.institution.id}`, type: 'institution', label: p.institution.name }); nodes.set(`o:${p.organization.id}`, { id: `o:${p.organization.id}`, type: 'organization', label: p.organization.displayName }); edges.push({ from: `i:${p.institution.id}`, to: `o:${p.organization.id}`, kind: 'partnership' }); });
  const orgIds = new Set(parts.map((p) => p.organization.id)); const weight = {};
  reqs.filter((r) => orgIds.has(r.opportunity.organizationId)).forEach((r) => { const k = `${r.opportunity.organizationId}|${r.skill.id}`; weight[k] = (weight[k] || 0) + 1; nodes.set(`s:${r.skill.id}`, { id: `s:${r.skill.id}`, type: 'skill', label: r.skill.name }); });
  Object.entries(weight).forEach(([k, w]) => { const [o, s] = k.split('|'); edges.push({ from: `o:${o}`, to: `s:${s}`, kind: 'demand', weight: w }); });
  return { nodes: [...nodes.values()], edges };
}

export async function contact(d) { await prisma.contactMessage.create({ data: d }); return { received: true }; }
export const publicConfig = () => ({ platformName: env.PLATFORM_NAME, demoMode: env.DEMO_MODE });
export async function demoAccounts() {
  if (!env.DEMO_MODE) return [];
  return prisma.user.findMany({ where: { email: { endsWith: '@demo.sanyog.invalid' } }, select: { email: true, role: true, fullName: true }, orderBy: { role: 'asc' } });
}
export { skillDemand };
