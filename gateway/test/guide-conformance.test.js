/**
 * Connector guide conformance, asserted for every shipped connector guide.
 *
 * The comparison itself lives in `guide-conformance-harness.js`, with what it does and does not
 * cover. This file is the ratchet, in the shape `agreement.test.js` uses, for the reason that
 * one already proved: a gate that fails on the day it lands gets skipped.
 *
 * ## It is a ratchet, not a pass
 *
 * `guide-conformance-baseline.json` holds the divergences that existed when this was written.
 * It fails on two things and only two:
 *
 *   1. a divergence that is not in the baseline, which is a new one, and
 *   2. a baseline entry that no longer diverges, which is a fix whose row was not deleted.
 *
 * So the baseline can only shrink, every correction deletes its rows in the same commit, and the
 * file going empty is the class closing. **Do not add a row to make this pass.**
 *
 * ## Three controls, because a gate that measures nothing passes quietly
 *
 * The last three tests here are not conformance checks. Two introduce a divergence into a copy
 * of the tree and assert the harness reports it, then remove it and assert the report is clean.
 * The third exercises the one pattern in the harness that is assembled at run time rather than
 * written as a literal. Without them a harness that returned an empty set for any reason, a bad
 * path, an unreadable source, a regex that matches nothing, would read as a family in perfect
 * order. That failure shipped in this repo once and was caught in review rather than by a test.
 */
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectDivergences, readSharedBlocks, section, MACHINE_PATH } from './guide-conformance-harness.js';

const BASELINE = JSON.parse(readFileSync(new URL('./guide-conformance-baseline.json', import.meta.url), 'utf8'));
const CONNECTORS = fileURLToPath(new URL('../../connectors', import.meta.url));

test('every connector guide matches the shared source, and no shipped guide carries operator state', () => {
  const { found, errors } = collectDivergences();

  assert.deepEqual(errors, [], 'the harness could not judge some guides; fix the harness, do not baseline them');

  const baseline = new Set(BASELINE.divergences);
  const added = [...found].filter((d) => !baseline.has(d)).sort();
  const fixed = [...baseline].filter((d) => !found.has(d)).sort();

  assert.deepEqual(added, [],
    'new connector guide divergences. Correct the guide, or correct connectors/shared-text.md and propagate. Do not add these to guide-conformance-baseline.json.');

  assert.deepEqual(fixed, [],
    'these divergences are fixed. Delete their rows from guide-conformance-baseline.json in the same commit; the baseline only ever shrinks.');
});

test('the shared source is readable and carries its slot', () => {
  const blocks = readSharedBlocks();
  const revoking = blocks.get('## Revoking');
  assert.ok(revoking, 'connectors/shared-text.md carries a fenced ## Revoking block');
  assert.ok(revoking.body.includes('{VENDOR ROUTE}'),
    'the ## Revoking block carries its {VENDOR ROUTE} slot; without it every guide would have to be byte-identical including its vendor sentence');
  assert.ok(!/[–—]/.test(revoking.body),
    'the shared block carries no en or em dash, per standards/conventions.md; it propagates to every guide that carries it');
});

/**
 * Control, positive direction: a divergence introduced into a copy of the tree is reported.
 *
 * A copy rather than the real tree, so a crashed assertion cannot leave a guide edited. The
 * mutation is one word inside the shared block, which is the smallest thing this gate exists to
 * catch and the one a careless propagation would produce.
 */
test('control: the harness reports a divergence introduced into a guide', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'guide-conformance-'));
  try {
    cpSync(CONNECTORS, join(tmp, 'connectors'), { recursive: true });
    const dir = join(tmp, 'connectors');
    const shared = join(dir, 'shared-text.md');
    const victim = join(dir, 'bing', 'auth.md');

    const before = collectDivergences({ dir, sharedFile: shared });
    assert.deepEqual(before.errors, [], 'the copied tree is judgeable');
    assert.ok(![...before.found].some((f) => f.startsWith('shared-block bing')),
      'bing conforms before the mutation, so the mutation is what the next assertion measures');

    const text = readFileSync(victim, 'utf8');
    const mutated = text.replace('It ends every module bound to that credential',
      'It ends the module bound to that credential');
    assert.notEqual(mutated, text, 'the mutation changed something; a no-op mutation proves nothing');
    writeFileSync(victim, mutated);

    const after = collectDivergences({ dir, sharedFile: shared });
    assert.ok([...after.found].some((f) => f.startsWith('shared-block bing')),
      'one changed word inside the shared block is reported');

    writeFileSync(victim, text);
    const restored = collectDivergences({ dir, sharedFile: shared });
    assert.ok(![...restored.found].some((f) => f.startsWith('shared-block bing')),
      'removing the divergence clears the finding, so the gate tracks the tree rather than latching');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

/**
 * Control, the other direction: operator state added to a clean Status section is reported.
 *
 * `clarity` is the connector whose Status section the Playbook names as the model form, so it is
 * the one whose cleanliness a regression would break first.
 */
test('control: the harness reports operator state added to a clean Status section', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'guide-conformance-'));
  try {
    cpSync(CONNECTORS, join(tmp, 'connectors'), { recursive: true });
    const dir = join(tmp, 'connectors');
    const shared = join(dir, 'shared-text.md');
    const victim = join(dir, 'clarity', 'CONNECTOR.md');

    const text = readFileSync(victim, 'utf8');
    assert.ok(!/\bACTIVE\b/.test(section(text, '## Status') ?? ''),
      'clarity states no grant before the mutation');
    const before = collectDivergences({ dir, sharedFile: shared });
    assert.ok(![...before.found].some((f) => f.startsWith('operator-state clarity')),
      'clarity is clean before the mutation');

    writeFileSync(victim, text.replace('## Status\n',
      '## Status\n\nLive connect 2026-09-08: `analytics` ACTIVE.\n'));
    const after = collectDivergences({ dir, sharedFile: shared });
    assert.ok([...after.found].some((f) => f.startsWith('operator-state clarity')),
      'a grant state added to a clean Status section is reported');

    writeFileSync(victim, text);
    const restored = collectDivergences({ dir, sharedFile: shared });
    assert.ok(![...restored.found].some((f) => f.startsWith('operator-state clarity')),
      'removing it clears the finding');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

/**
 * Control for the machine-path detector, which is built by joining strings rather than written
 * as a literal, so that this file does not carry the text it looks for. A regex assembled that
 * way is easy to get subtly wrong and impossible to read at a glance, and a wrong one would
 * report nothing for ever. Both directions are asserted: a path under a home or a mounted volume
 * fires, and the relative and `~` paths that legitimately appear in setup text do not.
 */
test('control: the machine-path detector fires on a machine path and not on a portable one', () => {
  const home = '/' + 'Users' + '/someone/secrets.env';
  const volume = '/' + 'Volumes' + '/DISK/WISER Plugins/wiser';
  for (const s of [home, volume, `bound at ${home}`, `see (${volume})`, '`' + home + '`']) {
    assert.ok(MACHINE_PATH.test(s), `fires on ${s}`);
  }
  for (const s of [
    '../../gateway/SETUP.md',
    '~/Library/Application Support/wiser/auth-provider.env',
    '$XDG_CONFIG_HOME/wiser/auth-provider.env',
    'the /v1/models endpoint',
    'POST /users/me',
  ]) {
    assert.ok(!MACHINE_PATH.test(s), `quiet on ${s}`);
  }
});
