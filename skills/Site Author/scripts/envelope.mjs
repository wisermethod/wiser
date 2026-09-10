// Shared envelope mechanics for Site Author's scripts. Not a Wiser tool.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function reject(message) { throw new Error(message); }
export function exists(p) { return fs.existsSync(p); }
export function noLinks(p) {
  for (let current = path.resolve(p); ; current = path.dirname(current)) {
    if (exists(current) && fs.lstatSync(current).isSymbolicLink()) reject(`symbolic link at ${current}. Refusing`);
    if (path.dirname(current) === current) break;
  }
}
export function safeTree(dir) {
  noLinks(dir);
  if (!exists(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.name === '.git') reject(`nested .git in ${dir}. Refusing`);
    if (entry.isSymbolicLink()) reject(`symbolic link at ${p}. Refusing`);
    // Dependency package links and generated output are not authored trees.
    if (entry.isDirectory() && !['node_modules', 'dist', '.astro'].includes(entry.name)) safeTree(p);
  }
}
export function declareSites(parent, label) {
  noLinks(parent);
  if (!exists(parent) || !fs.statSync(parent).isDirectory()) reject(`${label} folder does not exist: ${parent}`);
  const file = path.join(parent, 'AGENTS.md');
  noLinks(file);
  if (!exists(file)) reject(`${label} missing AGENTS.md: ${parent}`);
  if (!/^\| `sites\/` \|/m.test(fs.readFileSync(file, 'utf8'))) reject(`${label} AGENTS.md does not declare sites/. Refusing`);
}
export function parentFor(root, work) {
  declareSites(root, 'owning root');
  if (work === undefined) return root;
  if (!/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/.test(work)) reject('--work must be one lowercase slug path segment, no slash');
  const parent = path.join(root, 'work', work);
  declareSites(parent, 'work subject');
  return parent;
}
export function currentKit(envelope) {
  safeTree(envelope);
  const site = path.join(envelope, 'site');
  if (exists(path.join(site, 'kit.json'))) return site;
  if (exists(path.join(envelope, 'kit.json'))) reject('Milestone 1 to 3 shape: wrap to envelope, or declare foreign');
  reject(`foreign folder / missing site/kit.json at ${envelope}. Leaving it untouched`);
}
export function templateText(kit) {
  const home = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const candidates = [kit && path.resolve(kit, '../site-AGENTS.md'), path.join(home, 'site-AGENTS.md'), path.join(home, 'expand/site-AGENTS.md'), kit && path.join(kit, 'site-AGENTS.md')].filter(Boolean);
  const file = candidates.find(exists);
  if (!file) reject('missing envelope site-AGENTS.md template');
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('{{provides}}') || /^(?:root|type):/m.test(text)) reject('invalid envelope template');
  return text;
}
export function archivePath(file) {
  const dir = path.join(path.dirname(file), 'zArchive');
  fs.mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(2, 10);
  let n = 1;
  let out;
  do { out = path.join(dir, `${date} V${n++} - ${path.basename(file)}`); } while (exists(out));
  return out;
}
export function prepareMemory(root, dest) {
  const keys = ['about', 'voice', 'design'];
  for (const key of keys) {
    noLinks(path.join(root, 'memory', `${key}.md`));
    noLinks(path.join(dest, 'memory', `${key}.md`));
  }
}
export function writeEnvelope(root, dest, kit, template) {
  fs.mkdirSync(path.join(dest, 'memory'), { recursive: true });
  fs.mkdirSync(path.join(dest, 'zArchive'), { recursive: true });
  const bound = [], copied = [], retained = [];
  for (const key of ['about', 'voice', 'design']) {
    const from = path.join(root, 'memory', `${key}.md`);
    const to = path.join(dest, 'memory', `${key}.md`);
    if (exists(to)) retained.push(key);
    else if (exists(from)) { fs.copyFileSync(from, to); copied.push(key); }
    if (exists(to)) bound.push(`${key}: memory/${key}.md`);
  }
  let text = template;
  for (const [key, value] of Object.entries({ domain: kit.domain, siteUrl: kit.siteUrl, kitVersion: kit.kitVersion, provides: bound.join('\n') || 'No local keys bound; use the owning root.' })) text = text.replaceAll(`{{${key}}}`, String(value));
  fs.writeFileSync(path.join(dest, 'AGENTS.md'), text);
  const roster = path.join(dest, 'builds.md');
  if (!exists(roster)) fs.writeFileSync(roster, `# ${kit.domain} builds\n\nThis site's change roster. No planned changes.\n\n| Change | State | Playbook |\n|--------|-------|----------|\n`);
  console.log(`memory keys copied: ${copied.join(', ') || 'none'}; retained: ${retained.join(', ') || 'none'}. The skill must ask what changes, if anything. Missing keys stay unbound and fall back to the owning root.`);
}
