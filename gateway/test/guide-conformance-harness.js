/**
 * Connector guide conformance: what it compares, and what it does not.
 *
 * `connectors/shared-text.md` is the source for the text every connector guide carries. This
 * harness holds each guide to it, and holds the two document sections that carry operator state
 * to the rule that they carry none. `guide-conformance.test.js` is the ratchet over what it
 * finds; `regenerate-guide-conformance-baseline.mjs` writes the baseline.
 *
 * ## Four checks, and each one's boundary
 *
 * **1. `shared-block`.** A connector on the `catalog` provider carries the Revoking block from
 * `shared-text.md` verbatim, with `{VENDOR ROUTE}` replaced by its own sentence. The comparison
 * is byte equality on the whole section after the slot is removed, not a similarity score: the
 * 24 copies measured on 2026-09-20 shared one SHA once the slot was taken out, so anything less
 * exact would be a weaker gate than the tree already supports.
 *
 * **`local-file` connectors are exempt, and the exemption is derived from the manifest rather
 * than listed.** The gateway holds no credential for them, so every sentence in the block about
 * what `disconnect` revokes is false of them. An exemption list would have to be maintained;
 * `manifest.json` already says which provider a module uses, and a new `local-file` connector is
 * exempt the day it ships without anyone remembering to add it.
 *
 * **2. `shared-slot`.** A `catalog` connector's slot must not mention a local credential file.
 * Five guides did on 2026-09-20, in guides whose own text says a local file is not a route here.
 * This is the one content rule on the slot, and it is here rather than in the block because the
 * block is what every guide shares and the slot is what each guide owns.
 *
 * **3. `operator-state`.** `CONNECTOR.md`'s `## Status` says when the connector shipped and how
 * it was verified. It does not say who connected it, on what machine, through which harness, or
 * which grants are live, because that is one person's session state in a public repository and
 * it is wrong the moment anyone else reads it. `auth.md`'s `## Last connected` takes the same
 * rule; the audit closed that section to `Yes.` or `Not yet.` at `8d7bf8a` and this keeps it shut.
 *
 * **4. `blueprint`.** A guide that mentions a blueprint states the rule the same way: one per
 * toolkit, the gateway creates it when a toolkit has none, and a second one on a toolkit makes
 * every module on it unconnectable. A guide that says "Prepare" one instructs the step that broke
 * `microsoft`, recorded at
 * `playbooks/gates/connector-stack-audit/2026-09-20-cold-connect.md` C3.
 *
 * ## What it does not cover, stated so a pass is not read as a proof
 *
 * - **Only the Revoking block is sourced.** The other shared paragraphs in these guides, the
 *   hosted-connect numbered steps and the per-module notes, are not in `shared-text.md` yet and
 *   are therefore unheld. Adding a block is adding it there and adding its heading below.
 * - **The slot's content is checked for one thing.** That it does not name a local file. Whether
 *   it names the right dashboard for that vendor is not checkable here and is not checked.
 * - **`operator-state` matches wording, not meaning.** It reads a fixed marker list. A Status
 *   section that states a grant in words the list does not carry passes, which is the ordinary
 *   limit of a pattern over prose and the reason the list is stated here rather than buried.
 * - **A harness name is matched case-sensitively.** `cursor` is a pagination parameter in two
 *   manifests and Cursor is a harness; a case-insensitive match reported both and was wrong twice.
 * - **A machine path is matched by its root directory only.** A path under a home or a mounted
 *   volume is one machine's; a relative path and a `~` path in setup text are not and must pass.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONNECTORS = fileURLToPath(new URL('../../connectors', import.meta.url));
const SHARED = join(CONNECTORS, 'shared-text.md');

/** The slot token in a shared block. One per block for now; the shape allows more. */
const SLOT = '{VENDOR ROUTE}';

/**
 * Markers that make a `## Status` or `## Last connected` section operator state.
 *
 * Stated here rather than inline because this list is the check: a reviewer can only judge
 * whether the gate measures the right thing by reading it. `ACTIVE` and "live connect" are the
 * common form; "connected account" and "the grant holds" are the two that say the same thing
 * without either word and were missed by the sweep that counted 15 where there were 16.
 */
const GRANT_STATE = [
  [/\bACTIVE\b/, 'states a grant is ACTIVE'],
  [/\blive connect\b/i, 'states a live connect'],
  [/\bconnected account\b/i, 'states a connected account'],
  [/\bthe grant holds\b/i, 'states what a grant holds'],
  [/\bis not connected\b/i, 'states a grant is absent'],
  [/\bno access\b/i, 'states an account lacks access'],
  [/\bre-verified\b/i, 'states a re-verification of a grant'],
];

/**
 * Words that name a person, a machine or a harness.
 *
 * `operator` is the hard one and it has three senses in this tree. Addressing the reader by role,
 * "have the operator check the key", is what a pitfall is supposed to say. A vendor search-operator
 * token and a comparison operator in a filter grammar are the query sense. Recording who decided
 * something, "the operator chose the target alone", is session provenance and is the defect. The
 * first two are subtracted before the third is reported, and getting that wrong in either
 * direction is the difference between a gate and a nuisance.
 */
const ROLE_SENSE = /have the operator\b|operator token|an operator from the|operator enum/i;
const PROVENANCE = /the operator'?s?\b[^.]{0,40}?(chose|decided|asked|approved|brief|instruction|direction|own call)/i;
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
 */
const MACHINE_PATH_ROOTS = ['Users', 'Volumes', 'home'];
export const MACHINE_PATH = new RegExp('(?:^|[\\s(`"\'])/(?:' + MACHINE_PATH_ROOTS.join('|') + ')/');
const IDENTITY = [...HARNESSES, MACHINE_PATH];

/** `## Last connected` says one of exactly these. Anything else is a date or a grant. */
const LAST_CONNECTED_ALLOWED = new Set(['Yes.', 'Not yet.']);

/** A guide mentioning a blueprint must carry this, which is the rule the cold connect established. */
const BLUEPRINT_RULE = /the gateway creates the blueprint on the first connect that finds none/i;

/** Read one `## Heading` section's body, or null when the heading is absent. */
export function section(text, heading) {
  const out = [];
  let inside = false;
  for (const ln of text.split('\n')) {
    if (ln.trim() === heading) { inside = true; continue; }
    if (inside && ln.startsWith('## ')) break;
    if (inside) out.push(ln);
  }
  return inside ? out.join('\n').replace(/^\n+|\n+$/g, '') : null;
}

/**
 * The shared blocks, read from `connectors/shared-text.md`.
 *
 * A block is the fenced body under its `## ` heading. The heading names the section a guide
 * carries it under, so `## Revoking` here is `## Revoking` there, and adding a block needs no
 * change to this file.
 */
export function readSharedBlocks(file = SHARED) {
  const text = readFileSync(file, 'utf8');
  const blocks = new Map();
  // Split on `## ` headings first and look for a fence inside each one. A single regex spanning
  // from a heading to a fence walks past any heading between them, so the first fenced block in
  // the file gets attributed to the first heading in the file. It read `## Revoking`'s block as
  // `## How a block is used`'s, and the harness then reported no Revoking block at all.
  const parts = text.split(/^## /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    if (nl === -1) continue;
    const heading = part.slice(0, nl).trim();
    const rest = part.slice(nl + 1);
    const fence = /^```[^\n]*\n([\s\S]*?)^```[ \t]*$/m.exec(rest);
    if (!fence) continue;
    blocks.set(`## ${heading}`, {
      prose: rest.slice(0, fence.index),
      body: fence[1].replace(/\n+$/, ''),
    });
  }
  return blocks;
}

/** Every connector directory carrying a manifest, with the providers its modules use. */
export function readConnectors(dir = CONNECTORS) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const here = join(dir, entry.name);
    const manifestPath = join(here, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const modules = manifest.modules ?? {};
    const entries = Array.isArray(modules)
      ? modules.map((m) => [m.id ?? m.name, m])
      : Object.entries(modules);
    const providers = new Set(entries.map(([, v]) => v?.auth?.provider ?? v?.provider ?? '?'));
    out.push({ name: entry.name, dir: here, providers });
  }
  return out;
}

/**
 * Compare every guide against the shared source and the operator-state rule.
 *
 * Returns `{ found, errors }`. A finding is a stable one-line string so a baseline row survives
 * an unrelated edit to the file it names. An error is the harness failing to judge, which is
 * never baselined: it means this file is wrong, not the tree.
 */
export function collectDivergences({ dir = CONNECTORS, sharedFile = SHARED } = {}) {
  const found = new Set();
  const errors = [];

  let blocks;
  try {
    blocks = readSharedBlocks(sharedFile);
  } catch (err) {
    return { found, errors: [`cannot read ${sharedFile}: ${err.message}`] };
  }
  const revoking = blocks.get('## Revoking');
  if (!revoking) {
    return { found, errors: [`${sharedFile} carries no fenced '## Revoking' block`] };
  }
  if (!revoking.body.includes(SLOT)) {
    return { found, errors: [`the '## Revoking' block in ${sharedFile} carries no ${SLOT} slot`] };
  }
  const [framePre, framePost] = revoking.body.split(SLOT);

  const connectors = readConnectors(dir);
  if (connectors.length === 0) {
    return { found, errors: [`no connector with a manifest under ${dir}`] };
  }

  for (const c of connectors) {
    const authPath = join(c.dir, 'auth.md');
    const connPath = join(c.dir, 'CONNECTOR.md');
    if (!existsSync(authPath)) { errors.push(`${c.name}: no auth.md`); continue; }
    if (!existsSync(connPath)) { errors.push(`${c.name}: no CONNECTOR.md`); continue; }
    const auth = readFileSync(authPath, 'utf8');
    const conn = readFileSync(connPath, 'utf8');

    // ---- 1 and 2: the shared Revoking block, and its one slot ------------------------
    // The gateway holds no credential on the local-file route, so the block's every sentence
    // about what disconnect revokes is false there. Derived from the manifest, not a list.
    const hosted = !c.providers.has('local-file');
    const revoke = section(auth, '## Revoking');
    if (revoke === null) {
      found.add(`shared-block ${c.name}: auth.md has no '## Revoking' section`);
    } else if (hosted) {
      if (!revoke.startsWith(framePre) || !revoke.endsWith(framePost)) {
        found.add(`shared-block ${c.name}: '## Revoking' diverges from connectors/shared-text.md`);
      } else {
        const slot = revoke.slice(framePre.length, revoke.length - framePost.length);
        if (/\blocal file\b|\blocal credential file\b/i.test(slot)) {
          found.add(`shared-slot ${c.name}: the vendor route names a local credential file, on a hosted-only connector`);
        }
      }
    } else if (revoke.startsWith(framePre)) {
      found.add(`shared-block ${c.name}: carries the hosted Revoking block on a local-file connector`);
    }

    // ---- 3: operator state, in the two sections that carry it -----------------------
    const status = section(conn, '## Status');
    if (status === null) {
      found.add(`operator-state ${c.name}: CONNECTOR.md has no '## Status' section`);
    } else {
      for (const [re, why] of GRANT_STATE) {
        if (re.test(status)) found.add(`operator-state ${c.name}: CONNECTOR.md '## Status' ${why}`);
      }
    }
    const lastConnected = section(auth, '## Last connected');
    if (lastConnected === null) {
      found.add(`operator-state ${c.name}: auth.md has no '## Last connected' section`);
    } else if (!LAST_CONNECTED_ALLOWED.has(lastConnected.trim())) {
      found.add(`operator-state ${c.name}: auth.md '## Last connected' says more than Yes. or Not yet.`);
    }

    // Identity anywhere in either shipped file, not only in those two sections. The class
    // github/CONNECTOR.md carried was inside ## Status; the two instances found on 2026-09-20
    // were not, and a sweep of the section that revealed a class misses the rest of it.
    for (const [file, text] of [['auth.md', auth], ['CONNECTOR.md', conn]]) {
      text.split('\n').forEach((ln, i) => {
        if (PROVENANCE.test(ln) && !ROLE_SENSE.test(ln)) {
          found.add(`operator-state ${c.name}: ${file}:${i + 1} records who decided something`);
        }
        for (const re of IDENTITY) {
          if (re.test(ln)) {
            found.add(`operator-state ${c.name}: ${file}:${i + 1} names a person, machine or harness`);
          }
        }
      });
    }

    // ---- 4: one statement of the blueprint rule -------------------------------------
    if (/blueprint/i.test(auth) && !BLUEPRINT_RULE.test(auth)) {
      found.add(`blueprint ${c.name}: mentions a blueprint without stating that the gateway creates it`);
    }
  }

  return { found, errors };
}
