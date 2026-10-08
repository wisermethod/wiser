// Per-instant builds and the kit Function payload. The base build is the build-time view in dist/.
// For each scheduled instant, Astro builds again with KIT_BUILD_TIME at that instant into
// .kit-states/<n>/, and every file that differs from what was effective before becomes that path's
// version from that instant. dist-function/ sits beside dist/ and holds the Function, its routes,
// the data and a record. Nothing scheduled is written under dist/.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const STATE_ENV = 'KIT_STATE_BUILD';
export const isStateBuild = () => process.env[STATE_ENV] === '1';

// The sitemap filter reads the folder this build writes. A state build's out dir is not dist/.
export function hiddenBuiltFile(page, fromUrl) {
  const pathname = decodeURIComponent(new URL(page).pathname).replace(/\/+$/, '');
  const leaf = `${pathname === '' ? '/index' : pathname}.html`;
  const out = isStateBuild() && process.env.KIT_STATE_OUT ? process.env.KIT_STATE_OUT : '';
  if (out) return path.join(out, leaf.slice(1));
  return fileURLToPath(new URL(`./dist${leaf}`, fromUrl));
}

const BUDGET = 1572864;
const KIT_VERSION = '0.5.0';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript',
  '.json': 'application/json',
};
const STATIC_EXCLUDES = ['/pagefind/*', '/images/*', '/files/*', '/fonts/*', '/_astro/*'];

// pubDate and draft as scripts/check.mjs reads them: top-level key, then pubInstant and yamlBoolean.
function topLevel(file) {
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!m) return out;
  const lines = m[1].split(/\r?\n/);
  const first = lines.find((line) => line.trim() !== '' && !/^\s*#/.test(line));
  const root = first ? first.match(/^ */)[0].length : 0;
  for (const line of lines) {
    if ((line.match(/^ */) || [''])[0].length !== root) continue;
    const rest = line.slice(root);
    if (rest.trim() === '' || /^#/.test(rest) || /^-(?:\s|$)/.test(rest)) continue;
    const k = rest.match(/^(?:"((?:[^"\\]|\\.)+)"|'((?:[^']|'')+)'|([A-Za-z0-9_-]+))\s*:(.*)$/);
    if (!k || k[3] === '<<') continue;
    if (k[1] !== undefined && k[1].includes('\\')) continue;
    out[k[1] ?? (k[2] !== undefined ? k[2].replace(/''/g, "'") : k[3])] = k[4].replace(/\s+#.*$/, '').trim();
  }
  return out;
}
function unquote(value) {
  let v = String(value ?? '').replace(/^!!str\s+/, '').trim();
  const quoted = /^(["'])([\s\S]*)\1$/.exec(v);
  if (quoted) v = quoted[1] === "'" ? quoted[2].replace(/''/g, "'") : quoted[2];
  return v.trim();
}
function yamlBoolean(value) {
  const v = String(value ?? '').replace(/^!!bool\s+/, '');
  if (/^(?:true|True|TRUE)$/.test(v)) return 'true';
  if (/^(?:false|False|FALSE)$/.test(v)) return 'false';
  return null;
}
const YAML_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YAML_TIMESTAMP = /^(\d{4})-(\d\d?)-(\d\d?)(?:[Tt]|[ \t]+)(\d\d?):(\d\d):(\d\d)(?:\.(\d*))?(?:[ \t]*(Z|([-+])(\d\d?)(?::(\d\d))?))?$/;
function pubInstant(top) {
  if (!Object.hasOwn(top, 'pubDate')) return null;
  const raw = String(top.pubDate).trim();
  const text = /^!!str\s/.test(raw) || /^["']/.test(raw);
  const value = unquote(raw);
  if (!text) {
    const day = YAML_DATE.exec(value);
    if (day) return Date.UTC(+day[1], +day[2] - 1, +day[3]);
    const stamp = YAML_TIMESTAMP.exec(value);
    if (stamp) {
      const ms = stamp[7] ? Number(stamp[7].slice(0, 3).padEnd(3, '0')) : 0;
      let at = Date.UTC(+stamp[1], +stamp[2] - 1, +stamp[3], +stamp[4], +stamp[5], +stamp[6], ms);
      if (stamp[9]) at -= (stamp[9] === '-' ? -1 : 1) * ((+stamp[10] * 60 + Number(stamp[11] ?? 0)) * 60000);
      return at;
    }
  }
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

function files(dir, base = dir, out = new Map()) {
  let names = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) files(full, base, out);
    else out.set(path.relative(base, full).split(path.sep).join('/'), full);
  }
  return out;
}
function urlPath(rel) {
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) throw new Error(`kit schedule: ${rel} is a folder index, which the kit does not build`);
  return rel.endsWith('.html') ? `/${rel.slice(0, -5)}` : `/${rel}`;
}
const sha = (b) => createHash('sha256').update(b).digest('hex');
const iso = (at) => new Date(at).toISOString();

function articlesOn(site) {
  try {
    const kit = JSON.parse(readFileSync(path.join(site, 'kit.json'), 'utf8'));
    return !kit.collections || kit.collections.articles !== false;
  } catch {
    return true;
  }
}
function scheduledInstants(site, buildAt) {
  const instants = new Set();
  const walk = (dir) => {
    let names = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) { walk(file); continue; }
      if (!/\.(md|mdx)$/.test(name)) continue;
      const top = topLevel(file);
      if (yamlBoolean(top.draft ?? '') === 'true') continue;
      const at = pubInstant(top);
      if (at !== null && at > buildAt) instants.add(at);
    }
  };
  walk(path.join(site, 'src/content/articles'));
  return [...instants].sort((a, b) => a - b);
}
function redirectRows(site) {
  const file = path.join(site, 'public', '_redirects');
  try {
    if (!statSync(file).isFile()) return [];
  } catch {
    return [];
  }
  const rows = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    rows.push({ source: trimmed.split(/\s+/)[0], line: trimmed });
  }
  return rows;
}
// Pages: a * splat matches any remainder, including slashes, and a :name placeholder matches one segment.
// The name begins with a letter, so :_legacy is a literal colon.
function redirectSourceMatches(source, name) {
  let pattern = '^';
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '*') { pattern += '.*'; continue; }
    if (c === ':') {
      const ident = /^[A-Za-z][A-Za-z0-9_]*/.exec(source.slice(i + 1));
      if (ident) { pattern += '[^/]+'; i += ident[0].length; continue; }
    }
    pattern += /[.*+?^${}()|[\]\\]/.test(c) ? `\\${c}` : c;
  }
  return new RegExp(`${pattern}$`).test(name);
}
function recordedBuildTime(site) {
  try {
    const record = JSON.parse(readFileSync(path.join(site, '.astro', 'kit-build.json'), 'utf8'));
    if (typeof record.buildTime === 'string' && record.buildTime !== '') return record.buildTime;
  } catch { /* the env string is what the record writes */ }
  return process.env.KIT_BUILD_TIME;
}
function buildBin(versionMap, gzipParts, buildTime) {
  const paths = {};
  for (const key of [...versionMap.keys()].sort()) {
    const entry = versionMap.get(key);
    paths[key] = {
      page: entry.page,
      list: [...entry.list].sort((a, b) => a.at - b.at).map((item) => ({
        at: item.at, off: item.off, len: item.len, size: item.size, etag: item.etag, type: item.type,
      })),
    };
  }
  const head = Buffer.from(JSON.stringify({ v: 1, kitVersion: KIT_VERSION, buildTime, paths }), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(head.length);
  return Buffer.concat([Buffer.from('WKS1'), len, head, ...gzipParts]);
}
function routeRules(versionMap) {
  const carried = [...versionMap.keys()];
  let include = [];
  for (const key of carried) {
    const entry = versionMap.get(key);
    include.push(key);
    if (entry.page && entry.isNew && key !== '/') include.push(`${key}.html`, `${key}/`);
  }
  include = [...new Set(include)].sort();
  let exclude = [];
  const over = (inc, exc) => inc.length + exc.length > 100 || inc.some((rule) => rule.length > 100) || exc.some((rule) => rule.length > 100);
  if (over(include, exclude)) {
    const tops = new Set();
    for (const key of carried) {
      const parts = key.split('/');
      tops.add(parts.length > 2 ? `/${parts[1]}/*` : key);
    }
    include = [...tops].sort();
    exclude = [];
  }
  if (over(include, exclude)) {
    include = ['/*'];
    exclude = STATIC_EXCLUDES.filter((rule) => {
      const prefix = rule.slice(0, -1);
      return !carried.some((key) => key === prefix.slice(0, -1) || key.startsWith(prefix));
    }).sort();
  }
  return { include, exclude };
}
function summary(carried, notCarried, pathCount, bytes) {
  const which = notCarried.length ? ` (${notCarried.map(iso).join(', ')})` : '';
  console.log(`kit schedule: ${carried.length} instants carried, ${notCarried.length} not carried${which}, ${pathCount} paths, ${bytes} bytes`);
}

export function scheduledBuild({ root }) {
  const site = fileURLToPath(root);
  const fnDir = path.join(site, 'dist-function');
  const statesDir = path.join(site, '.kit-states');
  return {
    name: 'kit-scheduled-build',
    hooks: {
      'astro:build:start': () => {
        if (isStateBuild()) return;
        rmSync(fnDir, { recursive: true, force: true });
        rmSync(statesDir, { recursive: true, force: true });
        rmSync(path.join(site, '.astro', 'kit-schedule.json'), { force: true });
      },
      'astro:build:done': ({ dir }) => {
        if (isStateBuild()) return;
        if (!articlesOn(site)) return;
        const buildAt = Date.parse(process.env.KIT_BUILD_TIME);
        const order = Number.isFinite(buildAt) ? scheduledInstants(site, buildAt) : [];
        if (order.length === 0) return;
        const buildTime = recordedBuildTime(site);
        const redirects = redirectRows(site);
        const astroPkg = path.join(site, 'node_modules/astro/package.json');
        const astroBin = path.join(path.dirname(astroPkg), JSON.parse(readFileSync(astroPkg, 'utf8')).bin.astro);
        const dist = fileURLToPath(dir);
        const base = files(dist);
        const latest = new Map();
        const versions = new Map();
        const blobs = [];
        const blobAt = new Map();
        let blobBytes = 0;
        const carried = [];
        const notCarried = [];
        const clash = (key, entry) => {
          const names = [key];
          if (entry.page && entry.isNew && key !== '/') names.push(`${key}.html`, `${key}/`);
          const row = redirects.find((item) => names.some((name) => redirectSourceMatches(item.source, name)));
          if (row) throw new Error(`kit schedule: ${key} is a carried path and the source of a row in public/_redirects (${row.line})`);
        };
        try {
          for (const [n, at] of order.entries()) {
            if (notCarried.length) { notCarried.push(at); continue; }
            const out = path.join(statesDir, String(n));
            const result = spawnSync(process.execPath, [astroBin, 'build', '--outDir', out], {
              cwd: site,
              env: { ...process.env, KIT_BUILD_TIME: iso(at), [STATE_ENV]: '1', KIT_STATE_OUT: out },
              encoding: 'utf8',
              maxBuffer: 16 * 1024 * 1024,
            });
            if (result.error || result.status !== 0) {
              const tail = `${result.stdout || ''}${result.stderr || ''}${result.error ? result.error.message : ''}`.slice(-2000);
              throw new Error(`kit schedule: the build as of ${iso(at)} failed\n${tail}`);
            }
            const state = files(out);
            for (const rel of base.keys()) {
              if (!rel.startsWith('pagefind/') && !state.has(rel)) throw new Error(`kit schedule: the build as of ${iso(at)} has no ${rel}, which the base build has`);
            }
            const adds = [];
            const trialBlobAt = new Map(blobAt);
            let trialBlobBytes = blobBytes;
            const trialBlobs = blobs.slice();
            for (const [rel, file] of state) {
              if (rel.startsWith('pagefind/')) continue;
              const bytes = readFileSync(file);
              const before = latest.has(rel) ? latest.get(rel) : (base.has(rel) ? readFileSync(base.get(rel)) : null);
              if (before && before.equals(bytes)) continue;
              const ext = path.extname(rel);
              if (!TYPES[ext]) throw new Error(`kit schedule: ${rel} changes at ${iso(at)}, and the kit carries no ${ext || 'extensionless'} file`);
              const digest = sha(bytes);
              let place = trialBlobAt.get(digest);
              if (!place) {
                const gz = gzipSync(bytes, { level: 9 });
                place = { off: trialBlobBytes, len: gz.length, size: bytes.length };
                trialBlobAt.set(digest, place);
                trialBlobs.push(gz);
                trialBlobBytes += gz.length;
              }
              adds.push({ rel, bytes, digest, type: TYPES[ext], place, page: rel.endsWith('.html'), isNew: !base.has(rel) });
            }
            const trial = new Map();
            for (const [key, entry] of versions) trial.set(key, { page: entry.page, isNew: entry.isNew, list: entry.list.slice() });
            for (const add of adds) {
              const key = urlPath(add.rel);
              if (!trial.has(key)) trial.set(key, { page: add.page, isNew: add.isNew, list: [] });
              const entry = trial.get(key);
              entry.list.push({ at, ...add.place, etag: add.digest.slice(0, 32), type: add.type });
            }
            if (buildBin(trial, trialBlobs, buildTime).length > BUDGET) { notCarried.push(at); continue; }
            for (const add of adds) clash(urlPath(add.rel), trial.get(urlPath(add.rel)));
            versions.clear();
            for (const [key, entry] of trial) versions.set(key, entry);
            blobs.length = 0;
            for (const gz of trialBlobs) blobs.push(gz);
            blobAt.clear();
            for (const [digest, place] of trialBlobAt) blobAt.set(digest, place);
            blobBytes = trialBlobBytes;
            for (const add of adds) latest.set(add.rel, add.bytes);
            carried.push(at);
          }
        } finally {
          if (!process.env.KIT_KEEP_STATES) rmSync(statesDir, { recursive: true, force: true });
        }
        const noteDir = path.join(site, '.astro');
        mkdirSync(noteDir, { recursive: true });
        writeFileSync(path.join(noteDir, 'kit-schedule.json'), `${JSON.stringify({ buildTime, carried: carried.map(iso), notCarried: notCarried.map(iso) })}\n`);
        if (carried.length === 0) { summary(carried, notCarried, 0, 0); return; }
        const bin = buildBin(versions, blobs, buildTime);
        const routes = routeRules(versions);
        const routesText = `${JSON.stringify({ version: 1, include: routes.include, exclude: routes.exclude })}\n`;
        mkdirSync(fnDir, { recursive: true });
        const workerOut = path.join(fnDir, '_worker.js');
        copyFileSync(path.join(site, 'src/function/_worker.js'), workerOut);
        const routesOut = path.join(fnDir, '_routes.json');
        const scheduleOut = path.join(fnDir, 'schedule.bin');
        writeFileSync(scheduleOut, bin);
        writeFileSync(routesOut, routesText);
        const record = {
          kitVersion: KIT_VERSION,
          buildTime,
          worker: sha(readFileSync(workerOut)),
          routes: sha(readFileSync(routesOut)),
          schedule: sha(readFileSync(scheduleOut)),
          carried: carried.map(iso),
          notCarried: notCarried.map(iso),
          paths: versions.size,
        };
        writeFileSync(path.join(fnDir, 'function.json'), `${JSON.stringify(record, null, 2)}\n`);
        summary(carried, notCarried, versions.size, bin.length);
      },
    },
  };
}
