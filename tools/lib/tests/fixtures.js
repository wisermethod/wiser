import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-person-test-')));
  const saved = { ...process.env };
  // Prove owner-only creation under a permissive caller, not just this shell's umask.
  const savedUmask = process.umask(0o022);
  const home = join(root, 'home');
  mkdirSync(home);
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.APPDATA;
  delete process.env.WISER_ALLOW_INSTALL;
  t.after(() => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    process.umask(savedUmask);
    rmSync(root, { recursive: true, force: true });
  });
  const copy = join(root, 'copy');
  const lib = join(copy, 'tools/lib');
  mkdirSync(lib, { recursive: true });
  writeFileSync(join(copy, 'package.json'), '{"type":"module"}');
  writeFileSync(join(copy, 'tools/AGENTS.md'), '# Test plugin');
  for (const name of ['user-config.js', 'consent.js']) cpSync(new URL(`../${name}`, import.meta.url), join(lib, name));
  const runtime = join(lib, 'browser-runtime');
  mkdirSync(runtime);
  for (const name of ['browser-runtime.js', 'package.json', 'package-lock.json']) {
    cpSync(new URL(`../browser-runtime/${name}`, import.meta.url), join(runtime, name));
  }
  return { root, home, copy, lib, runtime,
    import: name => import(pathToFileURL(join(lib, name)).href) };
}

export function fakeNpm(f, body = '') {
  const bin = join(f.root, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, process.platform === 'win32' ? 'npm.cmd' : 'npm'), `#!/usr/bin/env node
const fs = require('node:fs');
${body || `fs.mkdirSync('node_modules/playwright', {recursive:true});
fs.writeFileSync('node_modules/playwright/package.json', JSON.stringify({name:'playwright',main:'index.js',version:JSON.parse(fs.readFileSync('package-lock.json')).packages['node_modules/playwright'].version}));
fs.writeFileSync('node_modules/playwright/index.js', 'module.exports = {chromium: {fixture:true}, devices:{fixture:true}};');`}
`, { mode: 0o755 });
  process.env.PATH = `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
}
