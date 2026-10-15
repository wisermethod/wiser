import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, '..');
const SCRIPT = join(TOOL, 'scripts', 'voice-report-html.js');
const FIX = join(HERE, 'fixtures');

function run(...args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

function scratch() {
  return mkdtempSync(join(tmpdir(), 'voice-report-html-test-'));
}

function extract(name) {
  const root = join(FIX, name);
  const r = run('extract', '--voice', join(root, 'memory', 'voice.md'), '--root', root);
  assert.equal(r.code, 0, r.err);
  return JSON.parse(r.out);
}

function renderData(data, extra = []) {
  const dir = scratch();
  const dataPath = join(dir, 'data.json');
  writeFileSync(dataPath, JSON.stringify(data));
  const out = join(dir, '2026-10-15 voice report.html');
  const r = run('render', '--data', dataPath, '--output', out, '--date', '2026-10-15', ...extra);
  return { ...r, out, dir, dataPath, html: existsSync(out) ? readFileSync(out, 'utf8') : null };
}

function writeData(data) {
  const path = join(scratch(), 'data.json');
  writeFileSync(path, JSON.stringify(data));
  return path;
}

const TRAIT = 'Emails and posts use I, you and contractions; the published narrative drops all three and carries figures with sources (E1, E2, E3, E4).';

test('help works with nothing configured, and beside --help', () => {
  for (const args of [['help'], ['--help'], [], ['help', '--help']]) {
    const r = run(...args);
    assert.equal(r.code, 0);
    assert.match(r.out, /voice-report-html 0\.3\.0/);
    assert.equal(r.err, '');
  }
});

test('unknown flags, commands, --install and repeated flags are refused by name', () => {
  assert.match(run('render', '--bogus', 'x').err, /unknown flag --bogus/);
  assert.match(run('publish').err, /unknown command "publish"/);
  assert.match(run('extract', '--install').err, /--install is refused/);
  assert.match(run('extract', '--voice', '/a', '--voice', '/b', '--root', '/c').err, /--voice is given twice/);
  assert.match(run('render', '--data').err, /--data needs a value/);
  assert.match(run('help', '--nope').err, /unknown argument/);
  for (const r of [run('render', '--bogus', 'x'), run('publish')]) {
    assert.equal(r.code, 1);
    assert.equal(r.out, '');
  }
});

test('relative paths are refused', () => {
  assert.match(run('extract', '--voice', 'memory/voice.md', '--root', FIX).err, /must be an absolute path/);
});

test('extract reads a built voice and its confirmed profile', () => {
  const data = extract('complete-root');
  assert.equal(data.state, 'built');
  assert.equal(data.subject, 'Marisol Vey');
  assert.equal(data.rootType, 'personal');
  assert.equal(data.authority.confirmed, '2026-10-15 [V3]');
  assert.equal(data.profile.state, 'read');
  assert.equal(data.profile.path, 'work/onboarding/2026-10-15 profile confirmed.json');
  assert.equal(data.profile.chunks, 6);
  assert.deepEqual(data.features.hedges, { low: 2, median: 3.5, high: 4, q1: null, q3: null, decision: 'polish', polish: 'high', measured: { low: 2, high: 9 } });
  assert.equal(data.features.sentence_mean.decision, 'keep');
  assert.equal(data.features.boosters.decision, null);
  assert.equal(data.sections.routing.rows.length, 2);
  assert.equal(data.sections.tone.state, 'answered');
  assert.equal(data.markers.length, 3);
  assert.deepEqual(data.rated, []);
  assert.equal(data.voice.sha256.length, 64);
});

test('a verification anchor after the voice-profile path is not part of the path', () => {
  const data = extract('anchored-profile-root');
  assert.equal(data.profile.state, 'read');
  assert.equal(data.profile.path, 'work/onboarding/2026-10-15 profile confirmed.json');
  assert.equal(data.features.hedges.decision, 'polish');
});

test('an old-format voice gets no measured values and keeps its Not available labels', () => {
  const data = extract('old-format-root');
  assert.equal(data.state, 'built');
  assert.equal(data.profile.state, 'absent');
  assert.deepEqual(data.features, {});
  assert.deepEqual(data.markers, []);
  const labels = data.notAvailable.map((n) => n.section);
  assert.ok(labels.includes('Prohibitions'));
  assert.ok(labels.includes('voice-confirmation-date'));
  const r = renderData(data);
  assert.equal(r.code, 0, r.err);
  assert.match(r.html, /not yet confirmed/);
  assert.match(r.html, /names no confirmed profile/);
  assert.match(r.html, /not yet confirmed; confirming authority Dana Whitlow/);
  assert.match(r.html, /Hedges \(maybe, perhaps\), Boosters \(clearly, certainly\), I, me, my, We, us, our, You, your: not known; nothing measured/);
  assert.match(r.html, /not rated; no line in the voice places them on these scales/);
  assert.doesNotMatch(r.html, /class="na-line"/);
  assert.doesNotMatch(r.html, /class="key"/);
  assert.equal((r.html.match(/class="mark"/g) || []).length, 0, 'no measured marker, and no key, with nothing measured');
});

test('a stub voice and a labelled stub are unbuilt, and render refuses them', () => {
  for (const name of ['stub-root', 'labelled-stub-root']) {
    const data = extract(name);
    assert.equal(data.state, 'unbuilt', name);
    const r = renderData(data);
    assert.equal(r.code, 1);
    assert.match(r.err, /has not been built/);
    assert.equal(r.html, null);
  }
});

test('a voice-profile line naming a missing file is reported, not guessed', () => {
  const data = extract('missing-profile-root');
  assert.equal(data.profile.state, 'missing-file');
  assert.deepEqual(data.features, {});
  const r = renderData(data);
  assert.equal(r.code, 0, r.err);
  assert.match(r.html, /which is not there/);
});

test('a voice-profile line outside the owning root is refused', () => {
  const root = join(FIX, 'outside-profile-root');
  const r = run('extract', '--voice', join(root, 'memory', 'voice.md'), '--root', root);
  assert.equal(r.code, 1);
  assert.match(r.err, /outside the owning root/);
});

test('a profile feature with a key voice-lexicon does not define is refused by name', () => {
  const root = join(FIX, 'bad-profile-root');
  const r = run('extract', '--voice', join(root, 'memory', 'voice.md'), '--root', root);
  assert.equal(r.code, 1);
  assert.match(r.err, /unknown key "target"/);
});

test('--voice outside --root is refused', () => {
  const r = run('extract', '--voice', join(FIX, 'complete-root', 'memory', 'voice.md'), '--root', join(FIX, 'stub-root'));
  assert.match(r.err, /not inside --root/);
});

test('the page is static, escapes voice.md text, and shows current setting and measured band', () => {
  const data = extract('escape-root');
  const r = renderData(data);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.html, /<script/i);
  assert.match(r.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;quoted&quot; &lt;b&gt;bold&lt;\/b&gt;/);
  assert.doesNotMatch(r.html, /https?:\/\//, 'no external request');
  const full = renderData(extract('complete-root'));
  assert.match(full.html, /set to 2 to 4 per 1,000 words; measured 2 to 9/);
  assert.match(full.html, /class="measured"/);
  assert.match(full.html, /polish: less of this than the samples show/);
  assert.match(full.html, /keep: as the samples show/);
  assert.match(full.html, /Semicolons/);
  assert.match(full.html, /13\.8 words on average; averages range 11\.2 to 17\.1 across 500-word stretches/);
  assert.match(full.html, /confirmed 2026-10-15 by Marisol Vey/);
  assert.doesNotMatch(full.html, /\[V3\]/);
  assert.match(full.html, /in 6 stretches of 500 words/);
});

test('rated dials need a trait line copied from voice.md and the evidence it cites', () => {
  const base = extract('complete-root');
  const ok = renderData({ ...base, rated: [{ key: 'involved', step: 2, trait: TRAIT, evidence: ['E1', 'E3'] }] });
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.html, /class="open" cx="25.00%"/);
  assert.match(ok.html, /class="sidenote"/);
  assert.match(ok.html, /Placed for: Email to a client&#39;s director/);

  const cases = [
    [{ key: 'involved', step: 2, trait: 'Writes warmly and with energy in every piece.', evidence: ['E1'] }, /not in voice.md as extracted/],
    [{ key: 'involved', step: 2, trait: TRAIT, evidence: ['E9'] }, /does not cite/],
    [{ key: 'involved', step: 2, trait: TRAIT, evidence: [] }, /cites no evidence/],
    [{ key: 'involved', step: 6, trait: TRAIT, evidence: ['E1'] }, /whole number from 1 to 5/],
    [{ key: 'warmth', step: 2, trait: TRAIT, evidence: ['E1'] }, /is not one of/],
    [{ key: 'involved', step: 2, trait: TRAIT, evidence: ['E1'], note: 'x' }, /unknown key "note"/]
  ];
  for (const [entry, pattern] of cases) {
    const r = renderData({ ...base, rated: [entry] });
    assert.equal(r.code, 1, JSON.stringify(entry));
    assert.match(r.err, pattern);
    assert.equal(r.html, null);
  }
  const twice = renderData({ ...base, rated: [{ key: 'involved', step: 2, trait: TRAIT, evidence: ['E1'] }, { key: 'involved', step: 3, trait: TRAIT, evidence: ['E1'] }] });
  assert.match(twice.err, /appears twice/);
});

test('a Routing Table register cell can be quoted, and an evidence range covers the ids inside it', () => {
  const base = extract('complete-root');
  const cell = renderData({ ...base, rated: [{ key: 'formality', step: 2, trait: 'E1 and E2: answer first, contractions, bare next step', evidence: ['E1', 'E2'] }] });
  assert.equal(cell.code, 0, cell.err);
  const range = renderData({ ...base, rated: [{ key: 'involved', step: 3, trait: 'Hedging: 2 to 9 per 1,000 words measured; polished away on the high side, set to 2 to 4 (E1 to E5; Marisol Vey chose to polish, 2026-10-15).', evidence: ['E3'] }] });
  assert.equal(range.code, 0, range.err);
  const outside = renderData({ ...base, rated: [{ key: 'involved', step: 3, trait: 'Hedging: 2 to 9 per 1,000 words measured; polished away on the high side, set to 2 to 4 (E1 to E5; Marisol Vey chose to polish, 2026-10-15).', evidence: ['E6'] }] });
  assert.match(outside.err, /does not cite/);
});

test('render never overwrites, and never writes inside the tool directory or through a link', () => {
  const data = extract('complete-root');
  const first = renderData(data);
  assert.equal(first.code, 0, first.err);
  const again = run('render', '--data', first.dataPath, '--output', first.out);
  assert.equal(again.code, 1);
  assert.match(again.err, /never overwrites/);

  const inside = run('render', '--data', first.dataPath, '--output', join(TOOL, 'page.html'));
  assert.match(inside.err, /inside the voice-report-html tool directory/);
  assert.equal(existsSync(join(TOOL, 'page.html')), false);

  const link = join(first.dir, 'link.html');
  symlinkSync(join(first.dir, 'elsewhere.html'), link);
  assert.match(run('render', '--data', first.dataPath, '--output', link).err, /symbolic link/);

  assert.match(run('render', '--data', first.dataPath, '--output', join(first.dir, 'no-such-folder', 'a.html')).err, /folder that does not exist/);
  assert.match(run('render', '--data', first.dataPath, '--output', join(first.dir, 'b.html'), '--date', '15/10/2026').err, /--date must be YYYY-MM-DD/);
});

test('extract --output writes the data file and refuses an existing one', () => {
  const dir = scratch();
  const root = join(FIX, 'complete-root');
  const out = join(dir, 'data.json');
  const r = run('extract', '--voice', join(root, 'memory', 'voice.md'), '--root', root, '--output', out);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(JSON.parse(r.out), { written: out.replace(/^\/var\//, '/private/var/'), state: 'built', profile: 'read' });
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).state, 'built');
  assert.match(run('extract', '--voice', join(root, 'memory', 'voice.md'), '--root', root, '--output', out).err, /never overwrites/);
});

test('fresh says whether a page still shows the voice as set now', () => {
  const root = join(scratch(), 'root');
  cpSync(join(FIX, 'complete-root'), root, { recursive: true });
  const voice = join(root, 'memory', 'voice.md');
  const profile = join(root, 'work', 'onboarding', '2026-10-15 profile confirmed.json');
  const data = join(root, 'work', 'onboarding', '2026-10-15 voice report.json');
  const page = join(root, 'work', 'onboarding', '2026-10-15 voice report.html');
  assert.equal(run('extract', '--voice', voice, '--root', root, '--output', data).code, 0);
  assert.equal(run('render', '--data', data, '--output', page).code, 0);
  const check = () => {
    const r = run('fresh', '--page', page, '--voice', voice, '--root', root);
    assert.equal(r.code, 0, r.err);
    return JSON.parse(r.out);
  };
  assert.deepEqual(check(), { fresh: true, changed: [] });

  const voiceText = readFileSync(voice, 'utf8');
  appendFileSync(voice, '\n- A new trait (E1).\n');
  assert.equal(check().fresh, false);
  assert.match(check().changed[0], /memory\/voice.md has changed/);
  writeFileSync(voice, voiceText);
  assert.equal(check().fresh, true, 'the same bytes again are the same voice');

  const profileText = readFileSync(profile, 'utf8');
  writeFileSync(profile, profileText.replace('"median": 3.5', '"median": 3.6'));
  assert.match(check().changed.join(' '), /profile .* has changed/);
  rmSync(profile);
  assert.match(check().changed.join(' '), /is no longer there/);
  writeFileSync(profile, profileText);
  assert.equal(check().fresh, true);

  const old = join(root, 'work', 'onboarding', 'old.html');
  writeFileSync(old, '<!doctype html><title>x</title>');
  const r = JSON.parse(run('fresh', '--page', old, '--voice', voice, '--root', root).out);
  assert.equal(r.fresh, false);
  assert.match(r.changed[0], /records no fingerprints/);
  assert.match(run('fresh', '--page', old, '--voice', voice).err, /fresh needs --root/);
});

test('inline prints a chat fragment of the dials, and writes nothing', () => {
  const base = extract('complete-root');
  const dir = scratch();
  const dataPath = join(dir, 'data.json');
  writeFileSync(dataPath, JSON.stringify({ ...base, rated: [{ key: 'involved', step: 2, trait: TRAIT, evidence: ['E1', 'E2'] }] }));
  const r = run('inline', '--data', dataPath);
  assert.equal(r.code, 0, r.err);
  const out = JSON.parse(r.out);
  assert.deepEqual(Object.keys(out), ['fragment', 'rated', 'measured', 'profile']);
  const f = out.fragment;
  assert.doesNotMatch(f, /<script|<html|<head|<body|<!doctype|<!--|https?:\/\//i);
  assert.match(f, /^<style>/);
  assert.match(f, /@media \(prefers-color-scheme:dark\)\{\.vr\{--vi:var\(--text-primary,#e9e7dc\)/, 'dark fallbacks for a host without colour variables');
  assert.doesNotMatch(f.replace(/--v\w+:var\([^)]*\)/g, ''), /#[0-9a-f]{3,6}/i, 'every colour goes through a variable');
  assert.match(f, /<h2 class="sr">Voice dials for Marisol Vey/);
  assert.match(f, /placed for: Email to a client&#39;s director/);
  assert.match(f, /cx="25.00%"/);
    assert.match(f, /Naming specifics<span class="r">not rated<\/span>/);
  assert.match(f, /Voice dials for Marisol Vey: 1 placed by lines in the voice and 9 measured/);
  assert.match(f, /” \(E1, E2\)<\/p>/);
  assert.match(f, /set to 2 to 4 per 1,000 words; measured 2 to 9<\/span><span class="r">polish: less of this than the samples show/);
  assert.match(f, /13\.8 words on average; averages range 11\.2 to 17\.1 across 500-word stretches/);
  assert.match(f, /Dotted: not known/);
  assert.deepEqual(readdirSync(dir), ['data.json']);

  const escData = extract('escape-root');
  escData.rated = [{ key: 'formality', step: 3, trait: 'Writes <img src=x onerror=alert(2)> & "quoted" asides in every email (E1, E2).', evidence: ['E1'] }];
  const esc = JSON.parse(run('inline', '--data', writeData(escData)).out).fragment;
  assert.doesNotMatch(esc, /<img|<script>alert/);
  assert.match(esc, /Writes &lt;img src=x onerror=alert\(2\)&gt; &amp; &quot;quoted&quot; asides/);

  const old = JSON.parse(run('inline', '--data', writeData(extract('old-format-root'))).out).fragment;
  assert.match(old, /not known; nothing measured/);
  assert.doesNotMatch(old, /class="k"/);

  const stub = run('inline', '--data', writeData(extract('stub-root')));
  assert.equal(stub.code, 1);
  assert.match(stub.err, /has not been built/);
  assert.match(run('inline', '--data', dataPath, '--output', join(dir, 'x.html')).err, /unknown flag --output/);
});

test('importing the script runs nothing', async () => {
  const module = await import(SCRIPT);
  assert.equal(typeof module.main, 'function');
});
