import env from './config/env.js';
import { createApp } from './app.js';
import { startScheduler } from './jobs/index.js';
import prisma from './db.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`${env.PLATFORM_NAME} API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  if (env.AI_PROVIDER === 'none' || !env.AI_API_KEY) console.log('AI provider: none — roadmaps use the labelled rule-based fallback.');
  if (env.DEMO_MODE) console.log('DEMO_MODE is on: demo account emails are listed on the login page. Never enable this in production.');
});
const timer = startScheduler();
const shutdown = () => { clearInterval(timer); server.close(async () => { await prisma.$disconnect(); process.exit(0); }); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
