import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'scripts', 'word-document.js');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const COMMENTS_REL = OFFICE_REL + 'comments';
const MAIN_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const MAIN = 'word/document.xml';
const AUTHOR = 'Casey Example';
const fixtureDate = '2026-01-02T03:04:05Z';

function temp(t) {
  const path = mkdtempSync(join(realpathSync(tmpdir()), 'wiser-word-document-test-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return (name) => join(path, name);
}

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

function ok(...args) {
  const result = run(...args);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

function refused(pattern, ...args) {
  const result = run(...args);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, pattern);
}

function part(path, name = MAIN) {
  const parts = unzipSync(readFileSync(path));
  assert.ok(Object.hasOwn(parts, name), name);
  return new DOMParser().parseFromString(strFromU8(parts[name]), 'application/xml');
}

function nodes(root, name) {
  return Array.from(root.getElementsByTagNameNS(W, name));
}

function visible(path) {
  return nodes(part(path), 't').map((item) => item.textContent).join('');
}

function nativeFixture(path, body, extraParts = {}) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><q:document xmlns:q="${W}" xmlns:v="urn:fixture">
    <q:body>${body}<q:sectPr/></q:body></q:document>`;
  const parts = {
    [MAIN]: xml,
    '[Content_Types].xml': `<Types xmlns="${TYPES}">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Default Extension="bin" ContentType="application/octet-stream"/>
      <Override PartName="/${MAIN}" ContentType="${MAIN_TYPE}"/>
    </Types>`,
    '_rels/.rels': `<Relationships xmlns="${REL}">
      <Relationship Id="rId1" Type="${OFFICE_REL}officeDocument" Target="${MAIN}"/>
    </Relationships>`,
    'word/_rels/document.xml.rels': `<Relationships xmlns="${REL}"/>`,
    'word/media/picture.bin': Uint8Array.of(0, 1, 255, 128),
    ...extraParts,
  };
  writeFileSync(path, zipSync(Object.fromEntries(Object.entries(parts).map(([name, bytes]) =>
    [name, typeof bytes === 'string' ? strToU8(bytes) : bytes])), { level: 0 }));
}

function review(command, input, output, ...selection) {
  const preview = ok(command, '--input', input, ...selection);
  assert.equal(preview.confirmationRequired, true);
  assert.match(preview.confirmationToken, /^[0-9a-f]{64}$/);
  const finished = ok(command, '--input', input, ...selection, '--confirm', preview.confirmationToken, '--output', output);
  const status = command === 'reject-change' ? 'rejected' : 'accepted';
  assert.deepEqual(finished.changes, preview.changes.map((change) => ({ ...change, status })));
  return finished;
}

test('creates empty, inline, and structured Word packages and reads back title, text and breaks', (t) => {
  const path = temp(t);
  const empty = path('fresh/blank.docx');
  ok('create', '-o', empty);
  assert.equal(nodes(part(empty), 'p').length, 1);
  assert.deepEqual(ok('list-changes', '--input', empty).changes, []);
  const inline = path('inline.docx');
  ok('create', '--output', inline, '--title', 'Field Notes', '--text=-- draft');
  assert.equal(visible(inline), 'Field Notes-- draft');
  assert.equal(nodes(part(inline), 'pStyle')[0].getAttributeNS(W, 'val'), 'Title');
  assert.equal(part(inline, 'docProps/core.xml').getElementsByTagName('dc:title')[0].textContent, 'Field Notes');

  const data = path('spec.json');
  const structured = path('structured.DOCX');
  writeFileSync(data, JSON.stringify({ title: 'A & B', paragraphs: [' café 😀 ', 'one\ttwo\r\nthree', ''] }));
  const result = ok('create', '--input', data, '--output', structured);
  assert.equal(result.paragraphs, 3);
  const contents = part(structured);
  assert.equal(nodes(contents, 'p').length, 4);
  assert.equal(nodes(contents, 'tab').length, 1);
  assert.equal(nodes(contents, 'br').length, 1);
  assert.equal(visible(structured), 'A & B café 😀 onetwothree');

  writeFileSync(data, '{"title":"old","\\u0074itle":"new"}');
  refused(/unique keys/, 'create', '--input', data, '--output', path('duplicate.docx'));
  writeFileSync(data, '{"paragraphs":["fine"],"format":"ignored"}');
  refused(/Creation input/, 'create', '--input', data, '--output', path('ignored.docx'));
  assert.equal(existsSync(path('duplicate.docx')), false);
  assert.equal(existsSync(path('ignored.docx')), false);
});

test('adds real insertions and deletions with Unicode offsets and leaves each input unchanged', (t) => {
  const path = temp(t);
  const original = path('original.docx');
  const inserted = path('inserted.docx');
  const deleted = path('deleted.docx');
  const rejected = path('rejected.docx');
  const accepted = path('accepted.docx');
  ok('create', '--output', original, '--text', 'A😀 cedar birch');
  const startingBytes = readFileSync(original);

  assert.equal(ok('add-change', '--input', original, '--output', inserted, '--type', 'insertion',
    '--text', 'young ', '--author', AUTHOR, '--position', '3').change.position, 3);
  assert.equal(visible(inserted), 'A😀 young cedar birch');
  assert.equal(nodes(part(inserted), 'ins')[0].getAttributeNS(W, 'author'), AUTHOR);
  const previous = readFileSync(inserted);
  ok('add-change', '--input', inserted, '--output', deleted, '--type', 'deletion',
    '--text', 'birch', '--author', AUTHOR);
  assert.deepEqual(readFileSync(original), startingBytes);
  assert.deepEqual(readFileSync(inserted), previous);
  assert.equal(visible(deleted), 'A😀 young cedar ');
  assert.equal(nodes(part(deleted), 'delText')[0].textContent, 'birch');

  const { changes } = ok('list-changes', '--input', deleted);
  assert.deepEqual(changes.map(({ type, author, text, status }) => [type, author, text, status]), [
    ['insertion', AUTHOR, 'young ', 'pending'], ['deletion', AUTHOR, 'birch', 'pending'],
  ]);
  assert.notEqual(changes[0].wordId, changes[1].wordId);
  assert.match(changes[0].date, /Z$/);

  review('reject-change', deleted, rejected, '--change-id', '2');
  assert.equal(visible(rejected), 'A😀 young cedar birch');
  assert.equal(nodes(part(rejected), 'delText').length, 0);
  review('apply-all', deleted, accepted);
  assert.equal(visible(accepted), 'A😀 young cedar ');
  assert.deepEqual(ok('list-changes', '--input', accepted).changes, []);
});

test('uses exact revision identities and confines a batch to the reviewed author and type', (t) => {
  const path = temp(t);
  const input = path('native.docx');
  const one = path('one.docx');
  const two = path('two.docx');
  const rest = path('rest.docx');
  nativeFixture(input, `<q:p><q:ins q:id="31" q:author="${AUTHOR}"><q:r><q:t>same</q:t></q:r></q:ins>
    <q:r><q:t> middle </q:t></q:r><q:ins q:id="32" q:author="${AUTHOR}"><q:r><q:t>same</q:t></q:r></q:ins>
    <q:del q:id="33" q:author="${AUTHOR}"><q:r><q:delText> old</q:delText></q:r></q:del>
    <q:ins q:id="34" q:author="Riley Example"><q:r><q:t> last</q:t></q:r></q:ins></q:p>`);
  assert.deepEqual(review('apply-change', input, one, '--change-id', '2').changes.map((item) => item.wordId), ['32']);
  assert.equal(nodes(part(one), 'ins')[0].getAttributeNS(W, 'id'), '31');
  assert.equal(visible(one), 'same middle same last');
  review('reject-change', input, two, '--change-id', '2');
  assert.equal(visible(two), 'same middle  last');
  const result = review('apply-all', input, rest, '--filter-author', AUTHOR, '--filter-type', 'INSERTION');
  assert.deepEqual(result.changes.map((item) => item.wordId), ['31', '32']);
  assert.deepEqual(result.skipped, [3, 4]);
  assert.deepEqual(ok('list-changes', '--input', rest).changes.map((item) => item.wordId), ['34', '33']);
  assert.deepEqual(unzipSync(readFileSync(rest))['word/media/picture.bin'], Uint8Array.of(0, 1, 255, 128));

  const preview = ok('apply-all', '--input', input, '--filter-author', 'No Match');
  assert.deepEqual(preview.changes, []);
  assert.equal(preview.confirmationToken, null);
  refused(/Change ID 9 is absent/, 'apply-change', '--input', input, '--change-id', '9');
});

test('restores prior formatting on reject and reports preserved paragraph-mark and section properties', (t) => {
  const path = temp(t);
  const input = path('formatted.docx');
  const accepted = path('accepted.docx');
  const runRejected = path('run-rejected.docx');
  const allRejected = path('both-rejected.docx');
  nativeFixture(input, `<q:p><q:pPr><q:jc q:val="center"/><q:rPr><q:smallCaps/></q:rPr>
    <q:sectPr><q:pgSz q:w="12345"/></q:sectPr><q:pPrChange q:id="8" q:author="${AUTHOR}">
    <q:pPr><q:jc q:val="right"/></q:pPr></q:pPrChange></q:pPr>
    <q:r><q:rPr><q:b/><q:rPrChange q:id="9" q:author="${AUTHOR}"><q:rPr><q:i/></q:rPr></q:rPrChange></q:rPr>
    <q:t>Styled</q:t></q:r></q:p>`);
  const inventory = ok('list-changes', '--input', input).changes;
  assert.deepEqual(inventory.map((item) => item.type), ['formatting-run', 'formatting-paragraph']);
  assert.match(inventory[0].formatting.before, /<q:i/);
  assert.match(inventory[0].formatting.after, /<q:b/);
  assert.equal(inventory[0].text, 'Styled');
  review('apply-all', input, accepted, '--filter-type', 'formatting');
  const current = part(accepted);
  assert.equal(nodes(current, 'b').length, 1);
  assert.equal(nodes(current, 'i').length, 0);
  assert.equal(nodes(current, 'jc')[0].getAttributeNS(W, 'val'), 'center');
  review('reject-change', input, runRejected, '--change-id', '1');
  const paragraphReceipt = review('reject-change', runRejected, allRejected, '--change-id', '1');
  assert.deepEqual(paragraphReceipt.changes[0].formatting.preserved, ['w:rPr', 'w:sectPr']);
  const prior = part(allRejected);
  assert.equal(nodes(prior, 'b').length, 0);
  assert.equal(nodes(prior, 'i').length, 1);
  assert.equal(nodes(prior, 'jc')[0].getAttributeNS(W, 'val'), 'right');
  assert.equal(nodes(prior, 'pgSz')[0].getAttributeNS(W, 'w'), '12345');
  assert.equal(nodes(prior, 'smallCaps')[0].parentNode.parentNode.localName, 'pPr');
  assert.deepEqual(ok('list-changes', '--input', allRejected).changes, []);

  const added = path('added.docx');
  const rejected = path('rejected.docx');
  ok('add-change', '--input', allRejected, '--output', added, '--type', 'formatting', '--format', 'underline', '--text', 'tyl', '--author', AUTHOR);
  const result = part(added);
  assert.equal(nodes(result, 'u')[0].getAttributeNS(W, 'val'), 'single');
  assert.equal(visible(added), 'Styled');
  review('reject-change', added, rejected, '--change-id', '1');
  assert.equal(nodes(part(rejected), 'u').length, 0);
});

test('reads native comment ranges and writes connected comments with unique document IDs', (t) => {
  const path = temp(t);
  const input = path('external-comments.docx');
  const output = path('added.docx');
  const point = path('point.docx');
  const custom = 'word/review/notes.xml';
  nativeFixture(input, `<q:p><q:r><q:t>first </q:t></q:r><q:commentRangeStart q:id="8"/>
    <q:r><q:t>second</q:t></q:r><q:commentRangeEnd q:id="8"/>
    <q:r><q:commentReference q:id="8"/></q:r><q:r><q:t> third</q:t></q:r></q:p>`, {
    'word/_rels/document.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="rId7" Type="${COMMENTS_REL}" Target="review/notes.xml"/></Relationships>`,
    [custom]: `<q:comments xmlns:q="${W}"><q:comment q:id="8" q:author="${AUTHOR}" q:initials="CE" q:date="${fixtureDate}">
      <q:p><q:r><q:t>One</q:t></q:r></q:p><q:p><q:r><q:t>Two</q:t></q:r></q:p></q:comment></q:comments>`,
  });
  assert.deepEqual(ok('list-comments', '--input', input).comments, [{
    id: 1, commentId: '8', author: AUTHOR, date: fixtureDate, initials: 'CE', text: 'One\nTwo',
    commentedText: 'second', anchor: 'range',
  }]);
  const receipt = ok('add-comment', '--input', input, '--output', output, '--position', '13', '--length', '5',
    '--text', 'Review\nagain', '--author', 'River Blue Example');
  assert.equal(receipt.comment.commentId, '9');
  const comments = ok('list-comments', '--input', output).comments;
  assert.equal(comments[1].initials, 'RBE');
  assert.equal(comments[1].text, 'Review\nagain');
  assert.equal(comments[1].commentedText, 'third');
  const overrides = Array.from(part(output, '[Content_Types].xml').getElementsByTagNameNS(TYPES, 'Override'));
  assert.ok(overrides.some((override) => override.getAttribute('PartName') === '/' + custom));
  ok('add-comment', '--input', output, '--output', point, '--text', 'At the end', '--author', AUTHOR, '--position', '18', '--initials', 'CE');
  const last = ok('list-comments', '--input', point).comments.at(-1);
  assert.equal(last.author, AUTHOR);
  assert.equal(last.initials, 'CE');
  assert.equal(last.commentedText, '');
  assert.equal(last.anchor, 'point');
  assert.equal(visible(point), 'first second third');
  assert.equal(nodes(part(point, custom), 'comment').length, 3);
});

test('creates a comments relationship and keeps anchors readable when marked text is discarded', (t) => {
  const path = temp(t);
  const original = path('original.docx');
  const commented = path('commented.docx');
  const deleted = path('deleted.docx');
  const accepted = path('accepted.docx');
  ok('create', '--output', original, '--text', 'A pine tree');
  assert.deepEqual(ok('list-comments', '--input', original).comments, []);
  ok('add-comment', '--input', original, '--output', commented, '--position', '2', '--length', '4', '--text', 'Check species', '--author', AUTHOR);
  const rels = Array.from(part(commented, 'word/_rels/document.xml.rels').getElementsByTagNameNS(REL, 'Relationship'));
  assert.ok(rels.some((node) => node.getAttribute('Type') === COMMENTS_REL && node.getAttribute('Target') === 'comments.xml'));
  ok('add-change', '--input', commented, '--output', deleted, '--type', 'deletion', '--text', 'pine', '--author', AUTHOR);
  assert.equal(ok('list-comments', '--input', deleted).comments[0].commentedText, 'pine');
  review('apply-change', deleted, accepted, '--change-id', '1');
  assert.equal(ok('list-comments', '--input', accepted).comments[0].commentedText, '');
  assert.equal(nodes(part(accepted), 'commentReference')[0].parentNode.localName, 'r');

  const inside = path('inside.docx');
  const rejected = path('rejected.docx');
  nativeFixture(inside, `<q:p><q:ins q:id="4" q:author="${AUTHOR}"><q:commentRangeStart q:id="2"/>
    <q:r><q:t>drop</q:t></q:r><q:commentRangeEnd q:id="2"/><q:r><q:commentReference q:id="2"/></q:r></q:ins></q:p>`, {
    'word/comments.xml': `<q:comments xmlns:q="${W}"><q:comment q:id="2"><q:p><q:r><q:t>Keep review</q:t></q:r></q:p></q:comment></q:comments>`,
  });
  review('reject-change', inside, rejected, '--change-id', '1');
  const retained = ok('list-comments', '--input', rejected).comments[0];
  assert.equal(retained.text, 'Keep review');
  assert.equal(retained.commentedText, '');
  assert.equal(nodes(part(rejected), 'commentReference')[0].parentNode.localName, 'r');
});

test('refuses writes without matching review, unsafe paths, and unsupported or collateral revisions', (t) => {
  const path = temp(t);
  const input = path('native.docx');
  const other = path('other.docx');
  const output = path('output.docx');
  nativeFixture(input, `<q:p><q:r><q:t>baseline</q:t></q:r><q:ins q:id="1"><q:r><q:t> added</q:t></q:r></q:ins></q:p>`);
  nativeFixture(other, '<q:p><q:ins q:id="1"><q:r><q:t>different</q:t></q:r></q:ins></q:p>');
  const initial = readFileSync(input);
  const command = ['apply-change', '--input', input, '--change-id', '1'];
  const { confirmationToken } = ok(...command);
  const symlink = path('alias.docx');
  const hardlink = path('hardlink.docx');
  symlinkSync(input, symlink);
  linkSync(input, hardlink);
  const toolLink = path('tool-dir');
  symlinkSync(join(here, '..'), toolLink, 'dir');
  const broken = path('broken.docx');
  symlinkSync(path('missing.docx'), broken);
  for (const destination of [input, symlink, hardlink]) {
    refused(/already exists/, ...command, '--confirm', confirmationToken, '--output', destination);
  }
  refused(/inside this tool/, 'create', '--output', join(toolLink, 'must-not-exist', 'file.docx'));
  assert.equal(existsSync(join(here, '..', 'must-not-exist')), false);
  refused(/symlink/, 'create', '--output', broken);
  refused(/absolute/, 'create', '--output', 'relative.docx');
  refused(/Preview without/, ...command, '--output', output);
  refused(/Unknown option --overwrite/, ...command, '--overwrite');
  refused(/Unknown option --no-confirm/, ...command, '--no-confirm');
  refused(/does not match/, 'reject-change', '--input', input, '--change-id', '1', '--confirm', confirmationToken, '--output', output);
  refused(/does not match/, 'apply-change', '--input', other, '--change-id', '1', '--confirm', confirmationToken, '--output', output);
  refused(/does not match/, 'apply-all', '--input', input, '--confirm', confirmationToken, '--output', output);
  assert.equal(existsSync(output), false);
  assert.deepEqual(readFileSync(input), initial);

  const nested = path('nested.docx');
  nativeFixture(nested, `<q:p><q:del q:id="3"><q:ins q:id="4"><q:r><q:delText>nested</q:delText></q:r></q:ins></q:del>
    <q:moveFrom q:id="5"><q:r><q:delText>moved</q:delText></q:r></q:moveFrom></q:p>`);
  const move = ok('apply-change', '--input', nested, '--change-id', '3');
  assert.equal(move.changes[0].supported, false);
  refused(/outside this tool's edit scope/, 'apply-change', '--input', nested, '--change-id', '3',
    '--confirm', move.confirmationToken, '--output', output);
  const deletion = ok('apply-change', '--input', nested, '--change-id', '2');
  refused(/would also remove change 1/, 'apply-change', '--input', nested, '--change-id', '2',
    '--confirm', deletion.confirmationToken, '--output', output);
  assert.equal(existsSync(output), false);
});

test('refuses mismatched and ambiguous text ranges, broken archives and unfamiliar input flags', (t) => {
  const path = temp(t);
  const original = path('original.docx');
  const output = path('new.docx');
  const bad = path('bad.docx');
  ok('create', '--output', original, '--text', 'red red');
  const del = ['add-change', '--input', original, '--output', output, '--type', 'deletion', '--text', 'red', '--author', AUTHOR];
  refused(/more than once/, ...del);
  refused(/does not match/, ...del, '--position', '1');
  refused(/outside the document/, ...del, '--position', '80');
  refused(/past its paragraph/, 'add-comment', '--input', original, '--output', output, '--text', 'review', '--author', AUTHOR, '--length', '1');
  refused(/Repeated option --output/, 'create', '-o', output, '--output', output);
  refused(/Unknown option --bogus/, 'create', '--help', '--bogus');
  refused(/--text needs a value before --bogus/, 'create', '--output', output, '--text', '--bogus');
  refused(/Unknown option --env/, 'create', '--output', output, '--env', path('unused'));
  writeFileSync(bad, 'this is not a ZIP');
  refused(/The DOCX ZIP is unreadable/, 'list-changes', '--input', bad);
  nativeFixture(bad, '<q:p><q:r></q:p>');
  refused(/Invalid XML/, 'list-changes', '--input', bad);
  for (const invalid of ['\u0001', '&#1;', '<m:unbound/>']) {
    nativeFixture(bad, `<q:p><q:r><q:t>${invalid}</q:t></q:r></q:p>`);
    refused(/Invalid XML/, 'list-changes', '--input', bad);
  }
  assert.equal(existsSync(output), false);
});

test('refuses corrupt package members and missing main OPC metadata before editing', (t) => {
  const path = temp(t);
  const input = path('corrupt.docx');
  const output = path('new.docx');
  const op = ['add-change', '--input', input, '--output', output, '--type', 'insertion', '--text', 'draft', '--author', AUTHOR];
  writeFileSync(input, zipSync({ [MAIN]: strToU8(`<q:document xmlns:q="${W}"><q:body/></q:document>`) }));
  refused(/missing _rels\/\.rels/, ...op);
  nativeFixture(input, '<q:p/>', { '[Content_Types].xml': `<Types xmlns="${TYPES}"/>` });
  refused(/missing its main Word content type/, ...op);

  nativeFixture(input, '<q:p/>', { 'word/media/picture.bin': 'Store this exact unrelated payload' });
  const buffer = readFileSync(input);
  const offset = buffer.indexOf('Store this exact unrelated payload');
  assert.notEqual(offset, -1);
  buffer[offset] ^= 1;
  writeFileSync(input, buffer);
  refused(/corrupt/, ...op);
  assert.equal(existsSync(output), false);
});

test('protects complex ranges, preserves unwrapped namespace declarations, and keeps exact author values', (t) => {
  const path = temp(t);
  const input = path('complex.docx');
  const output = path('applied.docx');
  nativeFixture(input, `<q:p><q:ins q:id="1" q:author="" xmlns:x="urn:fixture-x">
    <q:r><q:t>one</q:t></q:r></q:ins>
    <q:ins q:id="2" xmlns:mc="${MC}" xmlns:x="urn:fixture-x"><mc:AlternateContent>
      <mc:Choice Requires="x"><q:r><q:t>choice</q:t></q:r></mc:Choice>
      <mc:Fallback><q:r><q:t>fallback</q:t></q:r></mc:Fallback>
    </mc:AlternateContent></q:ins>
    <q:ins q:id="3"><q:bookmarkStart q:id="21" q:name="Example"/><q:r><q:t>two</q:t></q:r></q:ins>
    <q:bookmarkEnd q:id="21"/></q:p>`);
  const { changes } = ok('list-changes', '--input', input);
  assert.deepEqual(changes.map(({ author, supported }) => [author, supported]), [
    ['', true], ['Unknown', false], ['Unknown', false],
  ]);
  assert.equal(changes[1].text, '[Alternate content]');
  const result = review('apply-all', input, output, '--filter-author=');
  assert.deepEqual(result.changes.map(({ wordId }) => wordId), ['1']);
  const run = nodes(part(output), 'r')[0];
  assert.equal(run.getAttribute('xmlns:x'), 'urn:fixture-x');
  assert.deepEqual(ok('list-changes', '--input', output).changes.map(({ wordId }) => wordId), ['2', '3']);
});

test('publishes one complete winner when simultaneous writes target the same output', async (t) => {
  const path = temp(t);
  const output = path('contested.docx');
  function create(text) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cli, 'create', '--output', output, '--text', text]);
      let err = '';
      child.stderr.on('data', (chunk) => { err += chunk; });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, err, text }));
    });
  }
  const results = await Promise.all([create('first'), create('second')]);
  assert.deepEqual(results.map(({ code }) => code).sort(), [0, 1]);
  assert.match(results.find(({ code }) => code === 1).err, /already exists/);
  assert.equal(visible(output), results.find(({ code }) => code === 0).text);
  assert.deepEqual(readdirSync(dirname(output)), ['contested.docx']);
});

test('reads the final legacy ZIP member and publishes only one replacement part', (t) => {
  const path = temp(t);
  const input = path('duplicate-parts.docx');
  const output = path('rewritten.docx');
  const shadow = 'word/documenx.xml';
  const old = '<q:p><q:r><q:t>Original Member</q:t></q:r></q:p>';
  const fresh = '<q:p><q:r><q:t>Latest Member</q:t></q:r></q:p>';
  nativeFixture(input, old, {
    [shadow]: `<q:document xmlns:q="${W}"><q:body>${fresh}</q:body></q:document>`,
  });
  const zip = readFileSync(input);
  const starts = [];
  for (let offset = zip.indexOf(shadow); offset !== -1; offset = zip.indexOf(shadow, offset + shadow.length)) starts.push(offset);
  assert.equal(starts.length, 2);
  for (const offset of starts) zip.write(MAIN, offset, 'utf8');
  writeFileSync(input, zip);
  assert.deepEqual(ok('list-changes', '--input', input).duplicateParts, [MAIN]);
  ok('add-change', '--input', input, '--output', output, '--type', 'insertion', '--text', ' retained', '--author', AUTHOR);
  assert.deepEqual(ok('list-changes', '--input', output).duplicateParts, []);
  assert.equal(visible(output), 'Latest Member retained');
});

test('help and consent behave on a fresh copy and an approved install finishes the same run', (t) => {
  const path = temp(t);
  const sandbox = path('plugin');
  const tool = join(sandbox, 'tools', 'word-document');
  const home = path('profile');
  const output = path('approved.docx');
  mkdirSync(tool, { recursive: true });
  mkdirSync(home);
  writeFileSync(join(sandbox, 'tools', 'AGENTS.md'), '# Tools\n');
  for (const file of ['package.json', 'package-lock.json', 'scripts']) {
    cpSync(join(here, '..', file), join(tool, file), { recursive: true });
  }
  const shared = join(sandbox, 'tools', 'lib');
  mkdirSync(shared);
  for (const file of ['consent.js', 'user-config.js']) cpSync(join(here, '..', '..', 'lib', file), join(shared, file));
  const entry = join(tool, 'scripts', 'word-document.js');
  const shim = path('npm-shim');
  mkdirSync(shim);
  const installer = path('install-fixture.cjs');
  writeFileSync(installer, `const { strict: assert } = require('node:assert');
const { cpSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
assert.deepEqual(process.argv.slice(2), ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
for (const path of Object.keys(lock.packages).filter(Boolean)) {
  cpSync(join(process.env.WISER_WORD_TEST_TOOL, path), join(process.cwd(), path), { recursive: true, dereference: true });
}
`);
  writeFileSync(join(shim, process.platform === 'win32' ? 'npm.cmd' : 'npm'), process.platform === 'win32'
    ? '@"%WISER_WORD_TEST_NODE%" "%WISER_WORD_TEST_INSTALLER%" %*\r\n'
    : '#!/bin/sh\nexec "$WISER_WORD_TEST_NODE" "$WISER_WORD_TEST_INSTALLER" "$@"\n', { mode: 0o700 });
  const env = {
    ...process.env, HOME: home, USERPROFILE: home, APPDATA: home, XDG_CONFIG_HOME: home,
    WISER_WORD_TEST_NODE: process.execPath, WISER_WORD_TEST_INSTALLER: installer,
    WISER_WORD_TEST_TOOL: join(here, '..'),
    PATH: shim + (process.platform === 'win32' ? ';' : ':') + process.env.PATH,
  };
  delete env.WISER_ALLOW_INSTALL;
  function clean(...args) {
    return spawnSync(process.execPath, [entry, ...args], { env, encoding: 'utf8' });
  }
  const help = clean('help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--install/);
  const invalid = clean('create', '--output', output, '--install', '--misspelled');
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown option --misspelled/);
  assert.equal(existsSync(join(tool, 'node_modules')), false);
  const refusal = clean('create', '--output', output);
  assert.equal(refusal.status, 1);
  assert.equal(refusal.stdout, '');
  assert.match(refusal.stderr, /^This Wiser skill needs to download and install/);
  assert.match(refusal.stderr, /registry\.npmjs\.org/);
  assert.equal(existsSync(output), false);
  assert.equal(existsSync(join(sandbox, '.wiser-consent')), false);
  const approved = clean('create', '--output', output, '--install', '--text', 'Approved copy');
  assert.equal(approved.status, 0, approved.stderr);
  assert.match(approved.stderr, /First run: installing dependencies/);
  assert.equal(JSON.parse(approved.stdout).output, output);
  assert.equal(visible(output), 'Approved copy');
  assert.equal(existsSync(join(sandbox, '.wiser-consent')), true);
});


test('creates one final section with explicit Letter geometry and one-inch margins', (t) => {
  const path = temp(t);
  for (const args of [[], ['--title', 'Sample', '--text', 'One paragraph']]) {
    const output = path(args.length ? 'populated.docx' : 'blank.docx');
    ok('create', '--output', output, ...args);
    const xml = part(output);
    const [section, ...other] = nodes(xml, 'sectPr');
    assert.ok(section);
    assert.deepEqual(other, []);
    assert.equal(nodes(xml, 'body')[0].lastChild, section);
    const read = (name, attributes) => attributes.map((key) => nodes(section, name)[0].getAttributeNS(W, key));
    assert.deepEqual(read('pgSz', ['w', 'h']), ['12240', '15840']);
    assert.deepEqual(read('pgMar', ['top', 'right', 'bottom', 'left']), Array(4).fill('1440'));
  }
});

test('addressable body tables and nested tables accept offsets, with comment markers ordered around a range', (t) => {
  const path = temp(t);
  const text = '0123456789abcdefghijTEXT rest';
  const table = (cell) => `<q:tbl><q:tr><q:tc>${cell}</q:tc></q:tr></q:tbl>`;
  for (const [name, wrap] of [['table', table], ['nested', (cell) => table(table(cell))]]) {
    const input = path(name + '.docx');
    const output = path(name + '-change.docx');
    const commented = path(name + '-comment.docx');
    nativeFixture(input, wrap(`<q:p><q:r><q:t>${text}</q:t></q:r></q:p>`));
    ok('add-change', '--input', input, '--output', output, '--type', 'insertion', '--text', '!', '--position', '20', '--author', AUTHOR);
    assert.equal(visible(output), text.replace('TEXT', '!TEXT'));
    assert.equal(nodes(part(output), 'ins')[0].parentNode.parentNode.localName, 'tc');

    ok('add-comment', '--input', input, '--output', commented, '--text', 'Review', '--author', AUTHOR,
      '--position', '20', '--length', '4');
    const paragraph = nodes(part(commented), 'p')[0];
    const children = Array.from(paragraph.childNodes).filter((child) => child.nodeType === 1);
    assert.deepEqual(children.map((child) => child.localName), ['r', 'commentRangeStart', 'r', 'commentRangeEnd', 'r', 'r']);
    assert.equal(children[2].textContent, 'TEXT');
    assert.equal(nodes(children[4], 'commentReference').length, 1);
  }
});

test('names excluded text-box, alternate-content and separate Word stories on placement refusals', (t) => {
  const path = temp(t);
  const text = '<q:p><q:r><q:t>Text outside the body map</q:t></q:r></q:p>';
  const table = `<q:tbl><q:tr><q:tc>${text}</q:tc></q:tr></q:tbl>`;
  const alternate = `<mc:AlternateContent xmlns:mc="${MC}"><mc:Fallback>${table}</mc:Fallback></mc:AlternateContent>`;
  const cases = [
    ['text box', `<q:p><q:r><q:pict><q:txbxContent>${table}</q:txbxContent></q:pict></q:r></q:p>`, {}],
    ['alternate content', alternate, {}],
    ...[
      ['header', 'hdr', 'header1'],
      ['footer', 'ftr', 'footer1'],
      ['footnotes', 'footnotes', 'footnotes'],
      ['endnotes', 'endnotes', 'endnotes'],
      ['comments', 'comments', 'comments'],
      ['glossary', 'glossaryDocument', 'glossary/document'],
    ].map(([label, root, file]) => [label, '', {
      [`word/${file}.xml`]: `<q:${root} xmlns:q="${W}">${table}</q:${root}>`,
    }]),
  ];
  for (const [label, excluded, parts] of cases) {
    const input = path(label + '.docx');
    const output = path('refused.docx');
    nativeFixture(input, '<q:p><q:r><q:t>body</q:t></q:r></q:p>' + excluded, parts);
    const placement = new RegExp(`addressable length: \\d+.*${label}`, 'i');
    const change = ['add-change', '--input', input, '--output', output, '--author', AUTHOR];
    const insert = [...change, '--type', 'insertion', '--text', 'inserted'];
    const comment = ['add-comment', '--input', input, '--output', output, '--text', 'review', '--author', AUTHOR];
    for (const command of [insert, comment]) {
      refused(placement, ...command);
      refused(placement, ...command, '--position', '20');
    }
    refused(placement, ...change, '--type', 'deletion', '--text', 'Text outside the body map');
    assert.equal(existsSync(output), false);
  }
});

test('requires an explicit nonblank author for new revisions and comments', (t) => {
  const path = temp(t);
  const input = path('original.docx');
  const output = path('wrong.docx');
  ok('create', '--output', input, '--text', 'Sample');
  for (const command of [['add-change', '--type', 'insertion'], ['add-comment']]) {
    const args = [...command, '--input', input, '--output', output, '--text', 'example'];
    refused(/--author.*required/i, ...args);
    refused(/--author.*required/i, ...args, '--author', '   ');
    assert.equal(existsSync(output), false);
  }
});

test('previews and refuses revisions with omitted notes, objects, fields, symbols or foreign markup', (t) => {
  const path = temp(t);
  const input = path('hidden.docx');
  const output = path('refused.docx');
  const hidden = ['footnoteReference', 'endnoteReference', 'drawing', 'pict', 'object', 'fldChar', 'sym']
    .map((name) => [name, `<q:${name}/>`]).concat([
      ['oMath', '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>42</m:t></m:r></m:oMath>'],
      ['page break', '<q:br q:type="page"/>'], ['column break', '<q:br q:type="column"/>'], ['softHyphen', '<q:softHyphen/>'],
    ]);
  nativeFixture(input, '<q:p>' + hidden.flatMap(([, markup], index) => ['ins', 'del'].map((tag, side) =>
    `<q:${tag} q:id="${index * 2 + side}"><q:r>${markup}</q:r></q:${tag}>`)).join('') + '</q:p>');
  const starting = readFileSync(input);
  const { changes } = ok('list-changes', '--input', input);
  for (const change of changes) {
    const [name] = hidden[Math.floor(Number(change.wordId) / 2)];
    assert.equal(change.supported, false);
    assert.match(change.unsupportedReason, new RegExp(name));
    const command = [change.type === 'insertion' ? 'reject-change' : 'apply-change', '--input', input, '--change-id', String(change.id)];
    const preview = ok(...command);
    refused(new RegExp(name), ...command, '--confirm', preview.confirmationToken, '--output', output);
    assert.equal(existsSync(output), false);
  }
  assert.deepEqual(readFileSync(input), starting);
});

test('pagination and proofing markers do not block acceptance of visible insertion text', (t) => {
  const path = temp(t);
  for (const [name, content] of [
    ['pagination', '<q:r><q:lastRenderedPageBreak/><q:t>continued clause</q:t></q:r>'],
    ['proofing', '<q:proofErr q:type="spellStart"/><q:r><q:t>continued clause</q:t></q:r><q:proofErr q:type="spellEnd"/>'],
  ]) {
    const input = path(`${name}.docx`);
    const output = path(`${name}-accepted.docx`);
    nativeFixture(input, `<q:p><q:ins q:id="1">${content}</q:ins></q:p>`);
    const { changes: [change] } = ok('list-changes', '--input', input);
    assert.equal(change.supported, true, name);
    assert.equal(change.text, 'continued clause');
    review('apply-change', input, output, '--change-id', String(change.id));
    assert.equal(visible(output), 'continued clause');
    assert.equal(nodes(part(output), 'ins').length, 0);
  }
});

test('run properties in text revisions allow formatting and refuse text hidden from the preview', (t) => {
  const path = temp(t);
  const input = path('run-properties.docx');
  const output = path('decided.docx');
  nativeFixture(input, `<q:p>
    <q:del q:id="1"><q:r><q:rPr><q:b/><q:t>hidden clause</q:t></q:rPr><q:delText>the</q:delText></q:r></q:del>
    <q:ins q:id="2"><q:r><q:rPr><q:b/><q:rPrChange q:id="3"><q:rPr><q:i/></q:rPr></q:rPrChange></q:rPr><q:t>formatted</q:t></q:r></q:ins>
    </q:p>`);
  const { changes } = ok('list-changes', '--input', input);
  const valid = changes.find(change => change.wordId === '2');
  const invalid = changes.find(change => change.wordId === '1');
  assert.equal(valid.supported, true);
  assert.equal(invalid.text, 'the');
  assert.equal(invalid.supported, false);
  assert.match(invalid.unsupportedReason, /q:t/);
  const args = ['apply-change', '--input', input, '--change-id', String(invalid.id)];
  const preview = ok(...args);
  refused(/q:t.*Resolve it in Word/, ...args, '--confirm', preview.confirmationToken, '--output', output);
  assert.equal(existsSync(output), false);
  review('apply-change', input, output, '--change-id', String(valid.id));
  assert.equal(nodes(part(output), 'b').length, 2);
});

test('ID allocation refuses missing Word IDs with a document repair message', (t) => {
  const path = temp(t);
  const input = path('missing-id.docx');
  const output = path('refused.docx');
  for (const [command, markup] of [
    [['add-change', '--type', 'insertion'], '<q:ins><q:r><q:t>Existing edit</q:t></q:r></q:ins>'],
    [['add-change', '--type', 'insertion'], '<q:moveToRangeStart/>'],
    [['add-comment'], '<q:commentRangeStart/>'],
  ]) {
    nativeFixture(input, `<q:p>${markup}</q:p><q:p><q:r><q:t>Normal paragraph</q:t></q:r></q:p>`);
    refused(/missing w:id.*repair the document in Word/i, ...command, '--input', input, '--output', output,
      '--text', 'New edit', '--author', AUTHOR);
    assert.equal(existsSync(output), false);
  }
});

test('allocates revision IDs above revisions and move markers in separate package stories', (t) => {
  const path = temp(t);
  const input = path('id-space.docx');
  const output = path('new-id.docx');
  const header = 'word/header1.xml';
  const footer = 'word/nested/footer.xml';
  nativeFixture(input, '<q:p><q:ins q:id="4"><q:r><q:t>Body</q:t></q:r></q:ins></q:p>', {
    [header]: `<q:hdr xmlns:q="${W}"><q:p><q:ins q:id="5"><q:r><q:t>Header</q:t></q:r></q:ins></q:p></q:hdr>`,
    [footer]: `<q:ftr xmlns:q="${W}"><q:p><q:moveToRangeStart q:id="+020"/><q:r><q:t>Footer</q:t></q:r><q:moveToRangeEnd q:id="20"/></q:p></q:ftr>`,
  });
  const { change } = ok('add-change', '--input', input, '--output', output, '--type', 'insertion', '--text', '!', '--position', '4', '--author', AUTHOR);
  assert.deepEqual(change.wordIds, ['21']);
  const [before, after] = [input, output].map((file) => unzipSync(readFileSync(file)));
  for (const name of [header, footer]) assert.deepEqual(after[name], before[name]);
});

test('discovers stories at package paths declared by relationships and default content types', (t) => {
  const path = temp(t);
  const input = path('package-stories.docx');
  const output = path('revised.docx');
  const header = 'stories/page-heading.hdr';
  const notes = 'stories/notes.fn';
  nativeFixture(input, '<q:p><q:r><q:t>Body</q:t></q:r></q:p>', {
    '[Content_Types].xml': `<Types xmlns="${TYPES}">
      <Default Extension="fn" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
      <Override PartName="/${MAIN}" ContentType="${MAIN_TYPE}"/>
    </Types>`,
    'word/_rels/document.xml.rels': `<Relationships xmlns="${REL}">
      <Relationship Id="rId8" Type="${OFFICE_REL}header" Target="../${header}"/>
    </Relationships>`,
    [header]: `<q:hdr xmlns:q="${W}"><q:p><q:ins q:id="+11"><q:r><q:t>Heading</q:t></q:r></q:ins></q:p></q:hdr>`,
    [notes]: `<q:footnotes xmlns:q="${W}"><q:footnote q:id="2"><q:p>
      <q:ins q:id="+13"><q:r><q:t>Footnote</q:t></q:r></q:ins>
    </q:p></q:footnote></q:footnotes>`,
  });
  const command = ['add-change', '--type', 'insertion', '--text', '!', '--author', AUTHOR, '--input', input, '--output', output];
  const missing = run(...command);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /header \(stories\/page-heading\.hdr\)/);
  assert.match(missing.stderr, /footnotes \(stories\/notes\.fn\)/);
  assert.equal(existsSync(output), false);
  assert.deepEqual(ok(...command, '--position', '4').change.wordIds, ['14']);
});

test('only visible unmapped story contents block implicit placement', (t) => {
  const path = temp(t);
  const input = path('decorations.docx');
  const output = path('change.docx');
  const write = (body, header) => nativeFixture(input, body, {
    'word/header1.xml': `<q:hdr xmlns:q="${W}"><q:p>${header}</q:p></q:hdr>`,
  });
  const body = '<q:p><q:r><q:t>Body</q:t></q:r></q:p>';
  const add = ['add-change', '--type', 'insertion', '--text', '!', '--author', AUTHOR, '--input', input];
  write(body, '<q:r><q:sym q:font="Symbol" q:char="F04A"/></q:r>');
  refused(/Excluded locations: header/, ...add, '--output', output);
  write('', '<q:r><q:t>Heading</q:t></q:r>');
  refused(/No addressable main-body paragraph.*addressable length: 0.*header/, ...add, '--output', output, '--position', '20');
  write(body + '<q:p><q:r><q:pict><v:textpath xmlns:v="urn:schemas-microsoft-com:vml" string="WordArt"/></q:pict></q:r></q:p>', '');
  refused(/embedded text \(v:textpath\)/, ...add, '--output', output);
  write(body, '<q:pPr><q:tabs><q:tab q:val="left" q:pos="720"/></q:tabs></q:pPr>');
  assert.equal(ok(...add, '--output', output).change.position, 4);
});

test('reserves comment anchor IDs from separate stories independently of revision IDs', (t) => {
  const path = temp(t);
  const input = path('anchored-stories.docx');
  const output = path('with-comment.docx');
  nativeFixture(input, '<q:p><q:r><q:t>Body</q:t></q:r><q:ins q:id="200"><q:r><q:t>!</q:t></q:r></q:ins></q:p>', {
    'word/header1.xml': `<q:hdr xmlns:q="${W}"><q:p><q:commentRangeStart q:id="+8"/>
      <q:r><q:t>Heading</q:t></q:r><q:commentRangeEnd q:id="8"/><q:r><q:commentReference q:id="8"/></q:r>
    </q:p></q:hdr>`,
  });
  const result = ok('add-comment', '--input', input, '--output', output, '--text', 'Review', '--author', AUTHOR, '--position', '4');
  assert.equal(result.comment.commentId, '9');
});

test('documents Word commands, their packages and their publication paths in the tool inventory', () => {
  const index = readFileSync(join(here, '..', '..', 'AGENTS.md'), 'utf8');
  assert.match(index, /### Documents[^]*?\| `word-document\/TOOL\.md` \|[^]*?### Knowledge/);
  assert.match(index, /\| `word-document` `help` \|/);
  assert.match(index, /\| Node packages \|[^\n]*node_modules[^\n]*word-document/);
  assert.match(index, /\|[^\n]*\.docx[^\n]*--output[^\n]*word-document/);
  assert.match(index, /\|[^\n]*\.wiser-word-document-\*[^\n]*kill[^\n]*word-document/);
});
