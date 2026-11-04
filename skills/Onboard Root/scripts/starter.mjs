import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Input paths are relative to User Root Template; neither input nor bytes mutate.
export function personalStarter(templateFiles) {
  const files = new Map();
  for (const [path, bytes] of templateFiles) {
    if (typeof path !== 'string' || !path || path.includes('\0') || path.includes('\\') ||
        path.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error(`Invalid relative template path: ${path}`);
    }
    if (!(bytes instanceof Uint8Array)) throw new Error(`Template bytes required: ${path}`);
    if (!path.startsWith('prompts/')) files.set(path, Buffer.from(bytes));
  }
  for (const name of ['about', 'design']) {
    const source = `prompts/personal/${name}.md`;
    if (!templateFiles.has(source)) throw new Error(`Missing template file: ${source}`);
    files.set(`memory/${name}.md`, Buffer.from(templateFiles.get(source)));
  }
  const agents = files.get('AGENTS.md');
  if (!agents) throw new Error('Missing template file: AGENTS.md');
  // Latin-1 makes offsets byte offsets, without decoding or re-encoding the file.
  const lines = [...agents.toString('latin1').matchAll(/(^|\n)type:(?=\n|$)/g)];
  if (lines.length !== 1) {
    throw new Error(`AGENTS.md must contain exactly one line that is exactly type:; found ${lines.length}`);
  }
  const end = lines[0].index + lines[0][0].length;
  files.set('AGENTS.md', Buffer.concat([agents.subarray(0, end), Buffer.from(' personal'), agents.subarray(end)]));

  const sorted = new Map([...files].sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
  const hash = createHash('sha256');
  for (const [path, bytes] of sorted) {
    hash.update(path).update('\0').update(String(bytes.length)).update('\0').update(bytes);
  }
  return { files: sorted, id: hash.digest('hex').slice(0, 16) };
}

const usage = `Usage: node starter.mjs <id|check|help> [--help]
  id       Print the personal starter id as plain text.
  check    Check SKILL.md's download id; print one JSON object on success.
  help     Print this usage without reading git or the checkout.
  --help   Print this usage without reading git or the checkout.
Requires git for id and check (presence check: git --version).
Reads only tracked template files and SKILL.md; installs and writes nothing.
Failures print to stderr and exit 1. No configuration or flags beyond --help.
`;

function main(args) {
  const unknown = args.find(arg => !['id', 'check', 'help', '--help'].includes(arg));
  if (unknown) throw new Error(`Unknown argument: ${unknown}. Run node starter.mjs --help.`);
  if (!args.length || args.includes('help') || args.includes('--help')) {
    process.stdout.write(usage);
    return;
  }
  if (args.length !== 1) throw new Error('Choose one command: id or check. Run node starter.mjs --help.');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  try {
    execFileSync('git', ['--version'], { cwd: root, stdio: 'pipe' });
  } catch {
    throw new Error('git is unavailable (git --version failed). Run where git is available to read the tracked template.');
  }
  const prefix = 'system/templates/User Root Template/';
  let tracked;
  try {
    tracked = execFileSync('git', ['ls-files', '-z', '--', prefix], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  } catch {
    throw new Error('git ls-files failed. Run starter.mjs from a git checkout of Wiser with its tracked template.');
  }
  const template = new Map(tracked.split('\0').filter(Boolean).map(path => [
    path.slice(prefix.length), readFileSync(resolve(root, path)),
  ]));
  const { files, id } = personalStarter(template);
  if (args[0] === 'id') {
    process.stdout.write(`${id}\n`);
    return;
  }
  const skill = readFileSync(resolve(root, 'skills/Onboard Root/SKILL.md'), 'utf8');
  const ids = [...skill.matchAll(/\/starter\/personal-([0-9a-f]{16})\.tar\.gz/g)].map(match => match[1]);
  if (ids.length !== 1 || ids[0] !== id) {
    throw new Error(`Stale starter id in skills/Onboard Root/SKILL.md: ${ids.join(', ') || 'missing'}; tracked template computes ${id}. Update the download id to match the template and service pin.`);
  }
  process.stdout.write(`${JSON.stringify({ id, files: files.size, bytes: [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0) })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`starter: ${error.message}\n`); process.exitCode = 1; }
}
