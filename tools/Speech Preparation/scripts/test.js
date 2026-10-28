// Run the unchanged suites and new controls entirely in OS temporary storage.
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const source = fileURLToPath(new URL('..', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'wiser-speech-tests-'));
try {
  for (const name of ['scripts', 'tests', 'package.json']) cpSync(join(source, name), join(work, name), { recursive: true, errorOnExist: true, force: false });
  const r = spawnSync(process.execPath, ['--test', 'tests/speech.test.js', 'tests/heygen.test.js', 'tests/upload.test.js'], { cwd: work, stdio: 'inherit' });
  process.exitCode = r.status ?? 1;
} finally { rmSync(work, { recursive: true, force: true }); }
