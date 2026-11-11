// Compare entry points with the released v2026.11.10 snapshot, never moving main.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = process.env.WISER_TEST_SOURCE_ROOT || fileURLToPath(new URL('../../../', import.meta.url));
// Move this pin only to a released snapshot whose CLI dependencies are extracted
// below, with the baseline and all consuming suites passing in a full clone.
const baseline = 'f8211bef4788e19c0495b16c71e7d0b74ecccb5b';

function baselineGit(args) {
  try {
    return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    throw new Error(`Baseline commit ${baseline} is unavailable; a full clone is needed to run baseline comparisons.`);
  }
}

export function mainCli(t, tool) {
  baselineGit(['cat-file', '-e', `${baseline}^{commit}`]);
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), `${tool}-main-`)));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const paths = baselineGit(['ls-tree', '-r', '--name-only', baseline, '--',
    `tools/${tool}/scripts`, `tools/${tool}/package.json`, 'tools/AGENTS.md',
    'tools/lib/consent.js', 'tools/lib/user-config.js', 'tools/lib/destination-core.js',
    // ls-tree includes this optional dependency only if it exists at the pin.
    'tools/lib/archive-core.js', 'tools/lib/one-file.js']).toString('utf8')
    .trim().split('\n').filter(p => p && !p.includes('/__tests__/') && !p.includes('/zArchive/'));
  for (const path of paths) {
    const dest = join(scratch, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, baselineGit(['show', `${baseline}:${path}`]));
  }
  const modules = join(root, 'tools', tool, 'node_modules');
  if (existsSync(modules)) symlinkSync(modules, join(scratch, 'tools', tool, 'node_modules'), 'dir');
  return join(scratch, 'tools', tool, 'scripts', `${tool}.js`);
}

export function offlineEnv(extra = {}) {
  const env = { ...process.env, npm_config_offline: 'true', ...extra };
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'WISER_ALLOW_INSTALL']) delete env[key];
  return env;
}
