// Central, validated configuration. Nothing else in the app reads process.env directly.
import dotenv from 'dotenv';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PLATFORM_NAME: z.string().min(1).default('Sanyog'),
  PORT: z.coerce.number().int().default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().default(''),
  CREDENTIAL_SIGNING_KEY: z.string().default(''),
  COOKIE_SECURE: bool,
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: bool,
  UPLOAD_DIR: z.string().default('./storage/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(5),
  MAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('no-reply@example.invalid'),
  AI_PROVIDER: z.enum(['none', 'openai', 'anthropic']).default('none'),
  AI_API_KEY: z.string().default(''),
  AI_MODEL: z.string().default(''),
  AI_BASE_URL: z.string().default(''),
  AI_TIMEOUT_MS: z.coerce.number().int().default(20000),
  AI_DAILY_LIMIT_PER_USER: z.coerce.number().int().default(10),
  DEMO_MODE: bool,
  SEED_DEMO_PASSWORD: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(` - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}
const env = parsed.data;

const isProd = env.NODE_ENV === 'production';
if (isProd) {
  const problems = [];
  if (env.SESSION_SECRET.length < 32) problems.push('SESSION_SECRET must be at least 32 characters in production');
  if (env.CREDENTIAL_SIGNING_KEY.length < 32) problems.push('CREDENTIAL_SIGNING_KEY must be at least 32 characters in production');
  if (!env.COOKIE_SECURE) problems.push('COOKIE_SECURE must be true in production (HTTPS required)');
  if (env.DEMO_MODE) problems.push('DEMO_MODE must be false in production');
  if (problems.length) {
    console.error('Refusing to start with insecure production configuration:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
} else {
  // Development convenience: ephemeral secrets (sessions reset on restart). Never used in production.
  if (!env.SESSION_SECRET) env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  if (!env.CREDENTIAL_SIGNING_KEY) env.CREDENTIAL_SIGNING_KEY = crypto.randomBytes(32).toString('hex');
}

env.isProd = isProd;
env.uploadRoot = path.resolve(here, '../..', env.UPLOAD_DIR);

export default env;
