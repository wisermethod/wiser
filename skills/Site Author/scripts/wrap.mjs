#!/usr/bin/env node
// Move the Milestone 1 to 3 kit into its envelope. Not a Wiser tool.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { exists, reject, parentFor, safeTree, templateText, prepareMemory, writeEnvelope, archivePath } from './envelope.mjs';

try {
  const { values } = parseArgs({ options: { root: { type: 'string' }, site: { type: 'string' } } });
  if (!values.root || !values.site) reject('required: --root --site');
  const root = path.resolve(values.root), dest = path.resolve(values.site);
  const rel = path.relative(root, dest).split(path.sep);
  if (rel.length === 2 && rel[0] === 'sites') parentFor(root);
  else if (rel.length === 4 && rel[0] === 'work' && rel[2] === 'sites') parentFor(root, rel[1]);
  else reject('--site must be a domain folder in this owning root sites/ or work/<slug>/sites/');
  safeTree(dest);
  if (exists(path.join(dest, 'site/kit.json'))) reject('already an envelope. Upgrade, do not wrap');
  if (!exists(path.join(dest, 'kit.json'))) reject('foreign folder / missing kit.json. Leaving it untouched');
  if (exists(path.join(dest, 'site'))) reject('site/ already exists without kit.json. Refusing a collision');
  const config = JSON.parse(fs.readFileSync(path.join(dest, 'kit.json'), 'utf8'));
  if (config.kitVersion !== '0.1.0' || !config.domain || !config.siteUrl || !config.collections) reject('old kit.json is incomplete or unsupported');
  const retained = new Set(['AGENTS.md', 'memory', 'builds.md', 'zArchive', 'site-AGENTS.md']);
  const movable = new Set(['kit.json', 'KIT.md', 'package.json', 'package-lock.json', 'astro.config.mjs', 'src', 'public', '.gitignore', '.github', 'node_modules', 'dist', '.astro']);
  const names = fs.readdirSync(dest);
  const unknown = names.filter((name) => !retained.has(name) && !movable.has(name));
  if (unknown.length) reject(`unrecognized top-level entry: ${unknown.join(', ')}. File it outside the kit payload, then wrap`);
  const template = templateText();
  prepareMemory(root, dest);
  fs.mkdirSync(path.join(dest, 'site'));
  for (const name of ['AGENTS.md', 'site-AGENTS.md']) {
    const file = path.join(dest, name);
    if (exists(file)) fs.renameSync(file, archivePath(file));
  }
  for (const name of names) {
    if (retained.has(name)) continue;
    fs.renameSync(path.join(dest, name), path.join(dest, 'site', name));
  }
  writeEnvelope(root, dest, config, template);
  console.log(`wrap: moved Milestone 1 to 3 kit into ${path.join(dest, 'site')}. check is next.`);
} catch (error) { console.error(`wrap: ${error.message}`); process.exit(1); }
