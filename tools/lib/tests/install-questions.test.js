import './isolated-home.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {fixture} from './fixtures.js';
import {INSTALL_ONCE, INSTALL_HELP, INSTALL_COPY_ONLY, INSTALL_NOT_SAVED, installQuestion, formatInstallSize} from '../consent.js';

const once = "You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.";
const source = fileURLToPath(new URL('../../../',import.meta.url));
const rows = [
  ['Browser Control','browser.js','open web pages in a window of its own, without touching your own browser'],
  ['render','render.js','turn web pages, drawings and diagrams into image files'],
  ['deck-export','deck.js','build slide decks and save them as PDFs or slide images'],
  ['tag-audit','tag-audit.js','check which analytics and tracking tags a web page uses'],
  ['icon-set','icon-set.js','draw icons into your pictures'],
  ['sitemap','sitemap.js','read the list of pages a website publishes and spot what changed'],
  ['Content Harvester','harvest.js','gather and rank sources from the feeds and pages you name'],
  ['video-render','video-render.js','turn an animated page into a video'],
  ['image','image.js','edit images and layer one image over another'],
  ['keynote-render','render.js','build and edit Keynote decks'],
  ['pages-functions','pages-functions.js',"prepare your website's functions for Cloudflare Pages"],
  ['data','data.js','read your data files and draw charts from them'],
  ['Build Brand','fonts.mjs',"set your brand's type"],
  ['Build Brand family','fonts.mjs',"set your brand's type"],
];

// Keep the fixtures useful for all case branches; no installer/network is allowed.
for (const [tool,script,purpose] of rows) test(`${tool} refusal opens with the exact member question`, t => {
  const f=fixture(t);
  cpSync(join(source,'tools/lib'),f.lib,{recursive:true,filter:p => !p.split('/').some(n=>['node_modules','tests','__pycache__'].includes(n))});
  const relative = tool.startsWith('Build Brand') ? 'skills/Build Brand' : `tools/${tool}`;
  const dest=join(f.copy,relative);
  cpSync(join(source,relative,'scripts'),join(dest,'scripts'),{recursive:true});
  if (!tool.startsWith('Build Brand')) cpSync(join(source,relative,'package.json'),join(dest,'package.json'));
  const file=join(f.root,'input.html'), data=join(f.root,'input.csv'), output=join(f.root,'output.png');
  writeFileSync(file,'<p>test</p>');writeFileSync(data,'name,value\nx,1');
  const diagram=join(f.root,'diagram.mmd');writeFileSync(diagram,'graph TD; A-->B');
  const spec=join(f.root,'spec.json');writeFileSync(spec,JSON.stringify({slides:[{layout:'Title',title:'Test'}]}));
  const brand=join(f.root,'brand.yaml');writeFileSync(brand,'theme: Basic');
  const functions=join(f.root,'functions'), assets=join(f.root,'assets');mkdirSync(functions);mkdirSync(assets);
  const project=join(f.root,'project');mkdirSync(project);writeFileSync(join(project,'index.html'),'<main data-video-root>test</main>');
  const pack=join(f.root,'pack.tar');writeFileSync(pack,'fixture');
  const library=join(source,'skills/Build Brand/parts/parts.json');
  if(tool==='Content Harvester') {
    const sample=spawnSync(process.execPath,[join(dest,'scripts',script),'sample'],{env:process.env,encoding:'utf8'});
    const request=JSON.parse(sample.stdout);request.output.directory=join(f.root,'harvest');
    writeFileSync(join(f.root,'request.json'),JSON.stringify(request));
  }
  const args={
    'Browser Control':['session','start','--profile',join(f.root,'profile'),'--port','1'],
    render:['mermaid','--file',diagram,'--output',output],
    'deck-export':['scaffold','--output',join(f.root,'deck')],
    'tag-audit':['audit','--url','https://example.com'],
    'icon-set':['get','--set','phosphor','--name','house','--weight','regular','--size','24','--color','black','--output',join(f.root,'icon.svg')],
    sitemap:['fetch','--domain','example.com'],
    'Content Harvester':['run','--request',join(f.root,'request.json')],
    'video-render':['sequence','--project',project,'--output',join(f.root,'frames'),'--width','32','--height','24','--fps','1','--duration','1'],
    image:['edit','--file',file,'--output',output,'--grayscale'],
    'keynote-render':['build','--spec',spec,'--brand',brand,'--out',join(f.root,'deck.key')],
    'pages-functions':['build','--functions',functions,'--assets',assets,'--out',join(f.root,'compiled')],
    data:['parse','--file',data],
    'Build Brand':['check','--library',library,'--directory',join(f.root,'fonts'),'--from',pack],
    'Build Brand family':['check','--library',library,'--directory',join(f.root,'fonts'),'--from',assets,'--family',Object.keys(JSON.parse(readFileSync(library)).fonts)[0]],
  }[tool];
  const result=spawnSync(process.execPath,[join(dest,'scripts',script),...args],{env:process.env,encoding:'utf8',timeout:30000});
  assert.equal(result.status,1,result.stdout+result.stderr);assert.equal(result.stdout,'');
  const [first,blank,details]=result.stderr.split('\n');
  assert.ok(first.startsWith('This Wiser skill needs to '),result.stderr);
  assert.ok(first.endsWith(tool === 'Build Brand family' ? 'This yes covers only these typefaces.' : once),first);assert.ok(first.includes('in order to '+purpose+'.'),first);
  assert.equal(blank,'');assert.ok(details.startsWith('Details for the assistant: '),result.stderr);
  if (tool === 'render') assert.ok(first.includes("It's about 84 MB, or about 660 MB with the browser."),first);
  const whatAndSize = {
    'Browser Control': ["the code that drives a browser (and a private copy of the Chromium browser, if you don't have it yet)", '19 MB, or about 600 MB with the browser'],
    render: ["the Mermaid diagram library and the code that drives a browser (and a private copy of the Chromium browser, if you don't have it yet)", '84 MB, or about 660 MB with the browser'],
    'deck-export': ['the reveal.js slide library','6.0 MB'],
    'tag-audit': ['a small web-request library','1.6 MB'],
    'icon-set': ['the Phosphor and Health Icons icon sets','4.7 MB'],
    sitemap: ['a small web-request library','1.6 MB'],
    'Content Harvester': ['a feed reader and a small web-request library','3.8 MB'],
    'video-render': ["the HyperFrames video renderer (and the copy of Chrome it uses, if you don't have it yet)",'140 MB, or about 340 MB with Chrome'],
    image: ['the sharp image library','17 MB'],
    'keynote-render': ['a small file-format library','1.3 MB'],
    'pages-functions': ["Cloudflare's Wrangler tool",'210 MB'],
    data: ['a spreadsheet-file reader','1.5 MB'],
    'Build Brand': ["Wiser's brand font pack"],
    'Build Brand family': ['the Fraunces typeface'],
  }[tool];
  const [what,size] = whatAndSize;
  assert.equal(first,tool.startsWith('Build Brand')
    ? `This Wiser skill needs to install ${what} on your machine from a copy you already have, in order to ${purpose}. ${tool === 'Build Brand family' ? 'This yes covers only these typefaces.' : once}`
    : `This Wiser skill needs to download and install ${what} on your machine in order to ${purpose}.${size ? " It's about "+size+'.' : ''} ${once}`);
  if (tool === 'deck-export') assert.ok(!result.stderr.includes(f.home), result.stderr);
});

test('Browser Control without Playwright gives the conditional browser and both sizes', t => {
  const f=fixture(t), dest=join(f.copy,'tools/Browser Control/scripts');
  cpSync(join(source,'tools/Browser Control/scripts'),dest,{recursive:true});
  const result=spawnSync(process.execPath,[join(dest,'browser.js'),'session','start','--profile',join(f.root,'profile'),'--port','1'],{env:process.env,encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);
  assert.equal(result.stdout,'');
  assert.equal(result.stderr.split('\n')[0],`This Wiser skill needs to download and install the code that drives a browser (and a private copy of the Chromium browser, if you don't have it yet) on your machine in order to open web pages in a window of its own, without touching your own browser. It's about 19 MB, or about 600 MB with the browser. ${once}`);
});

test('Build Brand one-family and two-family refusals use the exact typeface wording', t => {
  const f=fixture(t), dest=join(f.copy,'skills/Build Brand/scripts');
  cpSync(join(source,'skills/Build Brand/scripts'),dest,{recursive:true});
  const assets=join(f.root,'assets');mkdirSync(assets);
  for (const [families,what,size] of [
    [['Fraunces'],'the Fraunces typeface','0.2 MB'],
    [['Fraunces','Instrument Sans'],'the Fraunces and Instrument Sans typefaces','0.3 MB'],
    [['Fraunces','Instrument Sans','Newsreader'],'the Fraunces, Instrument Sans and Newsreader typefaces','0.5 MB'],
  ]) {
    const result=spawnSync(process.execPath,[join(dest,'fonts.mjs'),'check','--library',join(source,'skills/Build Brand/parts/parts.json'),'--directory',join(f.root,'fonts'),'--from',assets,...families.flatMap(family=>['--family',family])],{env:process.env,encoding:'utf8'});
    assert.equal(result.status,1,result.stderr);assert.equal(result.stdout,'');
    assert.equal(result.stderr.split('\n')[0],`This Wiser skill needs to install ${what} on your machine from a copy you already have, in order to set your brand's type. This yes covers only these typefaces.`);
  }
});

test('Node, video-render and every Python reader use byte-identical shared copy', async () => {
  assert.equal(INSTALL_ONCE,once);
  assert.equal(INSTALL_HELP,'Say yes to the download this tool needs. '+once);
  assert.equal(INSTALL_COPY_ONLY,"Wiser will install this, but it can only remember your yes until the next Wiser update, so you may be asked again then. Reason: ");
  assert.equal(INSTALL_NOT_SAVED,"Wiser will install this now, but it couldn't remember your yes, so you'll be asked again next time. Reason: ");
  assert.equal(installQuestion('x','y'),`This Wiser skill needs to download and install x on your machine in order to y. ${once}`);
  assert.equal(installQuestion('x','y','4.7 MB'),`This Wiser skill needs to download and install x on your machine in order to y. It's about 4.7 MB. ${once}`);
  for (const [mb,size] of [[0.2,'200 KB'],[4.7,'4.7 MB'],[10,'10 MB'],[82,'82 MB'],[100,'100 MB'],[138,'140 MB'],[340,'340 MB'],[995,'1.0 GB'],[1000,'1.0 GB'],[4617,'4.6 GB']]) {
    assert.equal(formatInstallSize(mb*1e6),size);
  }
  const video=await import('../../video-render/scripts/dependencies.mjs');
  assert.equal(video.INSTALL_ONCE,once);assert.equal(video.INSTALL_HELP,INSTALL_HELP);
  for(const file of ['Transcribe Audio/scripts/transcribe.py','Transcribe Audio/scripts/align.py','knowledge-memory/scripts/graph_runtime.py','Screen Capture/scripts/install.py','Chatterbox/scripts/chatterbox_tool.py']) {
    const result=spawnSync('python3.11',['-B','-c',`import ast,json,sys
body=ast.parse(open(sys.argv[1]).read()).body
print(json.dumps({n.targets[0].id:ast.literal_eval(n.value) for n in body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ('INSTALL_ONCE','INSTALL_HELP','INSTALL_COPY_ONLY','INSTALL_NOT_SAVED')}))`,join(source,'tools',file)],{encoding:'utf8',env:process.env});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout),{INSTALL_ONCE,INSTALL_HELP,INSTALL_COPY_ONLY,INSTALL_NOT_SAVED},file);
  }
});

for (const [tool,script,args,purpose] of [
  ['render','render.js',['html'],'turn web pages, drawings and diagrams into image files'],
  ['deck-export','deck.js',['pdf'],'build slide decks and save them as PDFs or slide images'],
]) test(`${tool} browser-only refusal keeps the measured browser size`, t => {
  const f=fixture(t);
  cpSync(join(source,'tools/lib'),f.lib,{recursive:true,filter:p => !p.split('/').some(n=>['node_modules','tests','__pycache__'].includes(n))});
  const dest=join(f.copy,'tools',tool);
  cpSync(join(source,'tools',tool,'scripts'),join(dest,'scripts'),{recursive:true});
  cpSync(join(source,'tools',tool,'package.json'),join(dest,'package.json'));
  // Use the pinned installed runtime, while choosing an empty browser cache.
  const installed=join(source,'tools/lib/browser-runtime/node_modules');
  if(!existsSync(join(installed,'playwright/package.json'))) { t.skip('pinned runtime is not installed');return; }
  symlinkSync(installed,join(f.runtime,'node_modules'),'dir');
  const input=join(f.root,'input.html');writeFileSync(input,'<html><body>test</body></html>');
  const options=tool==='render' ? ['--input',input,'--output',join(f.root,'output.png')] : ['--input',input,'--output',join(f.root,'output.pdf')];
  const result=spawnSync(process.execPath,[join(dest,'scripts',script),...args,...options],{env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:join(f.root,'absent-browsers')},encoding:'utf8',timeout:30000});
  assert.equal(result.status,1,result.stderr);assert.equal(result.stdout,'');
  assert.equal(result.stderr.split('\n')[0],`This Wiser skill needs to download and install a private copy of the Chromium browser on your machine in order to ${purpose}. It's about 580 MB. ${once}`);
  assert.ok(result.stderr.includes('\n\nDetails for the assistant: '));
});

for (const present of [false, true]) test(`render mermaid with Playwright present and Chromium ${present ? 'present' : 'absent'} names exactly the fetch`, t => {
  const f=fixture(t), dest=join(f.copy,'tools/render');
  cpSync(join(source,'tools/render/scripts'),join(dest,'scripts'),{recursive:true});
  cpSync(join(source,'tools/render/package.json'),join(dest,'package.json'));
  symlinkSync(join(source,'tools/lib/browser-runtime/node_modules'),join(f.runtime,'node_modules'),'dir');
  const input=join(f.root,'diagram.mmd');writeFileSync(input,'graph TD; A-->B');
  const browsers=present ? process.env.WISER_TEST_PLAYWRIGHT_CACHE : join(f.root,'empty-browsers');
  assert.ok(browsers, 'the runner supplies the read-only installed browser cache');
  const result=spawnSync(process.execPath,[join(dest,'scripts/render.js'),'mermaid','--file',input,'--output',join(f.root,'output.png')],{env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:browsers},encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);assert.equal(result.stdout,'');
  assert.equal(result.stderr.split('\n')[0],`This Wiser skill needs to download and install the Mermaid diagram library${present ? '' : ' and a private copy of the Chromium browser'} on your machine in order to turn web pages, drawings and diagrams into image files. It's about ${present ? '65 MB' : '640 MB'}. ${once}`);
  if (present) {
    assert.ok(!/Chromium|browser|cdn.playwright.dev|playwright.download.prss.microsoft.com/.test(result.stderr), result.stderr);
  } else assert.ok(result.stderr.includes('cdn.playwright.dev'), result.stderr);
  assert.ok(!result.stderr.includes('fetches playwright'), result.stderr);
});

test('video-render browser-only refusal uses the measured 200 MB', async () => {
  const {prepareRuntime}=await import('../../video-render/scripts/dependencies.mjs');
  await assert.rejects(prepareRuntime({}, {
    run:command=>({status:0,stdout:`${command} version fixture\n`}),
    packages:async()=>({ok:true,version:'0.8.134'}),
    probe:async()=>({launches:false,failure:'missing'}),
    consent:{installAuthorised:()=>false},
  }), error => {
    assert.equal(error.message.split('\n')[0],`This Wiser skill needs to download and install the copy of Chrome the video renderer uses on your machine in order to turn an animated page into a video. It's about 200 MB. ${once}`);
    assert.ok(error.message.includes('\n\nDetails for the assistant: '));
    assert.ok(!error.message.includes('registry.npmjs.org'),error.message);
    assert.ok(error.message.includes('storage.googleapis.com/chrome-for-testing-public'));
    assert.ok(error.message.includes('~/.cache/hyperframes/chrome/'));
    return true;
  });
});

test('revision 4 measured sizes and rounded boundaries agree in Node, video and all five Python copies', async () => {
  const cases = [[20282,'20 KB'],[40000,'40 KB'],[999600,'1.0 MB'],[9960000,'10 MB'],[100000000,'100 MB'],[999600000,'1.0 GB'],
    [19120128,'19 MB'],[19120128+578678784,'600 MB'],[578678784,'580 MB'],
    [64602112+19120128,'84 MB'],[64602112+19120128+578678784,'660 MB'],[64602112+578678784,'640 MB'],[64602112,'65 MB'],
    [1499136,'1.5 MB'],[16936960,'17 MB'],[137646080,'140 MB'],[137646080+202039296,'340 MB'],[202039296,'200 MB'],[(1.3+3.0)*1024**3,'4.6 GB']];
  const video=await import('../../video-render/scripts/dependencies.mjs');
  for (const [bytes,expected] of cases) {
    assert.equal(formatInstallSize(bytes),expected,`${bytes} Node`);
    assert.equal(video.formatInstallSize(bytes),expected,`${bytes} video`);
  }
  const expected=cases.map(row=>row[1]);
  for (const file of ['Transcribe Audio/scripts/transcribe.py','Transcribe Audio/scripts/align.py','knowledge-memory/scripts/graph_runtime.py','Screen Capture/scripts/install.py','Chatterbox/scripts/chatterbox_tool.py']) {
    const result=spawnSync('python3.11',['-B','-c',`import ast,json,sys
body=ast.parse(open(sys.argv[1]).read()).body
selected=[n for n in body if isinstance(n,ast.FunctionDef) and n.name=='install_size']
assert len(selected)==1
scope={}
exec(compile(ast.Module(body=selected,type_ignores=[]),sys.argv[1],'exec'),scope)
print(json.dumps([scope['install_size'](v) for v in json.loads(sys.argv[2])]))`,join(source,'tools',file),JSON.stringify(cases.map(row=>row[0]))],{encoding:'utf8',env:process.env});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout),expected,file);
  }
});

test('deck pdf missing runtime details name no reveal.js', t => {
  const f=fixture(t),dest=join(f.copy,'tools/deck-export');
  cpSync(join(source,'tools/deck-export/scripts'),join(dest,'scripts'),{recursive:true});
  cpSync(join(source,'tools/deck-export/package.json'),join(dest,'package.json'));
  const input=join(f.root,'deck.html');writeFileSync(input,'<html>fixture</html>');
  const result=spawnSync(process.execPath,[join(dest,'scripts/deck.js'),'pdf','--input',input,'--output',join(f.root,'deck.pdf')],{env:process.env,encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);assert.equal(result.stdout,'');
  assert.equal(result.stderr.split('\n')[0],`This Wiser skill needs to download and install the code that drives a browser (and a private copy of the Chromium browser, if you don't have it yet) on your machine in order to build slide decks and save them as PDFs or slide images. It's about 19 MB, or about 600 MB with the browser. ${once}`);
  assert.ok(!result.stderr.includes('reveal.js'),result.stderr);
});

test('Build Brand local family question covers only these typefaces without download or size', t => {
  const f=fixture(t),dest=join(f.copy,'skills/Build Brand/scripts');
  cpSync(join(source,'skills/Build Brand/scripts'),dest,{recursive:true});
  const assets=join(f.root,'assets');mkdirSync(assets);
  const result=spawnSync(process.execPath,[join(dest,'fonts.mjs'),'check','--library',join(source,'skills/Build Brand/parts/parts.json'),'--directory',join(f.root,'fonts'),'--from',assets,'--family','Architects Daughter'],{env:process.env,encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);assert.equal(result.stdout,'');
  assert.equal(result.stderr.split('\n')[0],"This Wiser skill needs to install the Architects Daughter typeface on your machine from a copy you already have, in order to set your brand's type. This yes covers only these typefaces.");
  assert.ok(!result.stderr.includes(once), result.stderr);
  assert.ok(!/download|\b[KMGT]B\b/.test(result.stderr),result.stderr);
});
