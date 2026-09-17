import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

async function viaCatalog(input, ctx) {
  const args = { ...input };
  const names = { team_id: 'teamId', id_or_name: 'idOrName', project_id: 'projectId', git_source: 'gitSource' };
  for (const [from, to] of Object.entries(names)) {
    if (Object.hasOwn(args, from)) {
      args[to] = args[from];
      delete args[from];
    }
  }
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, args);
}

// A deployment's bytes come off disk, because the alternative is the caller
// base64ing every file into the call: 962,496 bytes of real site became 1,283,376
// base64 characters, which is the limit this module exists to remove. That makes
// every path here a caller-named path, so `standards/script-contract.md` line 35
// governs it and line 43 forbids this module reading a credential file at all.
//
// Line 35's screen is implemented below rather than restated: canonicalise against
// the filesystem walking up to the deepest ancestor that exists, refuse a path that
// cannot be canonicalised instead of comparing its spelling, then compare by device
// and inode against the refused set. A module may not import gateway code
// (`script-contract.md` Connector modules, Imports), so the platform user-config
// directory is recomputed here; it must stay in step with `gateway/src/paths.js`
// `wiserUserConfigDir`, which is the only reason this duplicate exists.
//
// This screen is not a general data-loss boundary and cannot be one: a credential
// the caller stores inside the directory they named, under a name this module has
// no way to recognise, is uploaded. `confirmation: always` and the returned manifest
// are the controls for that, and `CONNECTOR.md` says so plainly.
function userConfigDir(platform = process.platform, env = process.env, home = homedir()) {
  if (platform === 'win32') {
    const base = env.APPDATA && env.APPDATA.length > 0 ? env.APPDATA : join(home, 'AppData', 'Roaming');
    return join(base, 'wiser');
  }
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'wiser');
  const xdg = env.XDG_CONFIG_HOME;
  if (typeof xdg === 'string' && xdg.length > 0) return join(xdg, 'wiser');
  return join(home, '.config', 'wiser');
}

function canonicalize(input) {
  let head = resolve(String(input));
  const below = [];
  for (;;) {
    try {
      return below.length === 0 ? realpathSync(head) : join(realpathSync(head), ...[...below].reverse());
    } catch {
      const parent = dirname(head);
      if (parent === head) return null;
      below.push(basename(head));
      head = parent;
    }
  }
}

function identity(path) {
  try {
    const s = statSync(path);
    return `${s.dev}:${s.ino}`;
  } catch {
    return null;
  }
}

function isInside(child, parent) {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

// The refused set of `script-contract.md` line 35: the provider key file and every
// file resolving inside the directory that holds it, which holds credentials and
// nothing else. Identities are collected by listing and stat-ing that directory, so
// a hard link to a credential under any other spelling is caught. No file in it is
// ever opened.
function refusedSet() {
  const dir = canonicalize(userConfigDir());
  const ids = new Set();
  const home = canonicalize(homedir());
  if (home) ids.add(identity(home));
  if (dir) {
    // Recursive, because the user-config directory has subdirectories of its own
    // (`models/`, per `tools/AGENTS.md`) and a hard link to a nested credential
    // keeps an inode that an immediate-children scan never collects.
    const seen = new Set();
    const stack = [dir];
    while (stack.length > 0) {
      const here = stack.pop();
      const hereId = identity(here);
      if (hereId) {
        if (seen.has(hereId)) continue;
        seen.add(hereId);
        ids.add(hereId);
      }
      let entries;
      try {
        entries = readdirSync(here, { withFileTypes: true });
      } catch { continue; }
      for (const entry of entries) {
        const child = canonicalize(join(here, entry.name));
        if (!child) continue;
        const childId = identity(child);
        if (childId) ids.add(childId);
        if (entry.isDirectory()) stack.push(child);
      }
    }
  }
  ids.delete(null);
  return { dir, home, ids };
}

function screenFile(input, refused, root) {
  const resolved = canonicalize(input);
  if (!resolved) return { refused: 'unresolvable' };
  if (root && !isInside(resolved, root)) return { refused: 'outside the named directory', resolved };
  let stats;
  try {
    stats = statSync(resolved);
  } catch {
    return { refused: 'not found', resolved };
  }
  if (!stats.isFile()) return { refused: 'not a regular file', resolved };
  if (refused.ids.has(`${stats.dev}:${stats.ino}`)) return { refused: 'credential', resolved };
  if (refused.dir && isInside(resolved, refused.dir)) return { refused: 'credential', resolved };
  const base = basename(resolved);
  if (base === '.env' || base.startsWith('.env.')) return { refused: 'credential', resolved };
  return { resolved, size: stats.size };
}

function screenRoot(input, refused) {
  const resolved = canonicalize(input);
  if (!resolved) return { refused: 'unresolvable' };
  let stats;
  try {
    stats = statSync(resolved);
  } catch {
    return { refused: 'not found', resolved };
  }
  if (!stats.isDirectory()) return { refused: 'not a directory', resolved };
  const id = `${stats.dev}:${stats.ino}`;
  if (refused.ids.has(id)) return { refused: 'credential directory', resolved };
  if (refused.dir && (isInside(resolved, refused.dir) || isInside(refused.dir, resolved))) {
    return { refused: 'credential directory', resolved };
  }
  if (refused.home && resolved === refused.home) return { refused: 'home directory', resolved };
  return { resolved };
}

function walk(root, refused) {
  const kept = [];
  const skipped = [];
  const stack = [root];
  const walked = new Set([identity(root)].filter(Boolean));
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      skipped.push({ file: relativeName(root, dir), reason: 'unreadable' });
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      // Whatever kind of entry it is: a worktree's `.git` is a regular file naming
      // a path outside the tree, and a symbolic link would dodge a directory test.
      if (entry.name === '.git') continue;
      const resolved = canonicalize(full);
      if (!resolved || !isInside(resolved, root)) {
        skipped.push({ file: relativeName(root, full), reason: 'outside the named directory' });
        continue;
      }
      if (entry.isSymbolicLink() && !entry.isFile()) {
        // A directory reached through a link is not walked. `loop -> .` would
        // otherwise re-push the root forever, and this walk is synchronous.
        skipped.push({ file: relativeName(root, full), reason: 'link to a directory' });
        continue;
      }
      let stats;
      try {
        stats = statSync(resolved);
      } catch {
        skipped.push({ file: relativeName(root, full), reason: 'not found' });
        continue;
      }
      if (stats.isDirectory()) {
        const id = `${stats.dev}:${stats.ino}`;
        if (walked.has(id)) {
          skipped.push({ file: relativeName(root, full), reason: 'already walked' });
          continue;
        }
        walked.add(id);
        stack.push(resolved);
        continue;
      }
      const screened = screenFile(resolved, refused, root);
      if (screened.refused) {
        skipped.push({ file: relativeName(root, full), reason: screened.refused });
        continue;
      }
      const name = relativeName(root, screened.resolved);
      if (!validName(name)) {
        skipped.push({ file: name, reason: 'unsafe deployment name' });
        continue;
      }
      kept.push({ resolved: screened.resolved, name });
    }
  }
  kept.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { kept, skipped };
}

function relativeName(root, full) {
  const rest = full === root ? '' : full.slice(root.length).replace(/^[\\/]+/, '');
  return rest.split(sep).join('/');
}

function validName(name) {
  return typeof name === 'string'
    && name.length > 0
    && !name.startsWith('/')
    && !/^[a-zA-Z]:/.test(name)
    && !name.includes('\\')
    && !name.split('/').includes('..');
}

function query(input, extra = {}) {
  const qs = new URLSearchParams();
  if (input.team_id) qs.set('teamId', String(input.team_id));
  if (input.slug) qs.set('slug', String(input.slug));
  for (const [key, value] of Object.entries(extra)) qs.set(key, value);
  const text = qs.toString();
  return text ? `?${text}` : '';
}

async function uploadOne(ctx, resolved, name, suffix) {
  const bytes = readFileSync(resolved);
  const sha = createHash('sha1').update(bytes).digest('hex');
  // The digest is a request header, carried by `parameters` with `type: 'header'`.
  // Verified live 2026-09-17 against a null control that returns `invalid_digest`
  // and a wrong-digest control that returns `sha1sum_mismatch`, so the value is
  // known to reach the vendor and be compared rather than ignored.
  await ctx.proxy({
    endpoint: `/v2/files${suffix}`,
    method: 'POST',
    binary_body: { base64: bytes.toString('base64'), content_type: 'application/octet-stream' },
    parameters: [{ name: 'x-vercel-digest', value: sha, type: 'header' }],
  });
  return { file: name, sha, size: bytes.length };
}

// Present means the key is there and not null. An empty string, [] or {} is a
// source the caller supplied and got wrong, never a source they omitted, so it is
// refused rather than falling through to another one.
function present(input, key) {
  return Object.hasOwn(input, key) && input[key] !== null && input[key] !== undefined;
}

function validReference(item) {
  return item !== null
    && typeof item === 'object'
    && !Array.isArray(item)
    && validName(item.file)
    && typeof item.sha === 'string'
    && /^[0-9a-f]{40}$/.test(item.sha)
    && Number.isInteger(item.size)
    && item.size >= 0
    && !Object.hasOwn(item, 'data');
}

function validInline(item) {
  return item !== null
    && typeof item === 'object'
    && !Array.isArray(item)
    && validName(item.file)
    && typeof item.data === 'string'
    && !Object.hasOwn(item, 'sha')
    && !Object.hasOwn(item, 'size');
}

function duplicated(names) {
  return new Set(names).size !== names.length;
}

export const modules = {
  'projects': {
    list: viaCatalog,
    get: viaCatalog,
  },
  'deployments': {
    list: viaCatalog,

    async upload_file(input, ctx) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { status: 'invalid_arguments', field: 'input' };
      }
      if (typeof input.path !== 'string' || input.path.length === 0) {
        return { status: 'invalid_arguments', field: 'path' };
      }
      const screened = screenFile(input.path, refusedSet(), null);
      if (screened.refused) {
        return { status: 'invalid_arguments', field: 'path', reason: screened.refused };
      }
      let name = basename(screened.resolved);
      if (present(input, 'name')) {
        // `script-contract.md` line 35 lets an upload's display name keep the
        // caller's spelling; the bytes always come from the resolved path.
        if (!validName(input.name)) return { status: 'invalid_arguments', field: 'name' };
        name = input.name;
      }
      return uploadOne(ctx, screened.resolved, name, query(input));
    },

    async create(input, ctx) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { status: 'invalid_arguments', field: 'input' };
      }
      if (typeof input.name !== 'string' || input.name.length === 0) {
        return { status: 'invalid_arguments', field: 'name' };
      }
      const sources = ['dir', 'files', 'git_source'].filter((key) => present(input, key));
      if (sources.length !== 1) {
        return { status: 'invalid_arguments', field: 'files', sources_given: sources };
      }
      if (present(input, 'project') && (typeof input.project !== 'string' || input.project.length === 0)) {
        return { status: 'invalid_arguments', field: 'project' };
      }
      if (present(input, 'target') && (typeof input.target !== 'string' || input.target.length === 0)) {
        return { status: 'invalid_arguments', field: 'target' };
      }
      if (present(input, 'skip_auto_detection') && typeof input.skip_auto_detection !== 'boolean') {
        return { status: 'invalid_arguments', field: 'skip_auto_detection' };
      }
      if (present(input, 'project_settings')
        && (typeof input.project_settings !== 'object' || Array.isArray(input.project_settings))) {
        return { status: 'invalid_arguments', field: 'project_settings' };
      }

      const source = sources[0];
      let files = [];
      let uploaded = [];
      let skipped = [];

      if (source === 'dir') {
        if (typeof input.dir !== 'string' || input.dir.length === 0) {
          return { status: 'invalid_arguments', field: 'dir' };
        }
        const refused = refusedSet();
        const root = screenRoot(input.dir, refused);
        if (root.refused) return { status: 'invalid_arguments', field: 'dir', reason: root.refused };
        const walked = walk(root.resolved, refused);
        if (walked.kept.length === 0) {
          return { status: 'invalid_arguments', field: 'dir', reason: 'no uploadable files', skipped: walked.skipped };
        }
        if (duplicated(walked.kept.map((f) => f.name))) {
          return { status: 'invalid_arguments', field: 'dir', reason: 'duplicate deployment names' };
        }
        skipped = walked.skipped;
        const suffix = query(input);
        for (const file of walked.kept) {
          // An upload failure unwinds here: ctx.proxy throws a status signal the
          // gateway returns, so no later file is uploaded and no deployment is made.
          files.push(await uploadOne(ctx, file.resolved, file.name, suffix));
        }
        uploaded = files;
      } else if (source === 'files') {
        if (!Array.isArray(input.files) || input.files.length === 0) {
          return { status: 'invalid_arguments', field: 'files' };
        }
        const strings = input.files.filter((item) => typeof item === 'string').length;
        if (strings > 0 && strings !== input.files.length) {
          return { status: 'invalid_arguments', field: 'files', reason: 'mixed paths and file objects' };
        }
        if (strings > 0) {
          const refused = refusedSet();
          const screened = [];
          for (const path of input.files) {
            if (path.length === 0) return { status: 'invalid_arguments', field: 'files' };
            const one = screenFile(path, refused, null);
            if (one.refused) {
              return { status: 'invalid_arguments', field: 'files', reason: one.refused, file: basename(String(path)) };
            }
            const name = basename(one.resolved);
            if (!validName(name)) {
              return { status: 'invalid_arguments', field: 'files', reason: 'unsafe deployment name' };
            }
            screened.push({ resolved: one.resolved, name });
          }
          if (duplicated(screened.map((f) => f.name))) {
            return { status: 'invalid_arguments', field: 'files', reason: 'duplicate deployment names' };
          }
          const suffix = query(input);
          for (const file of screened) {
            files.push(await uploadOne(ctx, file.resolved, file.name, suffix));
          }
          uploaded = files;
        } else {
          for (const item of input.files) {
            if (!validReference(item) && !validInline(item)) {
              return { status: 'invalid_arguments', field: 'files' };
            }
          }
          if (duplicated(input.files.map((item) => item.file))) {
            return { status: 'invalid_arguments', field: 'files', reason: 'duplicate deployment names' };
          }
          files = input.files;
        }
      } else if (typeof input.git_source !== 'object' || Array.isArray(input.git_source)
        || typeof input.git_source.type !== 'string' || input.git_source.type.length === 0) {
        return { status: 'invalid_arguments', field: 'git_source' };
      }

      const body = { name: input.name };
      if (present(input, 'project')) body.project = input.project;
      if (present(input, 'target')) body.target = input.target;
      if (present(input, 'project_settings')) body.projectSettings = input.project_settings;
      if (source === 'git_source') body.gitSource = input.git_source;
      else body.files = files;

      const extra = present(input, 'skip_auto_detection')
        ? { skipAutoDetectionConfirmation: input.skip_auto_detection ? '1' : '0' }
        : {};
      const res = await ctx.proxy({
        endpoint: `/v13/deployments${query(input, extra)}`,
        method: 'POST',
        body,
      });
      const deployment = res && typeof res === 'object' && 'data' in res ? res.data : res;
      return { deployment, uploaded, skipped };
    },
  },
};
