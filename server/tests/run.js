// Cross-platform test runner: lists *.test.js files itself (no shell globbing, works on Windows).
// Usage: node tests/run.js unit | integration | all
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const which = process.argv[2] || 'all';
const dirs = which === 'all' ? ['unit', 'integration'] : [which];
const files = dirs.flatMap((d) => {
  try { return readdirSync(path.join(here, d)).filter((f) => f.endsWith('.test.js')).map((f) => path.join(here, d, f)); } catch { return []; }
});
if (!files.length) { console.error('No test files found'); process.exit(1); }
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
