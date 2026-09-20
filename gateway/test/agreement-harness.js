/**
 * The manifest-to-module agreement harness. It holds no assertions about the tree and is
 * imported by two callers: `agreement.test.js`, which asserts against the baseline, and
 * `regenerate-baseline.mjs`, which writes it. Keeping the collector here is deliberate: a
 * generator that imported the test file would run the test as a side effect of generating,
 * which it did once and was confusing enough to be worth this file.
 *
 * A connector publishes an input schema in `manifest.json` and enforces rules in `index.js`.
 * Until 2026-09-20 nothing compared them: `src/manifest.js` type-checks that `input` is an
 * object and never validated a call against it, so the module was the only enforcer and the
 * schema was documentation. That is how 189 divergences accumulated under a suite of 485
 * passing connector tests. `src/input-schema.js` now applies the published schema before
 * any module runs, and **this harness applies that same function**, so what it measures is
 * what a caller gets.
 *
 * It compares the two sides in both directions, by calling each real module behind that
 * validator with a context whose transport throws a sentinel. Nothing leaves the machine and
 * no grant is touched. A valid instance that is refused is a rule the module enforces and
 * does not publish; a violation that reaches the vendor is a rule the manifest publishes and
 * nothing applies.
 *
 * ## What it does not cover
 *
 * Required-field deletion, nested and array-item mutation, fractional values for integer
 * fields, anything a module enforces after its first transport call, and pattern space beyond
 * the exemplars below. Stated so a pass is not mistaken for a proof.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chdir, cwd } from 'node:process';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateInput } from '../src/input-schema.js';

const CONNECTORS = fileURLToPath(new URL('../../connectors', import.meta.url));

/**
 * One satisfying exemplar per shipped pattern, and for some a second chosen to be awkward
 * while still satisfying it. The second table is not decoration: `^operations/[^/]+$`
 * admits `operations/.`, which `google-cloud` refuses, and one benign exemplar per pattern
 * can never find that. Each exemplar is asserted against its own pattern before use, so a
 * wrong entry fails loudly, and a pattern with no entry fails rather than being skipped.
 */
const PATTERN_OK = {
  '\\S': 'x',
  '^([a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]{1,19})$': 'wiser-method-prod',
  '^\\d{4}-\\d{2}-\\d{2}$': '2026-09-20',
  '^[a-z_.]+,(asc|desc)$': 'name,asc',
  '^[^\\s/]+$': 'translate.googleapis.com',
  '^[A-Za-z]{2,8}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?(-([A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$': 'en-US',
  '^[0-9]+$': '12345',
  '^operations/[^/]+$': 'operations/abc123',
  '^[^/]+$': 'abc123',
  '^[A-Za-z0-9+/_-]+={0,2}$': 'abcd',
  '^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$': 'audit-key',
  '^[Hh][Tt][Tt][Pp][Ss]://': 'https://example.com/x',
};
const PATTERN_ADVERSARIAL = {
  '^operations/[^/]+$': ['operations/.', 'operations/..'],
  '^[^/]+$': ['.', '..', ' '],
  '^[^\\s/]+$': ['.', '..', '\u001b'],
  '\\S': ['  x  ', '\u0000x'],
  '^[0-9]+$': ['0000000000000000000000'],
};
const VIOLATION_CANDIDATES = [' ', '/', '!', '', 'a/b', '\u0000', 'ZZ ZZ', '../..'];

/**
 * `vercel deployments.upload_file` requires `path` to name a readable file. That is
 * filesystem state rather than a string shape, so no schema can publish it and the harness
 * must supply one.
 *
 * **It is created inside `collectDivergences` and not at import**, in a directory made by
 * `mkdtemp`, and removed afterwards. Importing this module does nothing to the filesystem:
 * `node --test` loads every file under `test/`, so an import-time write would happen on
 * every suite run, at a predictable path an existing symlink could redirect.
 */
let FIXTURE_FILE = '';

/**
 * Field overrides that give an action a baseline its module accepts.
 *
 * **Every entry is a defect.** Each exists because a module requires something its schema
 * does not publish: a URL where the schema says string, a language tag, exactly one of two
 * fields. An entry becomes deletable the day that schema is corrected, so this table and
 * `agreement-baseline.json` shrink together and the class closes when both are empty.
 */
const URL_OK = 'https://example.com/';
const FIXTURES = {
  'bing:webmaster.search_performance': { site_url: URL_OK },
  'bing:webmaster.query_performance': { site_url: URL_OK },
  'bing:webmaster.page_performance': { site_url: URL_OK, page_url: URL_OK },
  'bing:webmaster.crawl_diagnostics': { site_url: URL_OK },
  'bing:webmaster.inspect_url': { site_url: URL_OK, url: URL_OK },
  'bing:webmaster.feeds': { site_url: URL_OK },
  'bing:webmaster.inbound_links': { site_url: URL_OK },
  'bing:webmaster.research_keywords': { start_date: '2026-09-01', end_date: '2026-09-20' },
  'google:search-console.sitemaps': { site_url: URL_OK },
  'google:search-console.inspect': { site_url: URL_OK, inspection_url: URL_OK + 'a' },
  'google:search-console.get_sitemap': { site_url: URL_OK, feedpath: URL_OK + 's.xml' },
  'google-apis:insights.run': { url: URL_OK },
  'google-apis:translate.text': { target: 'en' },
  'google-apis:voice.synthesize': { language_code: 'en-US' },
  'dataforseo:research.serp': { location_code: 2840, language_code: 'en' },
  'dataforseo:research.keyword_ideas': { location_code: 2840, language_code: 'en' },
  'dataforseo:research.related_keywords': { location_code: 2840, language_code: 'en' },
  'dataforseo:research.keyword_difficulty': { location_code: 2840, language_code: 'en' },
  'dataforseo:research.ranked_keywords': { location_code: 2840, language_code: 'en' },
  'dataforseo:research.competitors': { location_code: 2840, language_code: 'en' },
  'google-vision:images.detect_faces': { image_uri: URL_OK + 'a.jpg' },
  'vercel:deployments.create': { git_source: { type: 'github', repoId: 1, ref: 'main' } },
  // Resolved at call time, because FIXTURE_FILE is created per run rather than at import.
  'vercel:deployments.upload_file': () => ({ path: FIXTURE_FILE }),
};

function sampleString(s) {
  if (Array.isArray(s.enum)) return s.enum[0];
  if (s.pattern) {
    const ok = PATTERN_OK[s.pattern];
    if (ok === undefined) throw new Error(`no exemplar for pattern ${s.pattern}`);
    if (!new RegExp(s.pattern).test(ok)) throw new Error(`exemplar fails its own pattern ${s.pattern}`);
    if (s.maxLength && ok.length > s.maxLength) throw new Error(`exemplar too long for ${s.pattern}`);
    if (s.minLength && ok.length < s.minLength) throw new Error(`exemplar too short for ${s.pattern}`);
    return ok;
  }
  const min = s.minLength ?? 1;
  const max = s.maxLength ?? Math.max(min, 1);
  return 'a'.repeat(Math.min(Math.max(min, 1), max));
}

function sample(s) {
  if (!s || typeof s !== 'object') return 'a';
  if (Array.isArray(s.enum)) return s.enum[0];
  switch (s.type) {
    case 'string': return sampleString(s);
    case 'integer':
    case 'number': {
      let v = s.minimum ?? 1;
      if (s.maximum !== undefined && v > s.maximum) v = s.maximum;
      if (s.multipleOf) v = Math.ceil(v / s.multipleOf) * s.multipleOf;
      if (s.type === 'integer') v = Math.trunc(v);
      return v;
    }
    case 'boolean': return true;
    case 'array': {
      const n = Math.max(s.minItems ?? 1, 1);
      return Array.from({ length: Math.min(n, s.maxItems ?? n) }, () => sample(s.items ?? { type: 'string' }));
    }
    case 'object': {
      const out = {};
      for (const r of s.required ?? []) out[r] = sample(s.properties?.[r] ?? { type: 'string' });
      if (!s.required?.length && s.properties) {
        const first = Object.keys(s.properties)[0];
        if (first) out[first] = sample(s.properties[first]);
      }
      return out;
    }
    default: {
      if (s.anyOf) return sample(s.anyOf[0]);
      return 'a';
    }
  }
}

// Composition is part of the published schema. `google-apis voice.synthesize` uses
// `oneOf` to say "exactly one of text or ssml", so a sampler that reads only `required`
// generates an instance the schema itself rejects and then reports the module for
// refusing it. Found by adversarial review 2026-09-20; it produced a false finding.
function requiredFromComposition(schema) {
  const extra = [];
  for (const key of ['oneOf', 'anyOf', 'allOf']) {
    const branches = schema[key];
    if (!Array.isArray(branches) || !branches.length) continue;
    const take = key === 'allOf' ? branches : [branches[0]];
    for (const b of take) for (const r of b?.required ?? []) extra.push(r);
  }
  return extra;
}

function validInstance(schema) {
  const out = {};
  const props = schema.properties ?? {};
  for (const r of [...(schema.required ?? []), ...requiredFromComposition(schema)]) {
    out[r] = sample(props[r] ?? { type: 'string' });
  }
  return out;
}

/**
 * Check an instance against the schema that produced it, independently of the sampler.
 * Returns the keyword it violates, or null. A sample that fails this is a harness bug
 * and is reported as one; it is never reported as a connector finding.
 */

// Keywords this checker does not model. An action using one is reported as a harness
// error rather than judged, because a self-check that silently ignores a construct is a
// self-check that cannot do its job. Round two of adversarial review asked for exactly
// this: model it, or refuse to judge it.
const UNMODELLED = ['allOf', 'not', 'if', 'then', 'else', 'dependentRequired', 'dependentSchemas', '$ref'];

function unmodelledKeyword(schema) {
  for (const k of UNMODELLED) if (Object.hasOwn(schema ?? {}, k)) return k;
  for (const d of Object.values(schema?.properties ?? {})) {
    if (!d || typeof d !== 'object') continue;
    for (const k of UNMODELLED) if (Object.hasOwn(d, k)) return `${k} (nested)`;
    const inner = unmodelledKeyword(d.items);
    if (inner) return `${inner} (items)`;
  }
  return null;
}

function schemaViolation(schema, instance) {
  const unmodelled = unmodelledKeyword(schema);
  if (unmodelled) return `unmodelled:${unmodelled}`;
  for (const r of schema.required ?? []) {
    if (!Object.hasOwn(instance, r)) return `required:${r}`;
  }
  for (const key of ['oneOf', 'anyOf']) {
    const branches = schema[key];
    if (!Array.isArray(branches) || !branches.length) continue;
    const satisfied = branches.filter((b) => (b?.required ?? []).every((r) => Object.hasOwn(instance, r)));
    if (key === 'oneOf' && satisfied.length !== 1) return `oneOf:${satisfied.length}`;
    if (key === 'anyOf' && satisfied.length === 0) return 'anyOf:0';
  }
  if (schema.additionalProperties === false) {
    const extra = Object.keys(instance).find((k) => !Object.hasOwn(schema.properties ?? {}, k));
    if (extra) return `additionalProperties:${extra}`;
  }
  for (const [name, value] of Object.entries(instance)) {
    const d = schema.properties?.[name];
    if (!d) continue;
    if (d.type === 'string' && typeof value !== 'string') return `type:${name}`;
    if (d.type === 'integer' && !Number.isInteger(value)) return `type:${name}`;
    if (d.type === 'array' && !Array.isArray(value)) return `type:${name}`;
    if (Array.isArray(d.enum) && !d.enum.includes(value)) return `enum:${name}`;
    if (typeof value === 'string') {
      if (d.pattern && !new RegExp(d.pattern).test(value)) return `pattern:${name}`;
      if (d.maxLength !== undefined && [...value].length > d.maxLength) return `maxLength:${name}`;
      if (d.minLength !== undefined && [...value].length < d.minLength) return `minLength:${name}`;
    }
    if (typeof value === 'number') {
      if (d.minimum !== undefined && value < d.minimum) return `minimum:${name}`;
      if (d.maximum !== undefined && value > d.maximum) return `maximum:${name}`;
      if (d.multipleOf && value % d.multipleOf !== 0) return `multipleOf:${name}`;
    }
    if (Array.isArray(value)) {
      if (d.minItems !== undefined && value.length < d.minItems) return `minItems:${name}`;
      if (d.maxItems !== undefined && value.length > d.maxItems) return `maxItems:${name}`;
      const it = d.items;
      if (it && typeof it === 'object') {
        for (const item of value) {
          if (it.type === 'string' && typeof item !== 'string') return `items.type:${name}`;
          if (it.type === 'integer' && !Number.isInteger(item)) return `items.type:${name}`;
          if (it.type === 'object') {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return `items.type:${name}`;
            for (const r of it.required ?? []) if (!Object.hasOwn(item, r)) return `items.required:${name}.${r}`;
          }
          if (Array.isArray(it.enum) && !it.enum.includes(item)) return `items.enum:${name}`;
          if (typeof item === 'string' && it.pattern && !new RegExp(it.pattern).test(item)) return `items.pattern:${name}`;
        }
      }
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && d.type === 'object') {
      for (const r of d.required ?? []) if (!Object.hasOwn(value, r)) return `nested.required:${name}.${r}`;
      if (d.additionalProperties === false) {
        const extra = Object.keys(value).find((k) => !Object.hasOwn(d.properties ?? {}, k));
        if (extra) return `nested.additionalProperties:${name}.${extra}`;
      }
    }
  }
  return null;
}

/**
 * The gateway's own validator, applied by the harness before the module runs.
 *
 * **This is the entry point, and it is not optional.** `gateway.js` validates a call
 * against `act.input` before it calls `resolved.fn`, so a harness that called
 * `impl.modules[mod][act]` raw would bypass the thing being measured and every closed
 * divergence would appear to return. It imports the shipped function rather than copying
 * it, because a second implementation of the validator is a second thing to keep true.
 *
 * Until 2026-09-20 eleven connectors carried a byte-identical copy of this code and
 * fourteen carried nothing, and the fourteen held all 189 divergences. The copies are
 * deleted; `gateway/src/input-schema.js` says why the gateway owns it and what it reads.
 */
function withGatewayValidation(schema, run) {
  return async (input, ctx) => {
    const field = validateInput(schema, input);
    if (field) return { status: 'invalid_arguments', field };
    return run(input, ctx);
  };
}

const REACHED = Symbol('reached-vendor');

function makeCtx(service, module, action, input) {
  const reach = () => { const e = new Error('reached vendor'); e[REACHED] = true; throw e; };
  return { service, module, action, input, confirm: true, proxy: reach, http: reach, catalog: reach, audit() {} };
}

async function call(fn, input, service, module, action) {
  try {
    const res = await fn(input, makeCtx(service, module, action, input));
    if (res && typeof res === 'object' && res.status === 'invalid_arguments') return { kind: 'refused', field: res.field };
    return { kind: 'returned' };
  } catch (err) {
    return err[REACHED] ? { kind: 'reached' } : { kind: 'threw', detail: String(err?.message ?? err).slice(0, 80) };
  }
}

/**
 * Collect every divergence, as stable `direction connector module.action detail` keys.
 * Exported so `regenerate-baseline.mjs` writes the file from the same code that asserts
 * against it; a baseline generated by a second implementation is a baseline that can
 * disagree with its own test.
 */
export async function collectDivergences() {
  // A private working directory for the whole run. It gives the one filesystem-dependent
  // action its file, and it makes every key deterministic: `vercel upload_file` resolves a
  // relative `path` against the working directory, so a file named `a` sitting in whatever
  // directory the suite happened to run from would silently change a finding into a pass.
  const scratch = mkdtempSync(join(tmpdir(), 'wiser-agreement-'));
  const previousCwd = cwd();
  FIXTURE_FILE = join(scratch, 'upload-fixture.txt');
  writeFileSync(FIXTURE_FILE, 'agreement fixture\n');
  chdir(scratch);
  try {
    return await collect();
  } finally {
    chdir(previousCwd);
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function collect() {
  const found = new Set();
  const errors = [];
  const names = readdirSync(CONNECTORS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(CONNECTORS, e.name, 'manifest.json')))
    .map((e) => e.name).sort();

  for (const name of names) {
    const dir = join(CONNECTORS, name);
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    const impl = await import(pathToFileURL(join(dir, 'index.js')).href);

    for (const [mod, md] of Object.entries(manifest.modules)) {
      for (const [act, ad] of Object.entries(md.actions)) {
        const raw = impl.modules?.[mod]?.[act];
        const where = `${name} ${mod}.${act}`;
        if (typeof raw !== 'function') { errors.push(`${where}: not a function`); continue; }
        const schema = ad.input;
        if (!schema) continue;
        const fn = withGatewayValidation(schema, raw);

        let base;
        try { base = validInstance(schema); }
        catch (err) { errors.push(`${where}: sampler: ${err.message}`); continue; }
        const bad = schemaViolation(schema, base);
        if (bad) { errors.push(`${where}: sample fails its own schema: ${bad}`); continue; }

        // A. measured before any fixture: the module refuses what its schema permits.
        const plain = await call(fn, base, manifest.service, mod, act);
        if (plain.kind === 'refused') found.add(`A ${where} ${plain.field}`);

        const entry = FIXTURES[`${name}:${mod}.${act}`];
        const fixture = typeof entry === 'function' ? entry() : entry;
        if (fixture) {
          base = { ...base, ...fixture };
          const bad2 = schemaViolation(schema, base);
          if (bad2) { errors.push(`${where}: fixture fails the schema: ${bad2}`); continue; }
        }
        const accepted = fixture ? await call(fn, base, manifest.service, mod, act) : plain;
        // Every direction below needs a baseline the module accepts; without one a refusal
        // after a mutation may be the baseline's own refusal repeated.
        if (accepted.kind !== 'reached') { found.add(`F ${where} no-accepted-baseline`); continue; }

        // C and D. the undeclared key.
        const rx = await call(fn, { ...base, __agreement_undeclared__: 'x' }, manifest.service, mod, act);
        const closed = schema.additionalProperties === false;
        if (closed && rx.kind === 'reached') found.add(`C ${where} undeclared-key-accepted`);
        if (!closed && rx.kind === 'refused') found.add(`D ${where} ${rx.field}`);
        if (rx.kind === 'threw') found.add(`G ${where} threw-on-undeclared-key`);

        for (const [pn, ps] of Object.entries(schema.properties ?? {})) {
          if (!ps || typeof ps !== 'object') continue;

          // E. a second exemplar the published pattern admits.
          for (const cand of PATTERN_ADVERSARIAL[ps.pattern] ?? []) {
            if (!new RegExp(ps.pattern).test(cand)) continue;
            if (ps.maxLength !== undefined && [...cand].length > ps.maxLength) continue;
            if (ps.minLength !== undefined && [...cand].length < ps.minLength) continue;
            const rp = await call(fn, { ...base, [pn]: cand }, manifest.service, mod, act);
            if (rp.kind === 'refused') found.add(`E ${where} ${pn} ${JSON.stringify(cand)}`);
          }

          // B. a declared constraint the module does not apply.
          const muts = [];
          if (Array.isArray(ps.enum)) muts.push(['enum', '__not_in_enum__']);
          if (ps.pattern) {
            const re = new RegExp(ps.pattern);
            const badValue = VIOLATION_CANDIDATES.find((c) => !re.test(c));
            if (badValue !== undefined) muts.push(['pattern', badValue]);
          }
          if (ps.maxLength !== undefined) muts.push(['maxLength', 'a'.repeat(ps.maxLength + 1)]);
          if (ps.minLength !== undefined && ps.minLength > 0) muts.push(['minLength', '']);
          if (ps.maximum !== undefined) muts.push(['maximum', ps.maximum + 1]);
          if (ps.minimum !== undefined) muts.push(['minimum', ps.minimum - 1]);
          if (ps.maxItems !== undefined) muts.push(['maxItems', Array.from({ length: ps.maxItems + 1 }, () => sample(ps.items ?? { type: 'string' }))]);
          if (ps.type === 'string') muts.push(['type', 12345]);
          else if (ps.type === 'integer' || ps.type === 'number') muts.push(['type', 'not-a-number']);
          else if (ps.type === 'boolean') muts.push(['type', 'not-a-boolean']);
          else if (ps.type === 'array') muts.push(['type', 'not-an-array']);

          for (const [why, value] of muts) {
            const rr = await call(fn, { ...base, [pn]: value }, manifest.service, mod, act);
            // Only a value that reached the vendor proves the module let it through. A throw
            // is neither enforcement nor acceptance and is recorded as its own thing.
            if (rr.kind === 'reached') found.add(`B ${where} ${pn} ${why}`);
            else if (rr.kind === 'threw') found.add(`G ${where} ${pn} ${why} threw`);
          }
        }
      }
    }
  }
  return { found, errors };
}
