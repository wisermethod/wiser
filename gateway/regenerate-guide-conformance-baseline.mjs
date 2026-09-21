/**
 * Rewrite `gateway/test/guide-conformance-baseline.json` from the current tree.
 *
 * **It lives here and not in `test/` for a reason that cost a run to find**, recorded on the
 * agreement generator beside it: `node --test` executes every file under a `test/` directory,
 * not only those matching a test-file name, so a generator placed beside the test would rewrite
 * the baseline on every suite run and the gate would pass for ever.
 *
 * **It refuses to add a row.** The baseline may only shrink; a run that would introduce a
 * divergence is a run that should be fixing the tree instead, so this exits non-zero and names
 * what appeared. Removing that guard removes the only thing making the gate a ratchet.
 *
 * **It refuses an unreadable or shapeless baseline**, rather than reading one as empty. An empty
 * list makes every divergence new and every new divergence permitted, which is the ratchet
 * inverted at exactly the moment the file is damaged. `{}`, `{"divergences": null}` and a JSON
 * primitive all read as empty under `?? []`, so the shape is checked rather than defaulted.
 *
 *   node gateway/regenerate-guide-conformance-baseline.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { collectDivergences } from './test/guide-conformance-harness.js';

const OUT = fileURLToPath(new URL('./test/guide-conformance-baseline.json', import.meta.url));

export async function main() {
  const { found, errors } = collectDivergences();
  if (errors.length) {
    console.error('the harness could not judge some guides; fix that before regenerating:');
    for (const e of errors) console.error('  ' + e);
    return 2;
  }

  let previous;
  try { previous = JSON.parse(readFileSync(OUT, 'utf8'))?.divergences; }
  catch (err) {
    console.error(`cannot read ${OUT}: ${err.message}`);
    console.error('This file is the ratchet. Restore it from git rather than regenerating over it;');
    console.error('a first baseline is created by writing {"divergences": []} and running this.');
    return 3;
  }
  if (!Array.isArray(previous) || previous.some((d) => typeof d !== 'string')) {
    console.error(`${OUT} has no divergences array of strings. Restore it from git.`);
    console.error('An empty baseline is written as {"divergences": []}, which is a different');
    console.error('thing from a file that does not say.');
    return 3;
  }

  const divergences = [...found].sort();
  const added = divergences.filter((d) => !previous.includes(d));
  if (added.length) {
    console.error(`refusing to write: ${added.length} divergence(s) are not in the current baseline.`);
    console.error('The baseline may only shrink. Correct the guide, or correct');
    console.error('connectors/shared-text.md and propagate it, then regenerate.');
    for (const a of added) console.error('  + ' + a);
    return 1;
  }

  const removed = previous.filter((d) => !divergences.includes(d));
  writeFileSync(OUT, JSON.stringify({
    note: 'Known connector guide divergences from connectors/shared-text.md and the operator-state rule. This file may only shrink. See test/guide-conformance.test.js.',
    // Local date, not UTC. `toISOString()` stamps tomorrow for anyone west of Greenwich
    // running in the evening, and every other date in this workspace is the operator's local
    // one. Caught when a 2026-09-20 run stamped 2026-09-21.
    measured: new Date().toLocaleDateString('en-CA'),
    count: divergences.length,
    divergences,
  }, null, 2) + '\n');
  console.log(`wrote ${divergences.length} divergences to ${OUT}` + (removed.length ? `, ${removed.length} closed` : ''));
  for (const r of removed) console.log('  - ' + r);
  return 0;
}

// Only act when this file is the one invoked. Importing it must not run it and must not end the
// importing process: an `exit` at module scope would stop a test before its assertions ran,
// which is the same silent-success failure the placement above avoids.
if (fileURLToPath(import.meta.url) === argv[1]) exit(await main());
