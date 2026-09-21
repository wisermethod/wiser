/**
 * Connector guide conformance: what it compares, and what it does not.
 *
 * `connectors/shared-text.md` is the source for the text every connector guide carries. This
 * harness holds each guide to it, and holds the sections that carry operator state to the rule
 * that they carry none. `guide-conformance.test.js` is the ratchet over what it finds;
 * `regenerate-guide-conformance-baseline.mjs` writes the baseline.
 *
 * ## Four checks, and each one's boundary
 *
 * **1. `shared-block`.** A connector serving any `catalog` module carries the Revoking block from
 * `shared-text.md` verbatim, with `{VENDOR ROUTE}` replaced by its own sentence. The comparison
 * is byte equality on the whole section after the slot is removed, not a similarity score: the
 * 24 copies measured on 2026-09-20 shared one SHA once the slot was taken out, so anything less
 * exact would be a weaker gate than the tree already supports.
 *
 * **A connector is exempt only when it serves no `catalog` module at all.** The gateway holds no
 * credential on the `local-file` route, so every sentence in the block about what `disconnect`
 * revokes is false there. Written as "exempt if any module is `local-file`" first, and
 * adversarial review broke it: a connector with one `local-file` module and five `catalog` ones
 * would have been exempted whole and could drop its hosted revocation instructions with no
 * finding. `src/manifest.js` does not forbid that mixture. A mixed connector is now its own
 * finding, because one block cannot be true of both halves and somebody has to decide what it
 * should say.
 *
 * **2. `shared-slot`.** A `catalog` connector's slot must be filled, must be its own words, and
 * must not send the reader to a local credential file. Five guides named one on 2026-09-20, in
 * guides whose own text says a local file is not a route here.
 *
 * **3. `operator-state`.** `CONNECTOR.md`'s `## Status` says when the connector shipped and how
 * it was verified. It does not say who connected it, on what machine, through which harness, or
 * which grants are live, because that is one person's session state in a public repository and
 * it is wrong the moment anyone else reads it. `auth.md`'s `## Last connected` takes the same
 * rule; the audit closed that section to `Yes.` or `Not yet.` at `8d7bf8a` and this keeps it shut.
 *
 * **4. `blueprint`.** A guide that mentions a blueprint carries the canonical sentence from
 * `shared-text.md`: one per toolkit, the gateway creates it when a toolkit has none, and a
 * second one makes every module on that toolkit unconnectable. A guide that says "Prepare" one
 * instructs the step that broke `microsoft`, recorded at
 * `playbooks/gates/connector-stack-audit/2026-09-20-cold-connect.md` C3. The sentence lives in
 * the source rather than in this file, so that rewording it is one edit in the place a connector
 * author reads and this gate cannot disagree with the document it enforces.
 *
 * ## What it does not cover, stated so a pass is not read as a proof
 *
 * - **Only two things are sourced**, the Revoking block and the blueprint sentence. The other
 *   shared paragraphs, the hosted-connect numbered steps and the per-module notes, are not in
 *   `shared-text.md` and are therefore unheld. Adding one is adding it there.
 * - **There is no person-name detector, and there cannot be a complete one.** This finds named
 *   harnesses, machine paths, and the sentence shapes that record who decided something. A
 *   shipped line reading "Connected by" a real name passes, and no pattern over prose closes
 *   that. The rule it serves is enforced by review; this narrows what review must catch.
 * - **`operator-state` matches wording, not meaning**, over a marker list stated below so a
 *   reviewer can judge it. A Status section stating a grant in words the list does not carry
 *   passes. The cost runs the other way too: `connected account` in a sentence about what a test
 *   fixture requires is reported, and the answer is to write it another way.
 * - **The ratchet keys on finding strings, so it counts kinds and not occurrences.** A second
 *   ACTIVE added to a Status section that already has one changes nothing, and fixing one of two
 *   occurrences is invisible while the other remains. Inherited from `agreement.test.js` and
 *   accepted for the same reason: a row carrying an occurrence count would churn on every
 *   unrelated edit. It closes as the baseline empties, because a deleted row fires on re-entry.
 * - **A Windows-style path is not detected.** The roots below are POSIX.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONNECTORS = fileURLToPath(new URL('../../connectors', import.meta.url));
const SHARED = join(CONNECTORS, 'shared-text.md');

/** The slot token in the Revoking block. */
const SLOT = '{VENDOR ROUTE}';

/** The heading in `shared-text.md` whose fenced body is one required sentence, not a block. */
const BLUEPRINT_HEADING = '## The blueprint sentence';

/**
 * Markers that make a `## Status` or `## Last connected` section operator state.
 *
 * Stated here rather than inline because this list is the check: a reviewer can only judge
 * whether the gate measures the right thing by reading it. `ACTIVE` and "live connect" are the
 * common form; "connected account" and "the grant holds" are the two that say the same thing
 * without either word and were missed by the sweep that counted 15 where there were 16.
 *
 * `re-verified` carries a date requirement. Bare, it reported "schema validation re-verified
 * against fixtures", which is a statement about a test rather than about a grant.
 */
const GRANT_STATE = [
  [/\bACTIVE\b/, 'states a grant is ACTIVE'],
  [/\blive connect\b/i, 'states a live connect'],
  [/\bconnected account\b/i, 'states a connected account'],
  [/\bthe grant holds\b/i, 'states what a grant holds'],
  [/\bis not connected\b/i, 'states a grant is absent'],
  [/\bno access\b/i, 'states an account lacks access'],
  [/\bre-verified\b[^.]{0,40}\d{4}-\d{2}-\d{2}/i, 'states a dated re-verification of a grant'],
];

/**
 * Sentence shapes that record who decided something, which is session provenance in a shipped
 * file and is the class `github/CONNECTOR.md` carried until `c1cd342`.
 *
 * `operator` has three senses in this tree and only one is the defect. Addressing the reader by
 * role, "have the operator check the key", is what a pitfall is supposed to say. A vendor
 * search-operator token and a comparison operator in a filter grammar are the query sense.
 * Recording who decided, "the operator chose the target alone", is the defect.
 *
 * **The role senses are cut out of the line before the line is tested, rather than excusing it.**
 * Suppressing any line that matched either was the first shape and adversarial review broke it
 * in one sentence: "The operator decided this; have the operator check the key" was silently
 * clean, because the excuse and the defect fit in one line.
 */
const ROLE_SENSE = /have the operator\b[^.;]*|operator tokens?|an operator from the[^.;]*|operator enums?/gi;
const PROVENANCE = /the operator'?s?\b[^.]{0,40}?(chose|decided|asked|approved|brief|instruction|direction|own call)/i;

/** Harness names, matched case-sensitively: `cursor` is a pagination parameter in two manifests. */
const HARNESSES = [/\bGrok\b/, /\bClaude\b/, /\bCursor\b/, /\bCodex\b/, /\bAntigravity\b/];

/**
 * An absolute path rooted in a home or a mounted volume, which is one machine's and nobody
 * else's.
 *
 * **The root names are listed without their leading slash and joined at run time**, so this file
 * does not itself carry the literal string it looks for. That is not obfuscation: the staged-file
 * check this complements greps the staged text for a machine path, and a detector written inline
 * is indistinguishable to it from the defect. Written inline first, and that check refused the
 * commit, which is the check working.
 *
 * The boundary is a negative lookbehind rather than a list of permitted preceding characters.
 * The list missed an assignment and an angle-bracketed link; the lookbehind admits any delimiter
 * and still refuses a longer path that merely ends in one of these names.
 */
const MACHINE_PATH_ROOTS = ['Users', 'Volumes', 'home'];
export const MACHINE_PATH = new RegExp('(?<![\\w.~/])/(?:' + MACHINE_PATH_ROOTS.join('|') + ')/');

const IDENTITY = [...HARNESSES, MACHINE_PATH];

/** Files under a connector directory that ship, and are therefore read for identity. */
const SHIPPED_FILES = ['auth.md', 'CONNECTOR.md', 'index.js', 'manifest.json'];

/** `## Last connected` says one of exactly these. Anything else is a date or a grant. */
const LAST_CONNECTED_ALLOWED = new Set(['Yes.', 'Not yet.']);

/** A local credential route, in the wordings a vendor slot might reach for. */
const LOCAL_FILE_ROUTE = /\blocal file\b|\blocal credential file\b|\bcredential file\b|\bkey file\b/i;

/** Read with line endings normalised, so a CRLF checkout is not 24 spurious divergences. */
function read(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Split text into lines tagged with whether they sit inside a fenced code block.
 *
 * Every structural read below goes through this. A `## ` inside a fence is not a heading, and
 * treating one as a heading truncated a section at an example and hid whatever followed;
 * adversarial review demonstrated grant state surviving behind exactly that.
 */
function taggedLines(text) {
  const out = [];
  let fence = null;
  for (const line of text.split('\n')) {
    const open = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === null) {
      if (open) {
        fence = open[1];
        out.push({ line, inFence: true, fenceEdge: true });
      } else {
        out.push({ line, inFence: false, fenceEdge: false });
      }
      continue;
    }
    const close = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line);
    const closes = Boolean(close) && close[1][0] === fence[0] && close[1].length >= fence.length;
    if (closes) fence = null;
    out.push({ line, inFence: true, fenceEdge: closes });
  }
  return out;
}

/**
 * Read one `## Heading` section's body, ignoring headings inside code fences.
 *
 * Returns `{ body, count }`: the first matching section, and how many sections carry that
 * heading. A second one is reported by the caller rather than silently ignored, because a
 * duplicated heading is a way to put the real content somewhere this never looks.
 */
export function section(text, heading) {
  const tagged = taggedLines(text);
  const starts = tagged
    .map((t, i) => (!t.inFence && t.line.trim() === heading ? i : -1))
    .filter((i) => i !== -1);
  if (starts.length === 0) return { body: null, count: 0 };
  const out = [];
  for (let i = starts[0] + 1; i < tagged.length; i += 1) {
    if (!tagged[i].inFence && /^##? /.test(tagged[i].line)) break;
    out.push(tagged[i].line);
  }
  return { body: out.join('\n').replace(/^\n+|\n+$/g, ''), count: starts.length };
}

/**
 * The shared blocks, read from `connectors/shared-text.md`.
 *
 * A block is the fenced body under its `## ` heading. The heading names the section a guide
 * carries it under, so `## Revoking` here is `## Revoking` there.
 *
 * **Exactly one fence per heading, and a repeated heading is refused.** A second fence under one
 * heading, or an example fence placed before the real one, silently changed which text was
 * canonical; the ambiguity is reported rather than resolved by position.
 */
export function readSharedBlocks(file = SHARED) {
  const tagged = taggedLines(read(file));
  const blocks = new Map();
  const problems = [];

  const heads = tagged
    .map((t, i) => (!t.inFence && /^## /.test(t.line) ? i : -1))
    .filter((i) => i !== -1);

  for (let h = 0; h < heads.length; h += 1) {
    const start = heads[h];
    const end = h + 1 < heads.length ? heads[h + 1] : tagged.length;
    const heading = `## ${tagged[start].line.slice(3).trim()}`;
    const fences = [];
    let open = -1;
    for (let i = start + 1; i < end; i += 1) {
      if (!tagged[i].fenceEdge) continue;
      if (open === -1) open = i;
      else { fences.push([open, i]); open = -1; }
    }
    if (open !== -1) problems.push(`${heading}: a fence is opened and never closed`);
    if (fences.length === 0) continue;
    if (fences.length > 1) {
      problems.push(`${heading}: ${fences.length} fenced blocks, and exactly one is the source`);
      continue;
    }
    if (blocks.has(heading)) {
      problems.push(`${heading}: appears more than once carrying a fenced block`);
      continue;
    }
    const [a, b] = fences[0];
    blocks.set(heading, {
      body: tagged.slice(a + 1, b).map((t) => t.line).join('\n').replace(/\n+$/, ''),
    });
  }
  return { blocks, problems };
}

/** Every connector directory carrying a manifest, with the providers its modules use. */
export function readConnectors(dir = CONNECTORS) {
  const connectors = [];
  const problems = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const here = join(dir, entry.name);
    const manifestPath = join(here, 'manifest.json');
    if (!existsSync(manifestPath)) {
      // A directory carrying guides but no manifest would otherwise drop out of the population
      // silently, taking its defects with it. Reported rather than skipped.
      if (existsSync(join(here, 'auth.md')) || existsSync(join(here, 'CONNECTOR.md'))) {
        problems.push(`${entry.name}: carries a guide but no manifest.json, so it cannot be judged`);
      }
      continue;
    }
    let manifest;
    try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); }
    catch (err) { problems.push(`${entry.name}: manifest.json is not valid JSON: ${err.message}`); continue; }
    const modules = manifest.modules ?? {};
    const entries = Array.isArray(modules)
      ? modules.map((m) => [m.id ?? m.name, m])
      : Object.entries(modules);
    const providers = new Set(entries.map(([, v]) => v?.auth?.provider ?? v?.provider ?? '?'));
    connectors.push({ name: entry.name, dir: here, providers });
  }
  return { connectors, problems };
}

/**
 * Compare every guide against the shared source and the operator-state rule.
 *
 * Returns `{ found, errors }`. A finding is a stable one-line string so a baseline row survives
 * an unrelated edit to the file it names. An error is the harness failing to judge, which is
 * never baselined: it means this file or the source is wrong, not that the tree is clean.
 */
export function collectDivergences({ dir = CONNECTORS, sharedFile = SHARED } = {}) {
  const found = new Set();
  const errors = [];

  let blocks;
  let problems;
  try { ({ blocks, problems } = readSharedBlocks(sharedFile)); }
  catch (err) { return { found, errors: [`cannot read ${sharedFile}: ${err.message}`] }; }
  errors.push(...problems.map((p) => `shared source: ${p}`));

  const revoking = blocks.get('## Revoking');
  if (!revoking) errors.push(`${sharedFile} carries no fenced '## Revoking' block`);
  const blueprint = blocks.get(BLUEPRINT_HEADING);
  if (!blueprint) errors.push(`${sharedFile} carries no fenced '${BLUEPRINT_HEADING}' block`);

  let framePre;
  let framePost;
  if (revoking) {
    const parts = revoking.body.split(SLOT);
    if (parts.length === 1) {
      errors.push(`the '## Revoking' block in ${sharedFile} carries no ${SLOT} slot`);
    } else if (parts.length > 2) {
      errors.push(`the '## Revoking' block in ${sharedFile} carries ${parts.length - 1} ${SLOT} slots, and exactly one is the contract`);
    } else {
      [framePre, framePost] = parts;
    }
  }
  const blueprintSentence = blueprint ? blueprint.body.trim() : null;

  const { connectors, problems: population } = readConnectors(dir);
  errors.push(...population);
  if (connectors.length === 0) errors.push(`no connector with a manifest under ${dir}`);
  if (errors.length) return { found, errors };

  for (const c of connectors) {
    const paths = Object.fromEntries(SHIPPED_FILES.map((f) => [f, join(c.dir, f)]));
    if (!existsSync(paths['auth.md'])) { errors.push(`${c.name}: no auth.md`); continue; }
    if (!existsSync(paths['CONNECTOR.md'])) { errors.push(`${c.name}: no CONNECTOR.md`); continue; }
    const auth = read(paths['auth.md']);
    const conn = read(paths['CONNECTOR.md']);

    // ---- 1 and 2: the shared Revoking block, and its one slot ------------------------
    // Hosted is decided by whether any module is on the catalog route, not by whether none is
    // on local-file. A connector serving both cannot carry one block truthfully, and says so.
    const hosted = c.providers.has('catalog');
    const mixed = hosted && c.providers.has('local-file');
    if (mixed) {
      found.add(`shared-block ${c.name}: serves both catalog and local-file modules, and one Revoking block cannot be true of both`);
    }
    const { body: revoke, count: revokeCount } = section(auth, '## Revoking');
    if (revokeCount > 1) found.add(`shared-block ${c.name}: auth.md has ${revokeCount} '## Revoking' sections`);
    if (revoke === null) {
      found.add(`shared-block ${c.name}: auth.md has no '## Revoking' section`);
    } else if (hosted) {
      const fits = revoke.startsWith(framePre) && revoke.endsWith(framePost)
        && revoke.length >= framePre.length + framePost.length;
      if (!fits) {
        found.add(`shared-block ${c.name}: '## Revoking' diverges from connectors/shared-text.md`);
      } else {
        const slot = revoke.slice(framePre.length, revoke.length - framePost.length).trim();
        if (slot === '') {
          found.add(`shared-slot ${c.name}: the vendor route is empty`);
        } else if (slot.includes(SLOT)) {
          found.add(`shared-slot ${c.name}: the vendor route still carries the unreplaced slot token`);
        } else if (LOCAL_FILE_ROUTE.test(slot)) {
          found.add(`shared-slot ${c.name}: the vendor route names a local credential file, on a hosted connector`);
        }
      }
    } else if (framePre && revoke.startsWith(framePre)) {
      found.add(`shared-block ${c.name}: carries the hosted Revoking block on a local-file connector`);
    }

    // ---- 3: operator state ----------------------------------------------------------
    const { body: status, count: statusCount } = section(conn, '## Status');
    if (statusCount > 1) found.add(`operator-state ${c.name}: CONNECTOR.md has ${statusCount} '## Status' sections`);
    if (status === null) {
      found.add(`operator-state ${c.name}: CONNECTOR.md has no '## Status' section`);
    } else {
      for (const [re, why] of GRANT_STATE) {
        if (re.test(status)) found.add(`operator-state ${c.name}: CONNECTOR.md '## Status' ${why}`);
      }
    }
    const { body: lastConnected, count: lastCount } = section(auth, '## Last connected');
    if (lastCount > 1) found.add(`operator-state ${c.name}: auth.md has ${lastCount} '## Last connected' sections`);
    if (lastConnected === null) {
      found.add(`operator-state ${c.name}: auth.md has no '## Last connected' section`);
    } else if (!LAST_CONNECTED_ALLOWED.has(lastConnected.trim())) {
      found.add(`operator-state ${c.name}: auth.md '## Last connected' says more than Yes. or Not yet.`);
    }

    // Identity anywhere in any shipped file, not only in those two sections. The class
    // github/CONNECTOR.md carried was inside ## Status; the two instances found on 2026-09-20
    // were not, and a sweep of the section that revealed a class misses the rest of it.
    for (const name of SHIPPED_FILES) {
      if (!existsSync(paths[name])) continue;
      read(paths[name]).split('\n').forEach((ln, i) => {
        // The role senses are cut out, not used to excuse the line: one line can carry the
        // legitimate sense and the defect at once, and excusing it lost the defect.
        if (PROVENANCE.test(ln.replace(ROLE_SENSE, ''))) {
          found.add(`operator-state ${c.name}: ${name}:${i + 1} records who decided something`);
        }
        for (const re of IDENTITY) {
          if (re.test(ln)) {
            found.add(`operator-state ${c.name}: ${name}:${i + 1} names a person, machine or harness`);
          }
        }
      });
    }

    // ---- 4: one statement of the blueprint rule -------------------------------------
    // Against the sentence in the source, not a pattern here, so the gate cannot disagree with
    // the document it enforces and a reword is one edit where a connector author will see it.
    if (/blueprint/i.test(auth) && blueprintSentence && !auth.includes(blueprintSentence)) {
      found.add(`blueprint ${c.name}: mentions a blueprint without the sentence in connectors/shared-text.md`);
    }
  }

  return { found, errors };
}
