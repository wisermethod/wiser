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
 *
 * Three more, each named rather than left to be discovered:
 *
 * - **A `oneOf` or `anyOf` whose branches narrow a field the top level requires.**
 *   `bing research_keywords` is the one shipped instance. Its conditional requirement is
 *   published and the sampler reads it, so direction A covers it; the composition
 *   mutation skips it, because deleting the branch fields would delete a required field
 *   and measure something else. **Half of that action's rule is unpublishable in this
 *   vocabulary**: `report: related` refuses both dates, and nothing the gateway or this
 *   harness reads says a branch forbids a field. It is in the action's `description` and
 *   in `bing/CONNECTOR.md`, and publishing it as a `not` that neither side models would be
 *   a rule with no enforcer, which is the class this gate exists for.
 * - **The URL patterns are wider than their modules by design.** `^[Hh][Tt][Tt][Pp][Ss]?://`
 *   publishes the scheme, which is the part a schema can carry; the module parses the
 *   value with `new URL()`. A value the pattern admits and the parser rejects is a
 *   residual no schema change can close, so no adversarial exemplar probes for it.
 * - **`vercel deployments.upload_file` requires `path` to name a readable file.** That is
 *   filesystem state. Its baseline row and its fixture are permanent.
 *
 * And one that changed shape when the validator moved into the gateway, stated because a
 * reader could otherwise take direction B for more than it is. **For a constraint the gateway
 * itself reads, `type`, `enum`, `pattern`, `minLength` and `items`, the enforcement this proves
 * is the system's rather than the module's**: the wrapper refuses the mutation before the
 * module runs, so a module that quietly stopped applying one of those would not be reported.
 * That is the right property to hold, since the gateway is now the enforcer and no connector
 * carries a validator. What direction B still measures against the module alone is the
 * constraints the gateway leaves to it: `maxLength`, `minimum`, `maximum` and `maxItems`.
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
  '^operations/(?!\\.{1,2}$)[^/]+$': 'operations/abc123',
  '^[^/]+$': 'abc123',
  '^[A-Za-z0-9+/_-]+={0,2}$': 'abcd',
  '^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$': 'audit-key',
  '^[Hh][Tt][Tt][Pp][Ss]://': 'https://example.com/x',
  // `bing`, `google` and `google-apis` parse a URL with `new URL()` and check the
  // protocol, which no regular expression expresses. What they publish is the scheme,
  // which is the part a schema can carry, and each module goes on enforcing
  // parseability itself. **So these two patterns are wider than their modules by
  // design**, and a value like `https://` satisfies the pattern and is still refused.
  // That residual is named here rather than probed: an adversarial exemplar for it
  // would report a divergence that no schema change can close.
  //
  // **The two leading classes are different on purpose and neither is `\s`.** An anchored
  // scheme pattern refused ` https://example.com `, which every one of these modules
  // accepts, so the published rule was *narrower* than its module while the comment above
  // claimed only the opposite. The first correction used `\s*` and was still wrong in both
  // directions, which is why the classes are now exact and were measured rather than
  // reasoned. `new URL()` strips exactly U+0000 to U+0020, all 33 of them, so a leading NUL
  // is accepted and a leading NBSP is not. `String.prototype.trim`, which `google`'s
  // `isDomainProperty` calls, strips exactly the 25 code points `\s` matches, NBSP among
  // them. So the `sc-domain` branch takes `\s*` and the scheme branch takes the C0 range.
  // Both rounds found by adversarial review 2026-09-20.
  '^[\\u0000-\\u0020]*[Hh][Tt][Tt][Pp][Ss]?://': 'https://example.com/x',
  '^([\\u0000-\\u0020]*[Hh][Tt][Tt][Pp][Ss]?://|\\s*[Ss][Cc]-[Dd][Oo][Mm][Aa][Ii][Nn]:)': 'https://example.com/x',
};
const PATTERN_ADVERSARIAL = {
  // The tightened pattern excludes exactly the two relative segments
  // `google-cloud/index.js` refuses, so these two probe the boundary from the other
  // side: both satisfy the pattern, both are accepted, and a tightening that overshot
  // would show up here as a divergence rather than as a pass.
  '^operations/(?!\\.{1,2}$)[^/]+$': ['operations/...', 'operations/.x'],
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
    for (const b of take) for (const r of b?.required ?? []) extra.push([r, b?.properties?.[r]]);
  }
  return extra;
}

function validInstance(schema) {
  const out = {};
  const props = schema.properties ?? {};
  for (const r of schema.required ?? []) out[r] = sample(props[r] ?? { type: 'string' });
  // A branch may narrow a field the top level also declares, and the branch's own
  // declaration is the one to sample from. `bing research_keywords` requires its two
  // dates only when `report` is `impressions` or `history`; sampling `report` from the
  // top-level enum can produce `related`, which is the value that forbids them.
  for (const [r, branchSchema] of requiredFromComposition(schema)) {
    const declared = props[r] ?? { type: 'string' };
    out[r] = sample(branchSchema ? { ...declared, ...branchSchema } : declared);
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

/**
 * Whether one branch of a `oneOf` or `anyOf` accepts this instance.
 *
 * **It reads the branch's declared properties, not only its `required`.** A branch may
 * narrow a field the top level also declares: `bing research_keywords` requires the two
 * dates only when `report` is `impressions` or `history`, and names those values in the
 * branch. Counting `required` alone made both branches of that schema look satisfied and
 * reported the action as failing its own schema.
 */
function branchSatisfied(branch, instance) {
  if (!branch || typeof branch !== 'object') return false;
  for (const r of branch.required ?? []) if (!Object.hasOwn(instance, r)) return false;
  for (const [name, d] of Object.entries(branch.properties ?? {})) {
    if (!Object.hasOwn(instance, name)) continue;
    if (propertyViolation(name, d, instance[name])) return false;
  }
  return true;
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
    const satisfied = branches.filter((b) => branchSatisfied(b, instance));
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
    const bad = propertyViolation(name, d, value);
    if (bad) return bad;
  }
  return null;
}

/**
 * One declared property checked against its own declaration. Split out of
 * `schemaViolation` so a `oneOf` branch is judged by the same rules as the top level.
 */
function propertyViolation(name, d, value) {
  {
    if (!d || typeof d !== 'object') return null;
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
    if (field !== null) return { status: 'invalid_arguments', field };
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

        // B, composition. `oneOf` and `anyOf` are how this family publishes a
        // conditional requirement, and until 2026-09-20 nothing measured whether the
        // module applied one. `src/input-schema.js` deliberately does not read
        // composition, so the module is the enforcer and this is what proves it: supply
        // none of the fields the branches choose between, and for `oneOf` supply all of
        // them, and the module must refuse both.
        //
        // **Only the shape where the branches choose between fields the top level does
        // not require.** `bing research_keywords` narrows `report`, which the top level
        // requires, so "none of them" would delete a required field and measure the
        // wrong thing. It is skipped rather than measured wrongly, and is named in the
        // coverage list at the head of this file.
        for (const key of ['oneOf', 'anyOf']) {
          const branches = schema[key];
          if (!Array.isArray(branches) || branches.length < 2) continue;
          const named = [...new Set(branches.flatMap((b) => b?.required ?? []))];
          const topLevel = new Set(schema.required ?? []);
          if (!named.length || named.some((f) => topLevel.has(f))) continue;

          const without = { ...base };
          for (const f of named) delete without[f];
          const rn = await call(fn, without, manifest.service, mod, act);
          if (rn.kind === 'reached') found.add(`B ${where} ${key} none-of-the-branch-fields`);
          else if (rn.kind === 'threw') found.add(`G ${where} ${key} none-of-the-branch-fields threw`);

          if (key !== 'oneOf') continue;
          const withAll = { ...base };
          for (const f of named) withAll[f] = sample(schema.properties?.[f] ?? { type: 'string' });
          const ra = await call(fn, withAll, manifest.service, mod, act);
          if (ra.kind === 'reached') found.add(`B ${where} oneOf every-branch-field`);
          else if (ra.kind === 'threw') found.add(`G ${where} oneOf every-branch-field threw`);
        }

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
          // An out-of-enum value **of the declared type**. A string against an integer
          // enum is answered by the type check, so the probe proved type enforcement and
          // said nothing about the enum; `clarity numOfDays` and `google-cloud
          // requested_policy_version` are the two shipped integer enums it was silent on.
          // Found by adversarial review 2026-09-20.
          if (Array.isArray(ps.enum) && ps.enum.length) {
            const kind = ps.type ?? typeof ps.enum[0];
            if (kind === 'integer' || kind === 'number') {
              const numeric = ps.enum.filter((v) => typeof v === 'number');
              muts.push(['enum', (numeric.length ? Math.max(...numeric) : 0) + 1]);
            } else if (kind === 'boolean') {
              const missing = [true, false].find((v) => !ps.enum.includes(v));
              if (missing !== undefined) muts.push(['enum', missing]);
            } else {
              muts.push(['enum', '__not_in_enum__']);
            }
          }
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
