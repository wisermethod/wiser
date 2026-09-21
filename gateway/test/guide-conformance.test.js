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
 * ## The controls are most of this file, and that is deliberate
 *
 * A conformance test whose harness silently returns nothing reads as a family in perfect order.
 * That failure shipped in this repo once and was caught in review rather than by a test. So
 * every check the harness makes has a control that plants the defect in a copy of the tree and
 * asserts it is reported, and, where a false positive would be the expensive failure, a negative
 * control asserting the legitimate form is not.
 *
 * **Most of these encode a counterexample from the adversarial review of 2026-09-20**, which
 * found ten ways the first version of this gate could pass over a defective tree. Each is named
 * at its own test. They are here rather than in a run log because a counterexample that is not
 * executed is a claim rather than a guarantee.
 */
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync, unlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectDivergences, readSharedBlocks, section, MACHINE_PATH } from './guide-conformance-harness.js';

const BASELINE = JSON.parse(readFileSync(new URL('./guide-conformance-baseline.json', import.meta.url), 'utf8'));
const CONNECTORS = fileURLToPath(new URL('../../connectors', import.meta.url));

/** Run the harness over a throwaway copy of the tree, so no control can edit the real one. */
function withTree(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'guide-conformance-'));
  try {
    cpSync(CONNECTORS, join(tmp, 'connectors'), { recursive: true });
    const dir = join(tmp, 'connectors');
    return fn(dir, () => collectDivergences({ dir, sharedFile: join(dir, 'shared-text.md') }));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const edit = (f, fn) => writeFileSync(f, fn(readFileSync(f, 'utf8')));
const has = (found, prefix) => [...found].some((x) => x.startsWith(prefix));
const hasText = (found, text) => [...found].some((x) => x.includes(text));

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

test('the shared source is readable, unambiguous, and carries its slot', () => {
  const { blocks, problems } = readSharedBlocks();
  assert.deepEqual(problems, [], 'the shared source has exactly one fenced block per heading');

  const revoking = blocks.get('## Revoking');
  assert.ok(revoking, 'connectors/shared-text.md carries a fenced ## Revoking block');
  assert.equal(revoking.body.split('{VENDOR ROUTE}').length - 1, 1,
    'the ## Revoking block carries exactly one {VENDOR ROUTE} slot');

  const blueprint = blocks.get('## The blueprint sentence');
  assert.ok(blueprint, 'connectors/shared-text.md carries a fenced blueprint sentence');

  for (const [name, b] of [['Revoking', revoking], ['blueprint sentence', blueprint]]) {
    assert.ok(!/[–—]/.test(b.body),
      `the ${name} block carries no en or em dash, per standards/conventions.md; it propagates to every guide that carries it`);
  }
});

test('control: a word changed inside a guide shared block is reported, and clears when restored', () => {
  withTree((dir, run) => {
    const victim = join(dir, 'bing', 'auth.md');
    const before = run();
    assert.deepEqual(before.errors, [], 'the copied tree is judgeable');
    assert.ok(!has(before.found, 'shared-block bing'),
      'bing conforms before the mutation, so the mutation is what the next assertion measures');

    const original = readFileSync(victim, 'utf8');
    const mutated = original.replace('It ends every module bound to that credential',
      'It ends the module bound to that credential');
    assert.notEqual(mutated, original, 'the mutation changed something; a no-op mutation proves nothing');
    writeFileSync(victim, mutated);
    assert.ok(has(run().found, 'shared-block bing'), 'one changed word inside the shared block is reported');

    writeFileSync(victim, original);
    assert.ok(!has(run().found, 'shared-block bing'),
      'removing the divergence clears the finding, so the gate tracks the tree rather than latching');
  });
});

/**
 * Adversarial review 2026-09-20, finding 1. Exemption keyed on "any module is local-file" let a
 * connector still serving catalog modules drop the hosted block entirely.
 */
test('control: a connector serving both providers is reported, and its catalog half still held', () => {
  withTree((dir, run) => {
    const mp = join(dir, 'bing', 'manifest.json');
    const m = JSON.parse(readFileSync(mp, 'utf8'));
    const first = Object.keys(m.modules)[0];
    m.modules.localthing = { ...m.modules[first], auth: { ...(m.modules[first].auth ?? {}), provider: 'local-file' } };
    writeFileSync(mp, JSON.stringify(m, null, 2));
    edit(join(dir, 'bing', 'auth.md'), (t) =>
      t.replace(/## Revoking\n[\s\S]*?(?=\n## Last connected)/, '## Revoking\n\nDelete the local credential file.\n'));

    const { found, errors } = run();
    assert.deepEqual(errors, []);
    assert.ok(hasText(found, 'bing: serves both catalog and local-file'), 'the mixture itself is reported');
    assert.ok([...found].some((f) => f.startsWith('shared-block bing') && f.includes('diverges')),
      'the catalog half is still held to the block');
  });
});

/** Adversarial review finding 6: a slot can be emptied, left unexpanded, or point at a file. */
test('control: an empty, unexpanded, or local-file vendor slot is reported', () => {
  const cases = [
    ['', 'the vendor route is empty'],
    ['{VENDOR ROUTE}', 'unreplaced slot token'],
    ['Delete the credential file on disk.', 'names a local credential file'],
  ];
  for (const [replacement, expected] of cases) {
    withTree((dir, run) => {
      edit(join(dir, 'bing', 'auth.md'), (t) =>
        t.replace('Delete the API key at Bing Webmaster Tools under Settings, API Access.', replacement));
      const { found, errors } = run();
      assert.deepEqual(errors, []);
      assert.ok([...found].some((f) => f.startsWith('shared-slot bing') && f.includes(expected)),
        `a slot replaced with ${JSON.stringify(replacement)} is reported as: ${expected}`);
    });
  }
});

/** Adversarial review, other checks: a CRLF checkout must not read as 24 divergences. */
test('control: CRLF line endings are not a divergence', () => {
  withTree((dir, run) => {
    edit(join(dir, 'bing', 'auth.md'), (t) => t.replace(/\n/g, '\r\n'));
    const { found, errors } = run();
    assert.deepEqual(errors, []);
    assert.ok(!has(found, 'shared-block bing'), 'the same text with CRLF endings still conforms');
  });
});

/**
 * `clarity` is the connector the Playbook names as the model Status form, so it is the one whose
 * cleanliness a regression breaks first. One marker per case: a mutation planting two at once
 * would pass with either detector deleted, which adversarial review pointed out about the first
 * version of this control.
 */
test('control: each grant-state marker added to a clean Status section is reported on its own', () => {
  for (const [marker, sentence] of [
    ['ACTIVE', '`analytics` is ACTIVE.'],
    ['live connect', 'Live connect 2026-09-08.'],
    ['connected account', 'Proved against one connected account.'],
    ['the grant holds', 'The grant holds read access.'],
  ]) {
    withTree((dir, run) => {
      const victim = join(dir, 'clarity', 'CONNECTOR.md');
      const original = readFileSync(victim, 'utf8');
      const before = run();
      assert.deepEqual(before.errors, []);
      assert.ok(!has(before.found, 'operator-state clarity'), 'clarity is clean before the mutation');

      writeFileSync(victim, original.replace('## Status\n', `## Status\n\n${sentence}\n`));
      const after = run();
      assert.deepEqual(after.errors, []);
      assert.ok(has(after.found, 'operator-state clarity'), `${marker} alone is reported`);

      writeFileSync(victim, original);
      assert.ok(!has(run().found, 'operator-state clarity'), `removing ${marker} clears the finding`);
    });
  }
});

/** Adversarial review finding 9: verification prose must not be read as a grant. */
test('control: undated verification prose is not a grant, and a dated re-verification is', () => {
  withTree((dir, run) => {
    edit(join(dir, 'clarity', 'CONNECTOR.md'), (t) =>
      t.replace('## Status\n', '## Status\n\nSchema validation re-verified against fixtures.\n'));
    // Scoped to clarity: vercel's Status genuinely carries a dated re-verification, so an
    // unscoped assertion passes on somebody else's real finding and proves nothing here.
    assert.ok(!hasText(run().found, 'clarity: CONNECTOR.md \'## Status\' states a dated re-verification'),
      'a sentence about a test fixture is not operator state');
  });
  withTree((dir, run) => {
    edit(join(dir, 'clarity', 'CONNECTOR.md'), (t) =>
      t.replace('## Status\n', '## Status\n\nGrant re-verified 2026-09-17.\n'));
    assert.ok(hasText(run().found, 'clarity: CONNECTOR.md \'## Status\' states a dated re-verification'),
      'a dated re-verification of a grant is');
  });
});

/**
 * Adversarial review finding 2. A heading inside a code fence is not a heading, and reading one
 * as a boundary truncated the section at the fence and hid everything after it.
 */
test('control: a heading inside a code fence does not truncate a section or hide grant state', () => {
  const { body } = section('## Status\n\n```\n## Example\n```\n\nanalytics ACTIVE.\n\n## Next\n\nx\n', '## Status');
  assert.match(body, /analytics ACTIVE\./, 'the section body reaches past a fenced heading');

  const { count } = section('## Status\n\nfirst\n\n## Other\n\nx\n\n## Status\n\nACTIVE\n', '## Status');
  assert.equal(count, 2, 'a repeated heading is counted rather than ignored');

  withTree((dir, run) => {
    edit(join(dir, 'clarity', 'CONNECTOR.md'), (t) =>
      t.replace('## Status\n', '## Status\n\n```\n## Example\n```\n\nanalytics ACTIVE.\n'));
    assert.ok(has(run().found, 'operator-state clarity'), 'grant state behind a fenced heading is still reported');
  });
});

/**
 * Adversarial review finding 3. The role sense of "operator" excused the whole line, so one
 * sentence carrying both the legitimate sense and the defect was silently clean.
 */
test('control: a role phrase on the same line no longer excuses provenance beside it', () => {
  withTree((dir, run) => {
    edit(join(dir, 'bing', 'CONNECTOR.md'), (t) => `${t}\nThe operator decided this; have the operator check the key.\n`);
    const { found } = run();
    assert.ok(hasText(found, 'bing: CONNECTOR.md') && hasText(found, 'records who decided'),
      'the provenance half of a mixed line is reported');
  });
  withTree((dir, run) => {
    edit(join(dir, 'bing', 'CONNECTOR.md'), (t) => `${t}\n- have the operator check the key and API access.\n`);
    assert.ok(!hasText(run().found, 'bing: CONNECTOR.md:'),
      'a line carrying only the role sense is still not reported');
  });
});

/** Adversarial review finding 3, second half: identity is read from every shipped file. */
test('control: a harness named in index.js is reported', () => {
  withTree((dir, run) => {
    edit(join(dir, 'bing', 'index.js'), (t) => `// Connected through Codex.\n${t}`);
    const { found } = run();
    assert.ok(hasText(found, 'bing: index.js') && hasText(found, 'names a person'),
      'index.js is in the population, not just the two guides');
  });
});

/** Adversarial review finding 10, plus the portable forms that must stay quiet. */
test('control: the machine-path detector fires on a machine path and not on a portable one', () => {
  const home = `/${'Users'}/someone/secrets.env`;
  const volume = `/${'Volumes'}/DISK/WISER Plugins/wiser`;
  for (const s of [home, volume, `bound at ${home}`, `see (${volume})`, `path=${home}`, `<${volume}>`, `[link](${home})`]) {
    assert.ok(MACHINE_PATH.test(s), `fires on ${s}`);
  }
  for (const s of [
    '../../gateway/SETUP.md',
    '~/Library/Application Support/wiser/auth-provider.env',
    '$XDG_CONFIG_HOME/wiser/auth-provider.env',
    'the /v1/models endpoint',
    'POST /users/me',
    `https://example.com/${'Users'}/x`,
  ]) {
    assert.ok(!MACHINE_PATH.test(s), `quiet on ${s}`);
  }
});

/** Adversarial review finding 4. A connector dropping out of the population takes its defects with it. */
test('control: a guide directory with no manifest is an error, and an unrelated directory is not', () => {
  withTree((dir, run) => {
    unlinkSync(join(dir, 'bing', 'manifest.json'));
    const { errors } = run();
    assert.ok(errors.some((e) => e.includes('bing') && e.includes('no manifest.json')),
      `a guide with no manifest is an error, got ${JSON.stringify(errors)}`);
  });
  withTree((dir, run) => {
    mkdirSync(join(dir, 'not-a-connector'));
    assert.deepEqual(run().errors, [], 'a directory carrying neither a guide nor a manifest is not an error');
  });
});

/** Adversarial review finding 5. Which text is canonical must not be decided by position. */
test('control: an ambiguous shared source is refused rather than resolved by position', () => {
  withTree((dir, run) => {
    edit(join(dir, 'shared-text.md'), (t) => t.replace('## Revoking\n', '## Revoking\n\n```\nan example fence\n```\n'));
    assert.ok(run().errors.some((e) => e.includes('2 fenced blocks')),
      'two fenced blocks under one heading is an error, not a silent choice of the first');
  });
  withTree((dir, run) => {
    edit(join(dir, 'shared-text.md'), (t) => {
      const i = t.indexOf('for you. {VENDOR ROUTE}');
      return t.slice(0, i) + t.slice(i).replace('{VENDOR ROUTE}', '{VENDOR ROUTE} and {VENDOR ROUTE}');
    });
    assert.ok(run().errors.some((e) => e.includes('slots')),
      'a second slot is an error, because splitting on it would silently drop the text after it');
  });
});

/**
 * The template is what connector twenty-six inherits, so it is held to the same source.
 *
 * It sits outside `connectors/` and so outside `collectDivergences`, and it carried its own
 * twenty-sixth hand-maintained copy of the Revoking text until 2026-09-20. A template that
 * drifts is worse than a guide that drifts, because it reintroduces the class on every new
 * connector and nobody looks at it until then. It keeps the slot unfilled, which is the one
 * difference from a shipped guide.
 */
test('the connector template carries the shared text, with its slot still unfilled', () => {
  const template = fileURLToPath(new URL('../../system/templates/Connector Template', import.meta.url));
  const auth = readFileSync(join(template, 'auth.md'), 'utf8').replace(/\r\n/g, '\n');
  const connector = readFileSync(join(template, 'CONNECTOR.md'), 'utf8').replace(/\r\n/g, '\n');
  const { blocks } = readSharedBlocks();

  const revoking = blocks.get('## Revoking').body;
  assert.ok(auth.includes(revoking),
    'the template auth.md carries the Revoking block from connectors/shared-text.md verbatim, slot and all, so filling the slot produces a conforming guide');

  assert.ok(auth.includes(blocks.get('## The blueprint sentence').body.trim()),
    'the template auth.md carries the canonical blueprint sentence');

  const { body: lastConnected } = section(auth, '## Last connected');
  assert.match(lastConnected, /^Not yet\./, 'the template ships Last connected unanswered');
  assert.match(lastConnected, /Do not record a date, an account, a machine, a harness/,
    'and carries the rule that keeps it that way');

  const { body: status } = section(connector, '## Status');
  assert.match(status, /Do not record a grant state/,
    'the template CONNECTOR.md carries the Status rule, so connector twenty-six cannot reintroduce the class');
});
