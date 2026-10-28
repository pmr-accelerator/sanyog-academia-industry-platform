import { mkdir, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const migrationName = '20261028000000_init';
const migrationDir = path.join(root, 'prisma', 'migrations', migrationName);
const migrationFile = path.join(migrationDir, 'migration.sql');
try {
  await access(migrationFile);
  console.error(`Refusing to overwrite existing migration: ${migrationFile}`);
  process.exit(1);
} catch {}
await mkdir(migrationDir, { recursive: true });
const result = spawnSync('npx', ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], {
  cwd: root, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 32 * 1024 * 1024,
});
if (result.status !== 0 || !result.stdout?.trim()) {
  console.error(result.stderr || 'Prisma did not generate migration SQL.');
  process.exit(result.status || 1);
}
await writeFile(migrationFile, result.stdout, 'utf8');
await writeFile(path.join(root, 'prisma', 'migrations', 'migration_lock.toml'), 'provider = "postgresql"\n', 'utf8');
console.log(`Created ${path.relative(root, migrationFile)}`);
console.log('Review the SQL, then run: npm run db:migrate');
