#!/usr/bin/env node
// Stand up a site envelope from the existing kit. Not a Wiser tool.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { exists, reject, parentFor, safeTree, noLinks, templateText, prepareMemory, writeEnvelope } from './envelope.mjs';

try {
  const { values } = parseArgs({ options: { root: { type: 'string' }, domain: { type: 'string' }, 'site-url': { type: 'string' }, kit: { type: 'string' }, work: { type: 'string' }, magazine: { type: 'boolean', default: false } } });
  if (!values.root || !values.domain || !values['site-url'] || !values.kit) reject('required: --root --domain --site-url --kit');
  const root = path.resolve(values.root), kit = path.resolve(values.kit), domain = values.domain, siteUrl = values['site-url'];
  if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) reject(`domain must be a lowercase registrable host, no scheme: ${domain}`);
  const origin = new URL(siteUrl);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== siteUrl) reject(`site-url must be an HTTP(S) origin, no path, query, credentials or trailing slash: ${siteUrl}`);
  const parent = parentFor(root, values.work), dest = path.join(parent, 'sites', domain);
  noLinks(dest);
  safeTree(dest);
  if (exists(dest)) {
    if (exists(path.join(dest, 'site/kit.json'))) reject(`${dest} already is an envelope. Upgrade, do not stand up`);
    if (exists(path.join(dest, 'kit.json'))) reject('Milestone 1 to 3 shape: wrap to envelope, or declare foreign. Do not stand up');
    reject(`foreign folder (no kit.json) at ${dest}. Leaving it untouched`);
  }
  if (!exists(path.join(kit, 'KIT.md')) || !exists(path.join(kit, 'package.json'))) reject(`kit at ${kit} is missing KIT.md or package.json`);
  const template = templateText(kit);
  prepareMemory(root, dest);
  const skip = new Set(['node_modules', 'dist', '.astro', '.git', 'site-AGENTS.md', 'AGENTS.md', 'memory', 'builds.md', 'zArchive']);
  function copyTree(from, to) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) {
      if (skip.has(name)) continue;
      const src = path.join(from, name), out = path.join(to, name), stat = fs.lstatSync(src);
      if (stat.isSymbolicLink()) reject(`symbolic link in kit: ${src}`);
      if (stat.isDirectory()) copyTree(src, out); else fs.copyFileSync(src, out);
    }
  }
  copyTree(kit, path.join(dest, 'site'));
  const config = { kitVersion: '0.1.0', domain, siteUrl, collections: { pages: true, articles: true, authors: true, sections: values.magazine, issues: values.magazine } };
  fs.writeFileSync(path.join(dest, 'site/kit.json'), JSON.stringify(config, null, 2) + '\n');
  writeEnvelope(root, dest, config, template);
  console.log(`stand-up: wrote ${dest}`);
  console.log(`stand-up: run npm install and npm run dev in ${path.join(dest, 'site')}. check is next. No git init.`);
} catch (error) { console.error(`stand-up: ${error.message}`); process.exit(1); }
