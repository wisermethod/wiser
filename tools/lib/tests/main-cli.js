// Compare the real entry point with main without a checkout or a network call.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));

export function mainCli(t, tool) {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), `${tool}-main-`)));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', 'main', '--',
    `tools/${tool}/scripts`, `tools/${tool}/package.json`, 'tools/AGENTS.md',
    'tools/lib/consent.js', 'tools/lib/user-config.js', 'tools/lib/destination-core.js'], { cwd: root, encoding: 'utf8' })
    .trim().split('\n').filter(p => p && !p.includes('/__tests__/') && !p.includes('/zArchive/'));
  for (const path of paths) {
    const dest = join(scratch, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, execFileSync('git', ['show', `main:${path}`], { cwd: root }));
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
