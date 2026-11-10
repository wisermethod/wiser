import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonBytes, stringBytes } from '../scripts/lib/size.js';
import { artifactFiles } from '../scripts/lib/render-core.js';
import { writeZip } from '../../lib/archive-core.js';

const encoder = new TextEncoder();
test('JSON projection counts exact escaped UTF-8, indentation, omissions and array nulls', () => {
  const values = [null, true, 1.23e-18, Infinity, 'é😀\ud800x\udfff\u0000\b\t\n\f\r"\\', '\ud800', {}, [],
    { 'é"\n': [undefined, NaN, null, 'x'], omitted:undefined, nested:{empty:[],bool:false}},
    {long:'😀'.repeat(5000),control:'\u0001'.repeat(5000)}];
  for (const value of values) {
    let projected = 0;
    jsonBytes(value, bytes => {projected += bytes;});
    assert.equal(projected,encoder.encode(JSON.stringify(value,null,2)).length);
  }
});

test('plain UTF-8 projection matches TextEncoder including lone surrogates', () => {
  for (const value of ['', 'é😀\ud800x\udfff\u0000"\\', '\ud800', '😀'.repeat(5000)]) {
    let projected = 0;
    stringBytes(value, bytes => {projected += bytes;});
    assert.equal(projected,encoder.encode(value).length);
  }
});

test('exactly 4 MiB including stored ZIP headers fits; one extra byte refuses before bundle stringify', async () => {
  const bundle = {schema_version:1,candidates:[],padding:''}, status = {};
  const names = ['harvest-candidates.json','harvest-run-status.json'];
  const overhead = 22 + names.reduce((sum,name) => sum + 76 + 2 * encoder.encode(name).length,0);
  const emptySize = encoder.encode(JSON.stringify(bundle,null,2) + '\n' + JSON.stringify(status,null,2) + '\n').length;
  bundle.padding = 'x'.repeat(4194304 - overhead - emptySize);
  const files = artifactFiles(bundle,status,{markdown:false});
  assert.equal((await writeZip(files,{maxBytes:4194304})).length,4194304);
  bundle.padding += 'x';
  const stringify = JSON.stringify;
  JSON.stringify = value => {if (value === bundle) throw Error('oversize bundle was stringified'); return stringify(value);};
  try { assert.throws(() => artifactFiles(bundle,status,{markdown:false}), error => error.fatal && /output exceeds.*projected/.test(error.message)); }
  finally {JSON.stringify = stringify;}
});

const bundleForMarkdown = () => ({run:{name:'test',consumer:'tests',timebox:{from:'a',to:'b'},topics:[]},candidates:[],clusters:[],rejected:[],errors:[]});
test('the combined JSON and Markdown budget refuses before candidate JSON is materialized', () => {
  const bundle = bundleForMarkdown();
  bundle.run.name = 'é'.repeat(600000);
  bundle.padding = 'x'.repeat(2000000);
  const stringify = JSON.stringify;
  JSON.stringify = value => {if (value === bundle) throw Error('oversize bundle was stringified'); return stringify(value);};
  try {assert.throws(() => artifactFiles(bundle,{}), error => error.fatal && /output exceeds.*projected/.test(error.message));}
  finally {JSON.stringify = stringify;}
});

test('Markdown-only output refuses whole while lines are being accumulated', () => {
  const bundle = bundleForMarkdown();
  bundle.clusters = Array.from({length:20}, () => ({title:'é'.repeat(110000),item_ids:['a'],top_score:1}));
  assert.throws(() => artifactFiles(bundle,{},{json:false}), error => error.fatal && /output exceeds.*projected/.test(error.message));
});

test('projection polls the deadline within a single long JSON string', () => {
  let checks = 0, charged = 0;
  assert.throws(() => jsonBytes({large:'x'.repeat(1000000)}, bytes => {charged += bytes;}, () => {
    if (++checks === 5) throw Error('projection deadline');
  }), /projection deadline/);
  assert.equal(checks,5);
  assert.ok(charged < 10000);
});
