import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures.js';
import { INSTALL_ONCE, INSTALL_HELP } from '../consent.js';

const nodeScripts = [
  'Form/scripts/form.js', 'tag-audit/scripts/tag-audit.js', 'sitemap/scripts/sitemap.js', 'Content Harvester/scripts/harvest.js',
  'image/scripts/image.js', 'pages-functions/scripts/pages-functions.js', 'keynote-render/scripts/render.js',
  'data/scripts/data.js', 'icon-set/scripts/icon-set.js', 'render/scripts/render.js',
  'deck-export/scripts/deck.js', 'Browser Control/scripts/browser.js', 'video-render/scripts/video-render.js',
  '../skills/Build Brand/scripts/fonts.mjs',
];
for (const script of nodeScripts) test(`${script} help states the full consent scope`, t => {
  fixture(t);
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../'+script,import.meta.url)),'help'],{env:process.env,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');
  assert.ok(result.stdout.includes('--install          '+INSTALL_HELP),result.stdout);
});
test('video-render\'s install plan states the full consent scope', async () => {
  const { installPlan } = await import('../../video-render/scripts/dependencies.mjs');
  assert.ok(installPlan().split('\n')[0].endsWith(INSTALL_ONCE), installPlan());
});
const pythonScripts = [
  ['Transcribe Audio/scripts/transcribe.py',['help']],
  ['Transcribe Audio/scripts/transcribe.py',['align','--help']],
  ['knowledge-memory/scripts/knowledge_memory.py',['help']],
  ['Screen Capture/scripts/capture.py',['help']],
  ['Chatterbox/scripts/chatterbox_tool.py',['help']],
];
for (const [script,args] of pythonScripts) test(`${script} ${args.join(' ')} states the full consent scope`, t => {
  fixture(t);
  const result=spawnSync('python3.11',[fileURLToPath(new URL('../../'+script,import.meta.url)),...args],{env:process.env,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');
  assert.ok(result.stdout.includes('--install          '+INSTALL_HELP),result.stdout);
});
