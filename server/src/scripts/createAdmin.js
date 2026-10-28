// Creates a platform administrator interactively. The password is typed at the prompt (never stored in
// a file or shell history) and must be changed at first login.
//   npm run create-admin --workspace server
import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import prisma from '../db.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

const email = (await ask('Admin email: ')).trim().toLowerCase();
const fullName = (await ask('Full name: ')).trim();
const password = await ask('Temporary password (min 12 chars, visible while typing): ');
rl.close();
if (!/^\S+@\S+\.\S+$/.test(email) || fullName.length < 2 || password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error('Invalid input: need a valid email, a name, and a 12+ character password with letters and digits.');
  process.exit(1);
}
const ALL = ['MANAGE_USERS', 'VERIFY_INSTITUTIONS', 'VERIFY_ORGANIZATIONS', 'VIEW_AUDIT', 'MANAGE_TAXONOMY', 'MANAGE_RESOURCES', 'MANAGE_CONFIG', 'VIEW_AI_USAGE', 'MODERATE_CONTENT', 'VIEW_ANALYTICS', 'VIEW_SYSTEM_HEALTH'];
const user = await prisma.user.create({ data: { email, fullName, role: 'ADMIN', status: 'ACTIVE', emailVerifiedAt: new Date(), mustChangePassword: true, passwordHash: await bcrypt.hash(password, 12), adminGrants: { create: ALL.map((permission) => ({ permission })) } } });
console.log(`Created administrator ${user.email}. They must change the password at first sign-in.`);
await prisma.$disconnect();
