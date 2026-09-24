import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { defaultGatewayHome, wiserUserConfigDir } from '../../../../gateway/src/paths.js';
import { COST_TABLE, EMPTY_ENV, SCORING_PROMPT, seededOrder } from '../trial.mjs';

const trialPath = fileURLToPath(new URL('../trial.mjs', import.meta.url));
const pluginRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const stubPath = fileURLToPath(new URL('./fixtures/trial/gateway-stub.js', import.meta.url));
const hostPath = fileURLToPath(new URL('./fixtures/trial/host.mjs', import.meta.url));
const FAKE_KEY = 'wk_7f3a9c2e1b84d056';
const ASK_READ = 'Write the alpha note.';
const ASK_BASH = 'Write the beta note.';
const ASK_NONE = 'Answer none of the candidates.';

chmodSync(hostPath, 0o755);

function envFor(home, extra = {}) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  for (const key of ['WISER_TRIAL_HOST', 'STUB_LOCK_STATUS', 'TRIAL_SENTINEL', 'TRIAL_CAPTURE_DIR', 'TRIAL_SCORE_STATE', 'TRIAL_SCORE_FAILS', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_PID', 'LAUNCHER_FOO']) {
    delete env[key];
  }
  return { ...env, ...extra };
}

function runCli(args, home, extra = {}) {
  const run = spawnSync(process.execPath, [trialPath, ...args], {
    encoding: 'utf8',
    env: envFor(home, extra),
    timeout: 180000,
  });
  assert.equal(String(run.stdout).includes(FAKE_KEY), false, 'stdout contains the key');
  assert.equal(String(run.stderr).includes(FAKE_KEY), false, 'stderr contains the key');
  return run;
}

function secretHits(dir) {
  const hits = [];
  if (!dir || !existsSync(dir)) return hits;
  const stack = [dir];
  const needle = Buffer.from(FAKE_KEY);
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      const abs = join(cur, ent.name);
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) stack.push(abs);
      else if (ent.isFile()) {
        try {
          if (readFileSync(abs).includes(needle)) hits.push(abs);
        } catch { /* unreadable */ }
      }
    }
  }
  return hits;
}

function world() {
  const home = mkdtempSync(join(tmpdir(), 'wiser-trial-home-'));
  const cfg = wiserUserConfigDir(process.platform, process.env, home);
  mkdirSync(cfg, { recursive: true, mode: 0o700 });
  const key = join(cfg, 'auth-provider.env');
  writeFileSync(key, `WISER_AUTH_PROVIDER_KEY=\nWISER_USER_ID=\nWISER_CLASSIFIER_KEY=${FAKE_KEY}\n`, { mode: 0o600 });
  const parent = mkdtempSync(join(tmpdir(), 'wiser-trial-parent-'));
  const work = join(parent, 'work');
  mkdirSync(work);
  mkdirSync(defaultGatewayHome(home), { recursive: true });
  return { home, key, parent, work, cfg };
}

function classifierAt(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.mjs'), 'export function createClassifier() { return {}; }\n');
  return dir;
}

function syntheticTree(dir) {
  mkdirSync(join(dir, 'gateway'), { recursive: true });
  cpSync(stubPath, join(dir, 'gateway', 'server.js'));
  mkdirSync(join(dir, 'skills', 'Alpha'), { recursive: true });
  writeFileSync(join(dir, 'skills', 'AGENTS.md'), '# Skills\n');
  writeFileSync(join(dir, 'skills', 'Alpha', 'SKILL.md'), '---\nname: Alpha\ntype: skill\n---\n\n# Alpha\n');
  mkdirSync(join(dir, 'experts', 'Beta'), { recursive: true });
  writeFileSync(join(dir, 'experts', 'Beta', 'EXPERT.md'), '---\nname: Beta\ntype: expert\n---\n\n# Beta\n');
  const template = join(dir, 'system', 'templates', 'User Root Template');
  mkdirSync(template, { recursive: true });
  writeFileSync(join(template, 'AGENTS.md'), '---\nroot: [name]\ntype:\nlayout: 3\nclassifier_refusal: no\n---\n\n# Template\n');
  writeFileSync(join(dir, 'trial-open.json'), `${JSON.stringify({
    [ASK_READ]: { expect: 'skills/Alpha/SKILL.md', via: 'read' },
    [ASK_BASH]: { expect: 'experts/Beta/EXPERT.md', via: 'bash' },
    [ASK_NONE]: { expect: 'none', via: 'read' },
  })}\n`);
  return dir;
}

function validSpec(tree, classifier, extra = {}) {
  return {
    kind: 'routing',
    tree,
    classifier,
    model: 'claude-sonnet-4-5',
    effort: 'low',
    repeats: 3,
    seed: 1,
    max_turns: 4,
    deadline_s: 30,
    root_files: { 'inbox/note.txt': 'hello from root files' },
    cases: [
      { id: 'read', ask: ASK_READ, expect: 'skills/Alpha/SKILL.md', rubric: [{ id: 'S1', text: 'The note is written.' }], none: false },
      { id: 'bash', ask: ASK_BASH, expect: 'experts/Beta/EXPERT.md', rubric: [{ id: 'S1', text: 'The note is written.' }], none: false },
      { id: 'none', ask: ASK_NONE, expect: 'none', rubric: [{ id: 'N1', text: 'It answers none.' }], none: true, none_item: 'N1' },
    ],
    ...extra,
  };
}

function writeSpec(work, spec) {
  writeFileSync(join(work, 'spec.json'), `${JSON.stringify(spec, null, 2)}\n`);
}

function jsonOut(run) {
  assert.equal(run.status, 0, run.stderr || run.stdout);
  return JSON.parse(run.stdout);
}

function interleaved(order) {
  const arms = order.map((id) => {
    const match = /-(C|E)-\d+$/.exec(id);
    assert.ok(match, id);
    return match[1];
  });
  const first = arms[0];
  const count = arms.filter((arm) => arm === first).length;
  const switchAt = arms.findIndex((arm) => arm !== first);
  return switchAt > 0 && switchAt < count;
}

function captures(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.startsWith('capture-')).map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}

test('the cost table is the brief', () => {
  assert.deepEqual(COST_TABLE, {
    host: {
      opus: { median: 0.55, p90: 1.4 },
      sonnet: { median: 0.2, p90: 0.55 },
      haiku: { median: 0.05, p90: 0.15 },
    },
    judge: { median: 0.1, p90: 0.25 },
  });
  assert.equal(SCORING_PROMPT.split('one fenced JSON block').length - 1, 2);
  assert.ok(SCORING_PROMPT.trim().startsWith('Output contract:'));
  assert.ok(SCORING_PROMPT.trim().endsWith('{"scores": {...}, "reasons": {...}}.'));
  assert.match(SCORING_PROMPT, /fully meets the item as written/);
  assert.match(SCORING_PROMPT, /Score what is on the page/);
});

test('help exits 0 and an unknown flag is refused by name', () => {
  const missing = join(tmpdir(), `wiser-trial-missing-${process.pid}`);
  rmSync(missing, { recursive: true, force: true });
  const help = runCli(['help'], missing);
  assert.equal(help.status, 0, help.stderr);
  assert.equal(help.stderr, '');
  assert.match(help.stdout, /--work/);
  assert.match(help.stdout, /--go/);
  assert.match(help.stdout, /WISER_TRIAL_HOST/);
  assert.match(help.stdout, /keyscan/);
  assert.equal(existsSync(missing), false);
  const dashed = runCli(['--help'], missing);
  assert.equal(dashed.status, 0);
  assert.match(dashed.stdout, /--keep-temp/);

  const { home } = world();
  const unknown = runCli(['plan', '--not-a-flag'], home);
  assert.equal(unknown.status, 1);
  assert.equal(unknown.stdout, '');
  assert.match(unknown.stderr, /--not-a-flag/);
});

test('plan refuses each invalid spec and a work path inside the plugin or the key directory', () => {
  const box = world();
  const tree = syntheticTree(join(box.parent, 'tree'));
  const classifier = classifierAt(join(box.parent, 'classifier'));
  const base = validSpec(tree, classifier);

  const refusals = [
    [{ ...base, kind: 'other' }, /routing/],
    [{ ...base, cases: [] }, /no cases/],
    [{ ...base, cases: [{ ask: 'x', rubric: [{ id: 'S1', text: 't' }] }] }, /no id/],
    [{ ...base, cases: [{ id: 'c1', rubric: [{ id: 'S1', text: 't' }] }] }, /no ask/],
    [{ ...base, cases: [{ id: 'c1', ask: 'x' }] }, /no rubric/],
    [{ ...base, cases: [{ id: 'c1', ask: 'x', rubric: [{ id: 'S1', text: 't' }], none: false }] }, /none/],
    [{ ...base, repeats: 2 }, /repeats/],
    [{ ...base, tree: 'relative/tree' }, /absolute/],
    [{ ...base, classifier: 'relative/classifier' }, /absolute/],
  ];
  for (const [spec, pattern] of refusals) {
    writeSpec(box.work, spec);
    const run = runCli(['plan', '--work', box.work], box.home);
    assert.equal(run.status, 1, JSON.stringify(spec.kind));
    assert.equal(run.stdout, '');
    assert.match(run.stderr, pattern);
    assert.equal(existsSync(join(box.work, 'plan.json')), false);
  }

  const noGateway = join(box.parent, 'no-gateway');
  mkdirSync(join(noGateway, 'skills'), { recursive: true });
  writeFileSync(join(noGateway, 'skills', 'AGENTS.md'), '# Skills\n');
  writeSpec(box.work, validSpec(noGateway, classifier));
  const missingGateway = runCli(['plan', '--work', box.work], box.home);
  assert.equal(missingGateway.status, 1);
  assert.match(missingGateway.stderr, /gateway\/server\.js/);

  const noSkills = join(box.parent, 'no-skills');
  mkdirSync(join(noSkills, 'gateway'), { recursive: true });
  writeFileSync(join(noSkills, 'gateway', 'server.js'), '// stub\n');
  writeSpec(box.work, validSpec(noSkills, classifier));
  const missingSkills = runCli(['plan', '--work', box.work], box.home);
  assert.equal(missingSkills.status, 1);
  assert.match(missingSkills.stderr, /skills\/AGENTS\.md/);

  const insidePlugin = runCli(['plan', '--work', pluginRoot], box.home);
  assert.equal(insidePlugin.status, 1);
  assert.equal(insidePlugin.stdout, '');
  assert.match(insidePlugin.stderr, /plugin/);

  const insideKey = runCli(['plan', '--work', box.cfg], box.home);
  assert.equal(insideKey.status, 1);
  assert.equal(insideKey.stdout, '');
  assert.match(insideKey.stderr, /inside/);
  assert.equal(secretHits(box.work).length, 0);
});

test('plan figures, history, and needs_go', () => {
  const box = world();
  const tree = syntheticTree(join(box.parent, 'tree'));
  const classifier = classifierAt(join(box.parent, 'classifier'));
  writeSpec(box.work, validSpec(tree, classifier, { cases: [validSpec(tree, classifier).cases[2]] }));
  const planned = jsonOut(runCli(['plan', '--work', box.work], box.home));
  assert.equal(planned.host_runs, 6);
  assert.equal(planned.judge_runs, 6);
  assert.equal(planned.classifier_calls_estimate, 6);
  assert.equal(planned.source, 'default');
  assert.equal(planned.usd_per_run, 0.2);
  assert.equal(planned.usd_p90, 0.55);
  assert.ok(Math.abs(planned.usd_expected - 1.8) < 1e-9);
  assert.ok(Math.abs(planned.usd_worst - 4.8) < 1e-9);
  assert.equal(planned.ceiling_usd, null);
  assert.equal(planned.needs_go, true);
  assert.equal(planned.order.length, 6);
  assert.deepEqual(planned.order, seededOrder(['none'], 3, 1));
  assert.equal(interleaved(planned.order), true);
  const again = jsonOut(runCli(['plan', '--work', box.work], box.home));
  assert.deepEqual(again.order, planned.order);
  writeSpec(box.work, validSpec(tree, classifier, { cases: [validSpec(tree, classifier).cases[2]], seed: 2 }));
  const seed2 = jsonOut(runCli(['plan', '--work', box.work], box.home));
  assert.equal(interleaved(seed2.order), true);
  assert.deepEqual(seed2.order, seededOrder(['none'], 3, 2));
  assert.notDeepEqual(seed2.order, planned.order);

  const ceiling = join(box.parent, 'ceiling.json');
  const wrote = jsonOut(runCli(['ceiling', '--ceiling-file', ceiling, '--usd', '100'], box.home));
  assert.equal(wrote.usd, 100);
  assert.match(wrote.set, /^\d{4}-\d{2}-\d{2}$/);
  const under = jsonOut(runCli(['plan', '--work', box.work, '--ceiling-file', ceiling], box.home));
  assert.equal(under.needs_go, false);
  assert.equal(under.ceiling_usd, 100);
  writeFileSync(ceiling, `${JSON.stringify({ usd: 1, set: '2026-09-24' })}\n`);
  const over = jsonOut(runCli(['plan', '--work', box.work, '--ceiling-file', ceiling], box.home));
  assert.equal(over.needs_go, true);

  const badUsd = runCli(['ceiling', '--ceiling-file', join(box.parent, 'bad.json'), '--usd', '0'], box.home);
  assert.equal(badUsd.status, 1);
  assert.equal(badUsd.stdout, '');
  assert.match(badUsd.stderr, /positive/);
  const neg = runCli(['ceiling', '--ceiling-file', join(box.parent, 'bad.json'), '--usd', '-2'], box.home);
  assert.equal(neg.status, 1);
  assert.match(neg.stderr, /positive/);

  writeSpec(box.work, validSpec(tree, classifier, {
    cases: [validSpec(tree, classifier).cases[2]],
    model: 'custom-model-x',
    seed: 1,
  }));
  const unknown = jsonOut(runCli(['plan', '--work', box.work, '--ceiling-file', ceiling], box.home));
  assert.equal(unknown.source, 'default');
  assert.equal(unknown.usd_per_run, null);
  assert.equal(unknown.usd_worst, null);
  assert.equal(unknown.needs_go, true);

  const sibling = join(box.parent, 'older', 'runs', 'h1');
  mkdirSync(sibling, { recursive: true });
  for (const [name, usd] of [['a', 0.1], ['b', 0.5], ['c', 0.3]]) {
    mkdirSync(join(box.parent, 'older', 'runs', name), { recursive: true });
    writeFileSync(join(box.parent, 'older', 'runs', name, 'meta.json'), JSON.stringify({ model: 'claude-sonnet-4-5', usd }));
  }
  mkdirSync(join(box.parent, 'older', 'runs', 'other'), { recursive: true });
  writeFileSync(join(box.parent, 'older', 'runs', 'other', 'meta.json'), JSON.stringify({ model: 'claude-opus-4', usd: 9 }));
  writeSpec(box.work, validSpec(tree, classifier, { cases: [validSpec(tree, classifier).cases[2]], model: 'claude-sonnet-4-5' }));
  const history = jsonOut(runCli(['plan', '--work', box.work], box.home));
  assert.equal(history.source, 'history');
  assert.equal(history.usd_per_run, 0.3);
  assert.equal(history.usd_p90, 0.5);
  assert.ok(Math.abs(history.usd_expected - 2.4) < 1e-9);
  assert.ok(Math.abs(history.usd_worst - 4.5) < 1e-9);

  writeSpec(box.work, validSpec(tree, classifier, {
    kind: 'seam',
    cases: [validSpec(tree, classifier).cases[2]],
    calls_per_run: 4,
    usd_per_run: 0.4,
  }));
  const seam = jsonOut(runCli(['plan', '--work', box.work], box.home));
  assert.equal(seam.source, 'spec');
  assert.equal(seam.usd_per_run, 0.4);
  assert.equal(seam.classifier_calls_estimate, 12);
  assert.equal(secretHits(box.work).length, 0);
});

test('run refuses without --go when needs_go is set', () => {
  const box = world();
  const tree = syntheticTree(join(box.parent, 'tree'));
  const classifier = classifierAt(join(box.parent, 'classifier'));
  writeSpec(box.work, validSpec(tree, classifier, { cases: [validSpec(tree, classifier).cases[2]] }));
  jsonOut(runCli(['plan', '--work', box.work], box.home));
  const sentinel = join(box.parent, 'sentinel');
  const run = runCli(['run', '--work', box.work], box.home, {
    WISER_TRIAL_HOST: hostPath,
    TRIAL_SENTINEL: sentinel,
  });
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /needs_go/);
  assert.equal(existsSync(sentinel), false);
  assert.equal(existsSync(join(box.work, 'runs')), false);
});

test('the arm switch, seeded order, opened files, and blind packets', () => {
  const box = world();
  const beforeKey = readFileSync(box.key);
  const tree = syntheticTree(join(box.parent, 'tree'));
  const classifier = classifierAt(join(box.parent, 'classifier'));
  writeSpec(box.work, validSpec(tree, classifier));
  const captureDir = join(box.parent, 'captures');
  mkdirSync(captureDir);
  const plan = jsonOut(runCli(['plan', '--work', box.work], box.home));
  assert.equal(interleaved(plan.order), true);
  const run = jsonOut(runCli(['run', '--work', box.work, '--go', '--keep-temp'], box.home, {
    WISER_TRIAL_HOST: hostPath,
    TRIAL_CAPTURE_DIR: captureDir,
    CLAUDE_CODE_SESSION_ID: 'should-not-pass',
    CLAUDE_PID: '424242',
    CLAUDE_CONFIG_DIR: join(box.parent, 'claude-config'),
    WISER_SHOULD_NOT_LEAK: 'no',
    LAUNCHER_FOO: 'no',
  }));
  assert.equal(run.lock_proof, 'needs_connect');
  assert.equal(run.key_present, true);
  assert.equal(run.temp_removed, false);
  assert.equal(existsSync(run.temp_dir), true);
  assert.equal(readFileSync(box.key).equals(beforeKey), true);

  const seen = captures(captureDir).filter((row) => row.mode === 'host');
  assert.equal(seen.length, plan.order.length);
  const arms = { C: 0, E: 0 };
  for (const row of seen) {
    const id = row.trialHome.split('/').pop();
    const arm = /-(C|E)-\d+$/.exec(id)[1];
    arms[arm] += 1;
    const auth = join(wiserUserConfigDir(process.platform, process.env, row.trialHome), 'auth-provider.env');
    const cfg = wiserUserConfigDir(process.platform, process.env, row.trialHome);
    assert.equal(lstatSync(cfg).mode & 0o777, 0o700);
    assert.equal(row.link, arm === 'C');
    if (arm === 'C') assert.equal(readlinkSync(auth), box.key);
    else {
      assert.equal(lstatSync(auth).isSymbolicLink(), false);
      assert.equal(readFileSync(auth, 'utf8'), EMPTY_ENV);
      assert.equal(statSync(auth).mode & 0o777, 0o600);
    }
    assert.equal(row.mcpEnv.HOME, row.trialHome);
    assert.equal(row.env.HOME === row.trialHome, false);
    assert.equal(JSON.parse(row.argv[row.argv.indexOf('--settings') + 1]).env.HOME, row.trialHome);
    assert.equal(row.argv.includes('mcp__wiser-gateway__execute'), false);
    assert.ok(row.argv.includes('mcp__wiser-gateway__search_actions'));
    assert.ok(row.argv.includes('mcp__wiser-gateway__list_connections'));
    assert.equal(row.mcpArgs.includes('--home'), false);
    assert.equal(row.mcpArgs.includes('--env'), false);
    assert.ok(row.mcpArgs.includes('--provider'));
    assert.ok(row.mcpArgs.includes('local-file'));
    assert.equal(row.env.CLAUDE_CODE_SESSION_ID, null);
    assert.equal(row.env.CLAUDE_PID, null);
    assert.equal(row.env.wiser.length, 0);
    assert.equal(row.env.launcher.length, 0);
    assert.equal(row.env.CLAUDE_CONFIG_DIR, join(box.parent, 'claude-config'));
    assert.equal(row.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1');
    assert.ok(row.argv.includes('--effort'));
    assert.equal(row.argv[row.argv.indexOf('--effort') + 1], 'low');
  }
  assert.ok(arms.C > 0 && arms.E > 0);

  for (const id of plan.order) {
    const meta = JSON.parse(readFileSync(join(box.work, 'runs', id, 'meta.json'), 'utf8'));
    assert.equal(meta.valid, true, JSON.stringify(meta.invalid_reasons));
    assert.equal(meta.usd, 0.2);
    const arm = meta.arm;
    if (arm === 'C' && meta.case === 'read') {
      assert.deepEqual(meta.opened, ['skills/Alpha/SKILL.md']);
      assert.equal(meta.first_opened, 'skills/Alpha/SKILL.md');
      assert.equal(meta.reached, true);
      assert.equal(meta.classifier_calls, 2);
      assert.equal(meta.first_party.length, 2);
      assert.equal(meta.binding_in_trial_home, true);
    }
    if (arm === 'C' && meta.case === 'bash') {
      assert.deepEqual(meta.opened, ['experts/Beta/EXPERT.md']);
      assert.equal(meta.reached, true);
    }
    if (arm === 'E' && meta.case === 'read') {
      assert.deepEqual(meta.opened, []);
      assert.equal(meta.reached, false);
      assert.equal(meta.classifier_calls, 0);
    }
    if (meta.case === 'none') {
      assert.deepEqual(meta.opened, []);
      assert.equal(meta.reached, true);
    }
    const rootAgents = readFileSync(join(run.temp_dir, 'roots', id, 'AGENTS.md'), 'utf8');
    assert.match(rootAgents, /^root: trial$/m);
    assert.match(rootAgents, /^type: personal$/m);
    assert.match(rootAgents, /^classifier_refusal: no$/m);
    assert.equal(readFileSync(join(run.temp_dir, 'roots', id, 'inbox', 'note.txt'), 'utf8'), 'hello from root files');
  }

  const blind = jsonOut(runCli(['blind', '--work', box.work, '--seed', '7'], box.home));
  assert.equal(blind.order.length, plan.order.length);
  const again = jsonOut(runCli(['blind', '--work', box.work, '--seed', '7'], box.home));
  assert.deepEqual(again.order, blind.order);
  const other = jsonOut(runCli(['blind', '--work', box.work, '--seed', '8'], box.home));
  assert.notDeepEqual(other.order, blind.order);
  const forbidden = ['claude-sonnet', '0.2', 'skills/', 'experts/', '/tmp', '/var', ['', 'Volumes'].join('/'), '-C-', '-E-'];
  for (const oid of blind.order) {
    const text = readFileSync(join(box.work, 'blind', 'packets', `${oid}.md`), 'utf8');
    assert.equal(blind.map[oid].includes(oid), false);
    for (const word of forbidden) assert.equal(text.includes(word), false, word);
    for (const id of plan.order) assert.equal(text.includes(id), false, id);
    assert.match(text, /## Ask/);
    assert.match(text, /## Rubric/);
    assert.match(text, /## Deliverable/);
    assert.match(text, /The page says the work is done/);
  }
  assert.equal(secretHits(box.work).length, 0);
  assert.equal(secretHits(run.temp_dir).length, 0);
  assert.equal(secretHits(captureDir).length, 0);
  rmSync(run.temp_dir, { recursive: true, force: true });
});

test('a non-needs_connect lock proof stops before any host run', () => {
  const box = world();
  const tree = syntheticTree(join(box.parent, 'tree'));
  const classifier = classifierAt(join(box.parent, 'classifier'));
  writeSpec(box.work, validSpec(tree, classifier, { cases: [validSpec(tree, classifier).cases[2]] }));
  const ceiling = join(box.parent, 'ceiling.json');
  jsonOut(runCli(['ceiling', '--ceiling-file', ceiling, '--usd', '100'], box.home));
  jsonOut(runCli(['plan', '--work', box.work, '--ceiling-file', ceiling], box.home));
  const sentinel = join(box.parent, 'sentinel');
  const run = runCli(['run', '--work', box.work], box.home, {
    WISER_TRIAL_HOST: hostPath,
    STUB_LOCK_STATUS: 'ok',
    TRIAL_SENTINEL: sentinel,
  });
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /ok/);
  assert.match(run.stderr, /needs_connect/);
  assert.match(run.stderr, /No host run/);
  assert.equal(existsSync(sentinel), false);
  assert.equal(existsSync(join(box.work, 'runs')), false);
  const temp = /temp removed: (\S+)/.exec(run.stderr);
  assert.ok(temp, run.stderr);
  assert.equal(existsSync(temp[1]), false);
});

test('the real gateway lock proof answers needs_connect', { timeout: 180000 }, () => {
  const box = world();
  const beforeKey = readFileSync(box.key);
  const classifier = classifierAt(join(box.parent, 'classifier'));
  const spec = validSpec(pluginRoot, classifier, {
    cases: [{ id: 'none', ask: ASK_NONE, expect: 'none', rubric: [{ id: 'N1', text: 'It answers none.' }], none: true, none_item: 'N1' }],
    root_files: {},
    deadline_s: 60,
  });
  writeSpec(box.work, spec);
  const ceiling = join(box.parent, 'ceiling.json');
  jsonOut(runCli(['ceiling', '--ceiling-file', ceiling, '--usd', '100'], box.home));
  jsonOut(runCli(['plan', '--work', box.work, '--ceiling-file', ceiling], box.home));
  const run = runCli(['run', '--work', box.work], box.home, { WISER_TRIAL_HOST: hostPath });
  assert.equal(run.status, 0, run.stderr);
  const body = JSON.parse(run.stdout);
  assert.equal(body.lock_proof, 'needs_connect');
  assert.equal(body.temp_removed, true);
  assert.equal(existsSync(body.temp_dir), false);
  assert.equal(readFileSync(box.key).equals(beforeKey), true);
  assert.equal(secretHits(box.work).length, 0);
});

test('a planted gateway change and a planted session id stop the run', () => {
  function prepare(ask) {
    const box = world();
    const tree = syntheticTree(join(box.parent, 'tree'));
    writeFileSync(join(tree, 'trial-open.json'), `${JSON.stringify({ [ask]: { expect: 'none', via: 'read' } })}\n`);
    const classifier = classifierAt(join(box.parent, 'classifier'));
    writeSpec(box.work, validSpec(tree, classifier, {
      cases: [{ id: 'none', ask, expect: 'none', rubric: [{ id: 'N1', text: 'It answers none.' }], none: true, none_item: 'N1' }],
    }));
    const ceiling = join(box.parent, 'ceiling.json');
    jsonOut(runCli(['ceiling', '--ceiling-file', ceiling, '--usd', '100'], box.home));
    jsonOut(runCli(['plan', '--work', box.work, '--ceiling-file', ceiling], box.home));
    return box;
  }
  const changed = prepare('PLANT_GATEWAY\nAnswer none of the candidates.');
  const changeRun = runCli(['run', '--work', changed.work], changed.home, { WISER_TRIAL_HOST: hostPath });
  assert.equal(changeRun.status, 1);
  assert.equal(changeRun.stdout, '');
  assert.match(changeRun.stderr, /planted-by-host\.txt/);
  const safety = JSON.parse(readFileSync(join(changed.work, 'safety.json'), 'utf8'));
  assert.ok(safety.changed.some((path) => path.endsWith('planted-by-host.txt')));
  const changeTemp = /temp removed: (\S+)/.exec(changeRun.stderr);
  assert.ok(changeTemp);
  assert.equal(existsSync(changeTemp[1]), false);
  assert.equal(secretHits(changed.work).length, 0);

  const leaked = prepare('PLANT_SESSION\nAnswer none of the candidates.');
  const leakRun = runCli(['run', '--work', leaked.work], leaked.home, { WISER_TRIAL_HOST: hostPath });
  assert.equal(leakRun.status, 1);
  assert.equal(leakRun.stdout, '');
  assert.match(leakRun.stderr, /leak\.txt/);
  assert.equal(existsSync(join(leaked.work, 'runs')), true);
  const leakTemp = /temp removed: (\S+)/.exec(leakRun.stderr);
  assert.ok(leakTemp);
  assert.equal(existsSync(leakTemp[1]), false);
  assert.equal(secretHits(leaked.work).length, 0);
});

test('temp state is removed after success and kept with --keep-temp', () => {
  const box = world();
  const tree = syntheticTree(join(box.parent, 'tree'));
  const classifier = classifierAt(join(box.parent, 'classifier'));
  writeSpec(box.work, validSpec(tree, classifier, { cases: [validSpec(tree, classifier).cases[2]] }));
  const ceiling = join(box.parent, 'ceiling.json');
  jsonOut(runCli(['ceiling', '--ceiling-file', ceiling, '--usd', '100'], box.home));
  jsonOut(runCli(['plan', '--work', box.work, '--ceiling-file', ceiling], box.home));
  const removed = jsonOut(runCli(['run', '--work', box.work], box.home, { WISER_TRIAL_HOST: hostPath }));
  assert.equal(removed.temp_removed, true);
  assert.equal(existsSync(removed.temp_dir), false);
  const kept = jsonOut(runCli(['run', '--work', box.work, '--keep-temp'], box.home, { WISER_TRIAL_HOST: hostPath }));
  assert.equal(kept.temp_removed, false);
  assert.equal(existsSync(join(kept.temp_dir, 'secrets')), true);
  assert.equal(existsSync(join(kept.temp_dir, 'homes')), true);
  assert.equal(secretHits(kept.temp_dir).length, 0);
  rmSync(kept.temp_dir, { recursive: true, force: true });
  assert.equal(secretHits(box.work).length, 0);
});

test('a commit is exported and the export is what the host runs', () => {
  const box = world();
  const tree = syntheticTree(join(box.parent, 'tree'));
  writeFileSync(join(tree, 'MARKER.txt'), 'export-marker\n');
  const git = (args) => spawnSync('git', args, { cwd: tree, encoding: 'utf8' });
  assert.equal(git(['init']).status, 0);
  assert.equal(git(['add', '.']).status, 0);
  assert.equal(git(['-c', 'user.email=trial@example.com', '-c', 'user.name=Trial', 'commit', '-m', 'tree']).status, 0, git(['status']).stderr);
  const rev = git(['rev-parse', 'HEAD']).stdout.trim();
  const classifier = classifierAt(join(box.parent, 'classifier'));
  writeSpec(box.work, validSpec(tree, classifier, {
    commit: rev,
    cases: [validSpec(tree, classifier).cases[2]],
  }));
  const ceiling = join(box.parent, 'ceiling.json');
  jsonOut(runCli(['ceiling', '--ceiling-file', ceiling, '--usd', '100'], box.home));
  jsonOut(runCli(['plan', '--work', box.work, '--ceiling-file', ceiling], box.home));
  const captureDir = join(box.parent, 'captures');
  mkdirSync(captureDir);
  const run = jsonOut(runCli(['run', '--work', box.work, '--keep-temp'], box.home, {
    WISER_TRIAL_HOST: hostPath,
    TRIAL_CAPTURE_DIR: captureDir,
  }));
  assert.equal(run.tree.commit, rev);
  assert.match(run.tree.digest, /^[0-9a-f]{64}$/);
  assert.equal(readFileSync(join(run.temp_dir, 'tree', 'MARKER.txt'), 'utf8'), 'export-marker\n');
  const hostRows = captures(captureDir).filter((row) => row.mode === 'host');
  assert.ok(hostRows.every((row) => row.pluginDir === join(run.temp_dir, 'tree')));
  rmSync(run.temp_dir, { recursive: true, force: true });
  assert.equal(secretHits(box.work).length, 0);
});

test('score parses a fenced block, retries once, and records unparsed', () => {
  const box = world();
  const spec = {
    kind: 'routing',
    repeats: 3,
    deadline_s: 30,
    cases: [
      { id: 'c1', ask: 'Write the note.', rubric: [{ id: 'R1', text: 'It is written.' }, { id: 'R2', text: 'It is short.' }] },
    ],
  };
  writeSpec(box.work, spec);
  const oid = 'abc1234567';
  mkdirSync(join(box.work, 'blind', 'packets'), { recursive: true });
  writeFileSync(join(box.work, 'blind', 'map.json'), JSON.stringify({ seed: 1, order: [oid], map: { [oid]: 'c1-C-1' } }));
  writeFileSync(join(box.work, 'blind', 'packets', `${oid}.md`), '## Ask\n\nWrite the note.\n\n## Rubric\n\n- R1: It is written.\n- R2: It is short.\n\n## Deliverable\n\nDone.\n');
  const captureDir = join(box.parent, 'captures');
  mkdirSync(captureDir);
  const state = join(box.parent, 'score-state');
  const scored = jsonOut(runCli(['score', '--work', box.work, '--model', 'claude-haiku-test'], box.home, {
    WISER_TRIAL_HOST: hostPath,
    TRIAL_CAPTURE_DIR: captureDir,
    TRIAL_SCORE_STATE: state,
    TRIAL_SCORE_FAILS: '1',
  }));
  assert.equal(scored.scored, 1);
  assert.equal(scored.unparsed, 0);
  const row = JSON.parse(readFileSync(join(box.work, 'scores', `${oid}.json`), 'utf8'));
  assert.deepEqual(row.scores, { R1: 1, R2: 1 });
  assert.equal(row.score, 2);
  assert.equal(row.usd, 0.01);
  const scoreCaps = captures(captureDir).filter((item) => item.mode === 'score');
  assert.equal(scoreCaps.length, 2);
  const argv = scoreCaps[0].argv.join('\n');
  for (const tool of ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Agent', 'Task', 'Skill', 'NotebookEdit', 'TodoWrite']) {
    assert.ok(argv.includes(tool), tool);
  }
  assert.equal(scoreCaps[0].mcpServers && Object.keys(scoreCaps[0].mcpServers).length, 0);
  assert.ok(scoreCaps[0].argv.includes('--model'));
  assert.ok(scoreCaps[0].argv.includes('{{PACKET}}') === false);
  assert.match(scoreCaps[0].argv[scoreCaps[0].argv.indexOf('-p') + 1], /one fenced JSON block/);

  writeFileSync(state, '0');
  rmSync(join(box.work, 'scores', `${oid}.json`));
  const unparsed = jsonOut(runCli(['score', '--work', box.work], box.home, {
    WISER_TRIAL_HOST: hostPath,
    TRIAL_SCORE_STATE: state,
    TRIAL_SCORE_FAILS: '9',
  }));
  assert.equal(unparsed.unparsed, 1);
  const bad = JSON.parse(readFileSync(join(box.work, 'scores', `${oid}.json`), 'utf8'));
  assert.equal(bad.status, 'unparsed');
  assert.equal(secretHits(box.work).length, 0);
});

function buildReport(dir, mutate) {
  const cases = [
    { id: 'n1', none: true, none_item: 'R1', rubric: [{ id: 'R1', text: 'None.' }, { id: 'R2', text: 'Short.' }] },
    { id: 'c1', none: false, rubric: [{ id: 'R1', text: 'None.' }, { id: 'R2', text: 'Short.' }] },
  ];
  const spec = {
    kind: 'routing',
    repeats: 3,
    model: 'claude-sonnet-4-5',
    cases: cases.map((item) => ({ ...item, ask: 'Write.' })),
  };
  const metas = [];
  for (const item of cases) {
    for (const arm of ['C', 'E']) {
      for (let repeat = 1; repeat <= 3; repeat += 1) {
        const scores = { R1: 1, R2: 1 };
        metas.push({
          id: `${item.id}-${arm}-${repeat}`,
          case: item.id,
          arm,
          repeat,
          model: spec.model,
          valid: true,
          invalid_reasons: [],
          usd: arm === 'C' ? 0.05 : 0.2,
          wall_ms: arm === 'C' ? 1000 : 3000,
          classifier_calls: arm === 'C' ? 1 : 0,
          reached: arm === 'C' && item.id === 'c1',
          scores,
        });
      }
    }
  }
  mutate(spec, metas);
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec));
  const order = metas.map((meta) => meta.id);
  writeFileSync(join(dir, 'plan.json'), JSON.stringify({
    order,
    usd_expected: 1.25,
    usd_worst: 4,
  }));
  const map = {};
  const scoreOrder = [];
  mkdirSync(join(dir, 'runs'), { recursive: true });
  mkdirSync(join(dir, 'scores'), { recursive: true });
  mkdirSync(join(dir, 'blind'), { recursive: true });
  metas.forEach((meta, index) => {
    const oid = `o${String(index).padStart(4, '0')}`;
    map[oid] = meta.id;
    scoreOrder.push(oid);
    const { scores, ...rest } = meta;
    mkdirSync(join(dir, 'runs', meta.id), { recursive: true });
    writeFileSync(join(dir, 'runs', meta.id, 'meta.json'), JSON.stringify(rest));
    const score = Object.values(scores).reduce((sum, value) => sum + value, 0);
    writeFileSync(join(dir, 'scores', `${oid}.json`), JSON.stringify({ oid, scores, reasons: {}, score, usd: 0.01 }));
  });
  writeFileSync(join(dir, 'blind', 'map.json'), JSON.stringify({ seed: 1, order: scoreOrder, map }));
}

test('report pass lines, overlap, and the noise note', () => {
  function report(mutate) {
    const box = world();
    buildReport(box.work, mutate);
    const run = runCli(['report', '--work', box.work], box.home);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(String(run.stdout).includes(FAKE_KEY), false);
    return JSON.parse(run.stdout);
  }
  const pass = report(() => {});
  assert.equal(pass.seam_passes, true);
  assert.equal(pass.lines.a.pass, true);
  assert.equal(pass.lines.a.gap, 0);
  assert.equal(pass.lines.a.items_per_run, 2);
  assert.equal(pass.lines.b.pass, true);
  assert.equal(pass.lines.c.pass, true);
  assert.equal(pass.lines.d.pass, true);
  assert.equal(pass.lines.d.c_median, 1);
  assert.equal(pass.lines.d.e_low, 3);
  assert.equal(pass.lines.e.pass, true);
  assert.ok(Math.abs(pass.lines.e.c_median - (0.05 + 0.00015)) < 1e-9);
  assert.equal(pass.lines.e.e_low, 0.2);
  assert.equal(pass.lines.e.classifier_usd_per_call, 0.00015);
  assert.equal(pass.overlap, true);
  assert.equal(pass.noise_note, 'no difference detected at n = 3');
  assert.equal(pass.release, 'a separate decision; this verdict releases nothing');
  assert.equal(pass.estimate.usd_expected, 1.25);
  assert.equal(pass.estimate.usd_worst, 4);
  assert.equal(pass.reached.C.c1, 3);
  assert.equal(pass.reached.E.c1, 0);
  assert.equal(pass.arms.C.classifier_calls, 6);
  assert.ok(pass.actual.usd > 0);

  const failA = report((_spec, metas) => {
    for (const meta of metas) if (meta.arm === 'C') meta.scores = { R1: 1, R2: 0 };
  });
  assert.equal(failA.lines.a.pass, false);
  assert.equal(failA.lines.b.pass, true);
  assert.equal(failA.lines.c.pass, true);
  assert.equal(failA.lines.d.pass, true);
  assert.equal(failA.lines.e.pass, true);
  assert.equal(failA.seam_passes, false);

  const failB = report((_spec, metas) => {
    const hit = metas.find((meta) => meta.arm === 'C' && meta.case === 'n1' && meta.repeat === 1);
    hit.scores = { R1: 0, R2: 1 };
  });
  assert.equal(failB.lines.a.pass, true);
  assert.equal(failB.lines.b.pass, false);
  assert.equal(failB.lines.c.pass, true);
  assert.equal(failB.seam_passes, false);

  const failC = report((spec, metas) => {
    for (let n = 2; n <= 9; n += 1) {
      spec.cases.push({ id: `g${n}`, none: false, ask: 'Write.', rubric: [{ id: 'R1', text: 'None.' }, { id: 'R2', text: 'Short.' }] });
    }
    for (const meta of metas) {
      if (meta.case === 'c1' && meta.arm === 'C') meta.scores = { R1: 0, R2: 0 };
    }
    const extras = [];
    for (let n = 2; n <= 9; n += 1) {
      for (const arm of ['C', 'E']) {
        for (let repeat = 1; repeat <= 3; repeat += 1) {
          extras.push({
            id: `g${n}-${arm}-${repeat}`,
            case: `g${n}`,
            arm,
            repeat,
            model: 'claude-sonnet-4-5',
            valid: true,
            invalid_reasons: [],
            usd: arm === 'C' ? 0.05 : 0.2,
            wall_ms: arm === 'C' ? 1000 : 3000,
            classifier_calls: arm === 'C' ? 1 : 0,
            reached: false,
            scores: { R1: 1, R2: 1 },
          });
        }
      }
    }
    metas.push(...extras);
  });
  assert.equal(failC.lines.a.pass, true, JSON.stringify(failC.lines.a));
  assert.equal(failC.lines.b.pass, true);
  assert.equal(failC.lines.c.pass, false);
  assert.equal(failC.lines.c.cases.c1.gap, 2);
  assert.equal(failC.lines.d.pass, true);
  assert.equal(failC.lines.e.pass, true);
  assert.equal(failC.seam_passes, false);

  const failD = report((_spec, metas) => {
    for (const meta of metas) meta.wall_ms = meta.arm === 'C' ? 9000 : 1000;
  });
  assert.equal(failD.lines.d.pass, false);
  assert.equal(failD.lines.e.pass, true);
  assert.equal(failD.lines.a.pass, true);
  assert.equal(failD.seam_passes, false);

  const failE = report((_spec, metas) => {
    for (const meta of metas) {
      meta.usd = meta.arm === 'C' ? 2 : 0.01;
      meta.classifier_calls = 0;
    }
  });
  assert.equal(failE.lines.e.pass, false);
  assert.equal(failE.lines.d.pass, true);
  assert.equal(failE.lines.a.pass, true);
  assert.equal(failE.seam_passes, false);

  const apart = report((_spec, metas) => {
    for (const meta of metas) if (meta.arm === 'E') meta.scores = { R1: 0, R2: 0 };
  });
  assert.equal(apart.overlap, false);
  assert.equal(apart.noise_note, null);
  assert.equal(apart.seam_passes, true, JSON.stringify(apart.lines));
});

test('another live session is attributed; a trial process, a dead process, or a trial session id stops the run', { timeout: 180000 }, () => {
  function prepare(ask) {
    const box = world();
    const tree = syntheticTree(join(box.parent, 'tree'));
    writeFileSync(join(tree, 'trial-open.json'), `${JSON.stringify({ [ask]: { expect: 'none', via: 'read' } })}\n`);
    const classifier = classifierAt(join(box.parent, 'classifier'));
    writeSpec(box.work, validSpec(tree, classifier, {
      cases: [{ id: 'none', ask, expect: 'none', rubric: [{ id: 'N1', text: 'It answers none.' }], none: true, none_item: 'N1' }],
    }));
    const ceiling = join(box.parent, 'ceiling.json');
    jsonOut(runCli(['ceiling', '--ceiling-file', ceiling, '--usd', '100'], box.home));
    jsonOut(runCli(['plan', '--work', box.work, '--ceiling-file', ceiling], box.home));
    return box;
  }
  const other = prepare('PLANT_OTHER_SESSION\nAnswer none of the candidates.');
  const otherRun = runCli(['run', '--work', other.work], other.home, { WISER_TRIAL_HOST: hostPath, FAKE_LIVE_PID: String(process.pid) });
  assert.equal(otherRun.status, 0, otherRun.stderr);
  const otherSafety = JSON.parse(readFileSync(join(other.work, 'safety.json'), 'utf8'));
  for (const name of ['claude-code.json', 'audit.jsonl', 'connections.json']) {
    assert.ok(otherSafety.changed.some((p) => p.endsWith(name)), name);
    assert.ok(otherSafety.attributed.some((a) => a.path.endsWith(name)), name);
  }
  assert.deepEqual(otherSafety.stops, []);

  const live = prepare('PLANT_PRESENCE_LIVE\nAnswer none of the candidates.');
  const liveRun = runCli(['run', '--work', live.work], live.home, { WISER_TRIAL_HOST: hostPath, FAKE_LIVE_PID: String(process.pid) });
  assert.equal(liveRun.status, 0, liveRun.stderr);
  const liveSafety = JSON.parse(readFileSync(join(live.work, 'safety.json'), 'utf8'));
  assert.ok(liveSafety.changed.some((p) => p.endsWith('codex.json')));
  assert.deepEqual(liveSafety.stops, []);
  assert.equal(liveSafety.attributed.length, 1);
  assert.equal(liveSafety.attributed[0].pid, process.pid);

  for (const marker of ['PLANT_PRESENCE_DEAD', 'PLANT_PRESENCE_OURS']) {
    const box = prepare(`${marker}\nAnswer none of the candidates.`);
    const run = runCli(['run', '--work', box.work], box.home, { WISER_TRIAL_HOST: hostPath });
    assert.equal(run.status, 1, `${marker} should stop`);
    assert.match(run.stderr, /codex\.json/);
    const safety = JSON.parse(readFileSync(join(box.work, 'safety.json'), 'utf8'));
    assert.ok(safety.stops.some((p) => p.endsWith('codex.json')));
    assert.equal(safety.attributed.length, 0);
  }
});

test('a root the person names keeps its own declaration; a template root is declared personal', { timeout: 180000 }, () => {
  const box = world();
  const tree = syntheticTree(join(box.parent, 'tree'));
  const ask = 'Answer none of the candidates.';
  writeFileSync(join(tree, 'trial-open.json'), `${JSON.stringify({ [ask]: { expect: 'none', via: 'read' } })}\n`);
  const own = join(box.parent, 'own-root');
  mkdirSync(own, { recursive: true });
  writeFileSync(join(own, 'AGENTS.md'), '---\nroot: mine\ntype: org\nlayout: 3\nclassifier_refusal: no\n---\n\n# mine\n');
  const classifier = classifierAt(join(box.parent, 'classifier'));
  writeSpec(box.work, validSpec(tree, classifier, {
    root: own,
    cases: [{ id: 'none', ask, expect: 'none', rubric: [{ id: 'N1', text: 'It answers none.' }], none: true, none_item: 'N1' }],
  }));
  const ceiling = join(box.parent, 'ceiling.json');
  jsonOut(runCli(['ceiling', '--ceiling-file', ceiling, '--usd', '100'], box.home));
  jsonOut(runCli(['plan', '--work', box.work, '--ceiling-file', ceiling], box.home));
  const run = runCli(['run', '--work', box.work, '--keep-temp'], box.home, { WISER_TRIAL_HOST: hostPath });
  assert.equal(run.status, 0, run.stderr);
  const temp = JSON.parse(run.stdout).temp_dir;
  const roots = readdirSync(join(temp, 'roots'));
  const text = readFileSync(join(temp, 'roots', roots[0], 'AGENTS.md'), 'utf8');
  assert.match(text, /^root: mine$/m);
  assert.match(text, /^type: org$/m);
  rmSync(temp, { recursive: true, force: true });
});

test('keyscan is clean, finds a planted key, and fails closed with no value', () => {
  const box = world();
  writeFileSync(join(box.work, 'note.txt'), 'nothing to see\n');
  const clean = jsonOut(runCli(['keyscan', '--work', box.work, '--key-file', box.key], box.home));
  assert.equal(clean.verdict, 'clean');
  assert.equal(clean.controls.memory, true);
  assert.equal(clean.controls.plant, true);
  assert.equal(clean.hits, 0);
  assert.equal(clean.key_length, FAKE_KEY.length);
  assert.equal(clean.key_sha256_12.length, 12);
  assert.equal(existsSync(join(box.work, '.wiser-trial-keyscan-plant')), false);
  assert.equal(secretHits(box.work).length, 0);

  const hitBox = world();
  const extra = join(hitBox.parent, 'extra');
  mkdirSync(extra);
  writeFileSync(join(extra, 'note.txt'), `prefix ${FAKE_KEY} suffix\n`);
  const hit = runCli(['keyscan', '--work', hitBox.work, '--key-file', hitBox.key, extra], hitBox.home);
  assert.equal(hit.status, 1);
  assert.equal(hit.stdout, '');
  const hitBody = JSON.parse(hit.stderr);
  assert.equal(hitBody.verdict, 'hit');
  assert.equal(hitBody.hits, 1);
  assert.ok(hitBody.hit_paths[0].endsWith(`${join('extra', 'note.txt')}`) || hitBody.hit_paths[0].endsWith('note.txt'));
  assert.equal(hit.stderr.includes(FAKE_KEY), false);

  const empty = world();
  writeFileSync(empty.key, 'WISER_AUTH_PROVIDER_KEY=\nWISER_USER_ID=\nWISER_CLASSIFIER_KEY=\n');
  const failed = runCli(['keyscan', '--work', empty.work, '--key-file', empty.key], empty.home);
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, '');
  const failedBody = JSON.parse(failed.stderr);
  assert.equal(failedBody.verdict, 'instrument_failed');
  assert.equal(failedBody.key_length, 0);
  assert.equal(failed.stderr.includes(FAKE_KEY), false);
});
