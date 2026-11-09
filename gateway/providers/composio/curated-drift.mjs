#!/usr/bin/env node
// Compare reviewed curated definitions with a complete listing, without executing any tool.
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED } from './curated.js';
import { readApiKey } from './catalog-provider.js';

const ENDPOINT = 'https://backend.composio.dev/api/v3.1/tools';
const HINTS = new Set(['readOnlyHint', 'createHint', 'updateHint', 'destructiveHint']);
const HELP = `Usage: node gateway/providers/composio/curated-drift.mjs --env <absolute provider-key file>
       node gateway/providers/composio/curated-drift.mjs --fixture <listing.json>
       node gateway/providers/composio/curated-drift.mjs help | --help

--env <path>      Explicit absolute credential file, parsed like catalog-provider.js:
                  WISER_AUTH_PROVIDER_KEY, falling back to COMPOSIO_API_KEY.
--fixture <file>  Offline complete listing: an array of tools, or { "items": [...] }.
                  Each tool has slug, input_parameters and tags. No key is needed.
help, --help     Show this help without configuration or a network request.

Without --fixture, GET the tools listing for each curated toolkit with limit=1000,
following next_cursor. No tool is executed. This script installs and writes nothing.
Success prints one JSON object. Failures print only to stderr, never a credential
or provider response. Exit 0: all match; 1: drift or listing failure; 2: usage/key error.
`;

class CheckError extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === 'help' || flag === '--help') { options.help = true; continue; }
    if (!['--env', '--fixture'].includes(flag)) throw new CheckError(`Unknown option ${JSON.stringify(flag)}. Run with --help.`, 2);
    const key = flag.slice(2);
    if (Object.hasOwn(options, key)) throw new CheckError(`Repeated option ${flag}. Run with --help.`, 2);
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new CheckError(`${flag} requires a path. Run with --help.`, 2);
    options[key] = args[++i];
  }
  return options;
}

/** Sort object keys recursively, preserving array order and every schema annotation. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const within = (path, parent) => {
  const rel = relative(parent, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
};

function envFile(path) {
  if (!isAbsolute(path)) throw new CheckError('--env must be absolute; resolve the credential binding. Run with --help.', 2);
  try {
    const canonical = realpathSync(path);
    if (!statSync(canonical).isFile()) throw new Error();
    return canonical;
  } catch { throw new CheckError('--env is missing or unreadable; resolve the credential binding. Run with --help.', 2); }
}

function fixtureFile(path, envPath) {
  let canonical;
  let stats;
  try {
    canonical = realpathSync(resolve(path));
    stats = statSync(canonical);
    if (!stats.isFile()) throw new Error();
  } catch { throw new CheckError('--fixture must name a readable JSON listing file. Run with --help.', 2); }
  // Use the resolved path for both the screen and the read. Also catch a hard
  // link of the key file: a different spelling cannot make credentials a fixture.
  if (canonical.split(sep).some((segment) => segment.toLowerCase() === 'memory') || /(?:^|\/)\.?[^/]*\.env(?:\.[^/]*)?$/.test(canonical)) {
    throw new CheckError('--fixture refuses credential or memory files; provide a tool listing.', 2);
  }
  if (envPath) {
    if (within(canonical, dirname(envPath))) {
      throw new CheckError('--fixture must be outside the credential directory and cannot alias the key file.', 2);
    }
    // A hard link to any other file in that credential directory is refused too.
    // Follow links while collecting identities, but visit each directory only once.
    const visited = new Set();
    const identities = new Set();
    const collect = (path) => {
      const target = realpathSync(path);
      const entry = statSync(target);
      const identity = `${entry.dev}:${entry.ino}`;
      if (entry.isDirectory()) {
        if (visited.has(identity)) return;
        visited.add(identity);
        for (const name of readdirSync(target)) collect(resolve(target, name));
      } else identities.add(identity);
    };
    try { collect(dirname(envPath)); }
    catch { throw new CheckError('Cannot screen --fixture against the credential directory; check access and retry.', 2); }
    if (identities.has(`${stats.dev}:${stats.ino}`)) {
      throw new CheckError('--fixture cannot alias any file in the credential directory.', 2);
    }
  }
  return canonical;
}

function fixtureItems(file) {
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw new CheckError('--fixture is not a readable JSON listing. Run with --help.', 2); }
  const items = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(items) || (!Array.isArray(data) && data.next_cursor)) {
    throw new CheckError('--fixture must hold a complete array of tools or { "items": [...] }, with no next_cursor. Run with --help.', 2);
  }
  return items;
}

/** Complete listing or refusal, never a partial success. fetchImpl is injected in offline tests. */
export async function listTools(toolkit, apiKey, fetchImpl = globalThis.fetch) {
  const items = [];
  const cursors = new Set();
  let cursor = null;
  do {
    const query = new URLSearchParams({ toolkit_slug: toolkit, limit: '1000' });
    if (cursor) query.set('cursor', cursor);
    let response;
    try {
      response = await fetchImpl(`${ENDPOINT}?${query}`, {
        headers: { 'x-api-key': apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });
    } catch { throw new CheckError(`Listing failed (transport) at GET ${ENDPOINT}; retry the drift check.`); }
    if (!response.ok) {
      throw new CheckError(`Listing failed (HTTP ${response.status}) at GET ${ENDPOINT}; check access and retry.`,
        [401, 403].includes(response.status) ? 2 : 1);
    }
    let data;
    try { data = await response.json(); }
    catch { throw new CheckError(`Invalid JSON at GET ${ENDPOINT}; retry the drift check.`); }
    if (!Array.isArray(data?.items) || (data.next_cursor != null && typeof data.next_cursor !== 'string')) {
      throw new CheckError(`Invalid listing at GET ${ENDPOINT}; retry the drift check.`);
    }
    items.push(...data.items);
    cursor = data.next_cursor || null;
    if (cursor && cursors.has(cursor)) throw new CheckError(`Repeated cursor at GET ${ENDPOINT}; retry the drift check.`);
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return items;
}

/** Diagnose every row; narrowed fields may be removed only while optional upstream. */
export function findDrift(rows, tools) {
  const bySlug = new Map();
  for (const tool of tools) {
    if (!object(tool) || typeof tool.slug !== 'string') continue;
    const matches = bySlug.get(tool.slug) ?? [];
    matches.push(tool);
    bySlug.set(tool.slug, matches);
  }
  const drift = [];
  for (const row of rows) {
    const matches = bySlug.get(row.tool) ?? [];
    if (matches.length !== 1) {
      drift.push({ id: row.id, reason: matches.length ? 'duplicate_slug' : 'missing_slug' });
      continue;
    }
    const tool = matches[0];
    const schema = structuredClone(tool.input_parameters);
    const narrowed = row.narrowed ?? [];
    if (!object(schema) || !object(schema.properties) || !Array.isArray(narrowed)
      || narrowed.some((key) => typeof key !== 'string')
      || (schema.required !== undefined && !Array.isArray(schema.required))) {
      drift.push({ id: row.id, reason: 'input_schema' });
    } else {
      for (const key of narrowed) {
        if (schema.required?.includes(key)) drift.push({ id: row.id, reason: 'narrowed_required', field: key });
        delete schema.properties[key];
      }
      if (schema.required) schema.required = schema.required.filter((key) => !narrowed.includes(key));
      if (canonicalJson(schema) !== canonicalJson(row.input_schema)) drift.push({ id: row.id, reason: 'input_schema' });
    }
    const selectedHints = (hints) => [...new Set(hints.filter((hint) => HINTS.has(hint)))].sort();
    if (Array.isArray(tool.tags) && ((row.kind === 'read'
      && tool.tags.some((hint) => ['createHint', 'updateHint', 'destructiveHint'].includes(hint)))
      || (row.kind !== 'delete' && tool.tags.includes('destructiveHint')))) {
      drift.push({ id: row.id, reason: 'kind' });
    }
    if (!Array.isArray(tool.tags) || tool.tags.some((hint) => typeof hint !== 'string')
      || !Array.isArray(row.hint) || canonicalJson(selectedHints(tool.tags)) !== canonicalJson(selectedHints(row.hint))) {
      drift.push({ id: row.id, reason: 'hints' });
    }
  }
  return drift;
}

export async function main(args = process.argv.slice(2), { fetchImpl = globalThis.fetch, stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const options = parseArgs(args);
    if (options.help) { stdout.write(HELP); return 0; }
    if (!options.fixture && !options.env) throw new CheckError('--env is required; resolve the credential binding, or use --fixture for an offline check. Run with --help.', 2);
    const envPath = options.env ? envFile(options.env) : null;
    let tools;
    if (options.fixture) tools = fixtureItems(fixtureFile(options.fixture, envPath));
    else {
      const key = readApiKey(envPath);
      if (!key || !key.trim()) throw new CheckError('No provider key in --env; resolve the credential binding. Run with --help.', 2);
      tools = [];
      for (const toolkit of new Set(CURATED.map((row) => row.toolkit))) tools.push(...await listTools(toolkit, key, fetchImpl));
    }
    const drift = findDrift(CURATED, tools);
    if (drift.length) {
      stderr.write(`Curated drift detected; review these rows against the provider listing:\n${drift.map((row) => `${row.id}: ${row.reason}${row.field ? ` (${row.field})` : ''}`).join('\n')}\n`);
      return 1;
    }
    stdout.write(`${JSON.stringify({ ok: true, rows: CURATED.map((row) => row.id), source: options.fixture ? 'fixture' : 'provider' })}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof CheckError ? error.message : 'Curated drift check failed; verify the listing and retry.'}\n`);
    return error instanceof CheckError ? error.code : 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
