// Caller-named paths follow system/templates/Script Contract.md.
import { lstatSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_DIR = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));

export function fail(message) {
  throw new Error(message);
}

export function canonical(candidate) {
  let head = resolve(candidate);
  const tail = [];
  for (;;) {
    try {
      lstatSync(head);
    } catch (error) {
      if (error.code !== 'ENOENT') fail(`Cannot resolve path ${candidate}. Check its parents and permissions.`);
      const parent = dirname(head);
      if (parent === head) fail(`Cannot resolve path ${candidate}. Use a readable filesystem path.`);
      tail.unshift(basename(head));
      head = parent;
      continue;
    }
    try {
      return join(realpathSync(head), ...tail);
    } catch {
      fail(`Cannot resolve path ${candidate}. Repair any broken or looping symbolic link.`);
    }
  }
}

export function absolutePath(name, value) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    fail(`${name} must be an absolute path. Run "node scripts/contact-sheet.js help" for usage.`);
  }
  return canonical(value);
}

export function sourceFile(candidate) {
  const path = canonical(candidate);
  let info;
  try { info = statSync(path); } catch {
    fail(`No readable file at ${path}. Correct the spec or file path.`);
  }
  if (!info.isFile()) fail(`${path} is not a file. Name a readable local file.`);
  return { path, bytes: info.size, dev: info.dev, ino: info.ino };
}

export function outputFile(value) {
  const path = absolutePath('--output', value);
  const within = relative(TOOL_DIR, path);
  if (within === '' || (within !== '..' && !within.startsWith(`..${sep}`) && !isAbsolute(within))) {
    fail('--output resolves inside this tool. Pass a work directory outside tools/Contact Sheet/.');
  }
  if (!/\.html$/i.test(path)) fail('--output must end in .html. Name an HTML page.');
  try {
    lstatSync(path);
    fail(`--output already exists at ${path}. Choose a new path; this tool never overwrites.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let parent;
  try { parent = statSync(dirname(path)); } catch {
    fail('--output parent does not exist. Create the work directory first.');
  }
  if (!parent.isDirectory()) fail('--output parent is not a directory. Choose a work directory.');
  // There is no --env here, so the credential identity set is empty. Existing
  // destinations (including hard links to tool files or inputs) are all refused.
  return path;
}
