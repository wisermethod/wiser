/**
 * Manifest-to-module agreement, asserted for every shipped connector action.
 *
 * The comparison itself lives in `agreement-harness.js`, with what it does and does not cover.
 * This file is the ratchet.
 *
 * ## It is a ratchet, not a pass
 *
 * The family has a backlog. A gate that fails on the day it lands gets skipped, so this one
 * ships with `agreement-baseline.json`, the divergences that existed when it was written. It
 * fails on two things and only two:
 *
 *   1. a divergence that is not in the baseline, which is a new one, and
 *   2. a baseline entry that no longer diverges, which is a fix whose row was not deleted.
 *
 * So the baseline can only shrink, every correction deletes its rows in the same commit, and
 * the file going empty is the class closing. **Do not add a row to make this pass.**
 */
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectDivergences } from './agreement-harness.js';

const BASELINE = JSON.parse(readFileSync(new URL('./agreement-baseline.json', import.meta.url), 'utf8'));

test('every connector action agrees with its own published schema, in both directions', async () => {
  const { found, errors } = await collectDivergences();

  assert.deepEqual(errors, [], 'the harness could not judge some actions; fix the harness, do not baseline them');

  const baseline = new Set(BASELINE.divergences);
  const added = [...found].filter((d) => !baseline.has(d)).sort();
  const fixed = [...baseline].filter((d) => !found.has(d)).sort();

  assert.deepEqual(added, [],
    'new manifest-to-module divergences. Publish what the module enforces, or enforce what the manifest publishes. Do not add these to agreement-baseline.json.');

  assert.deepEqual(fixed, [],
    'these divergences are fixed. Delete their rows from agreement-baseline.json in the same commit; the baseline only ever shrinks.');
});
