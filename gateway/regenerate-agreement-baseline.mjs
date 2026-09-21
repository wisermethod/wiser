/**
 * Rewrite `gateway/test/agreement-baseline.json` from the current tree.
 *
 * **It lives here and not in `test/` for a reason that cost a run to find.** `node --test`
 * executes every file under a `test/` directory, not only those matching a test-file name,
 * so a generator placed beside the test would rewrite the baseline on every suite run and
 * the gate would pass for ever.
 *
 * **It refuses to add a row.** The baseline may only shrink; a run that would introduce a
 * divergence is a run that should be fixing the tree instead, so this exits non-zero and
 * names what appeared. Removing that guard removes the only thing making the gate a ratchet.
 *
 *   node gateway/regenerate-agreement-baseline.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { collectDivergences } from './test/agreement-harness.js';

const OUT = fileURLToPath(new URL('./test/agreement-baseline.json', import.meta.url));

export async function main() {
  const { found, errors } = await collectDivergences();
  if (errors.length) {
    console.error('the harness could not judge some actions; fix that before regenerating:');
    for (const e of errors) console.error('  ' + e);
    return 2;
  }

  // **A missing or malformed baseline is a refusal, not a bootstrap.** Reading one as an
  // empty list makes every divergence new and every new divergence permitted, which is the
  // ratchet inverted: it would bless a regression at exactly the moment the file is
  // unreadable. The same is true of a legitimately empty baseline, which is the class
  // closed and the strongest state the file can be in. Found by adversarial review
  // 2026-09-20, after the file reached one row and the next stop was zero.
  // `?? []` was not enough: `{}`, `{"divergences": null}` and a JSON primitive all read as
  // an empty baseline, which is the bootstrap permission this guard exists to withhold. The
  // shape is checked rather than defaulted. Round two of adversarial review, 2026-09-20.
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
    console.error('The baseline may only shrink. Publish what the module enforces, or enforce what');
    console.error('the manifest publishes, then regenerate.');
    for (const a of added) console.error('  + ' + a);
    return 1;
  }

  const removed = previous.filter((d) => !divergences.includes(d));
  writeFileSync(OUT, JSON.stringify({
    note: 'Known manifest-to-module divergences. This file may only shrink. See test/agreement.test.js.',
    measured: new Date().toISOString().slice(0, 10),
    count: divergences.length,
    divergences,
  }, null, 2) + '\n');
  console.log(`wrote ${divergences.length} divergences to ${OUT}` + (removed.length ? `, ${removed.length} closed` : ''));
  for (const r of removed) console.log('  - ' + r);
  return 0;
}

// Only act when this file is the one invoked. Importing it must not run it and must not
// end the importing process: an `exit` at module scope would stop a test before its
// assertions ran, which is the same silent-success failure the placement above avoids.
if (fileURLToPath(import.meta.url) === argv[1]) exit(await main());
