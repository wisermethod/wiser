import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {launch} from '../../lib/browser-runtime/browser-runtime.js';
import {SAMPLE_FORM,FONT_HOSTS} from '../scripts/format.js';
import {mixedPictures} from './cases.js';
import {form,payload,serve,wait,stop,http,cli,dest,equal,delay,sentinel,listeners,cleanupAndScan} from './local-harness.js';

let browser,runtime;
before(async () => {
  runtime = await mkdtemp(join(tmpdir(),'wiser-form-browser-'));
  const previous = process.env.TMPDIR; process.env.TMPDIR = runtime;
  try {
    browser = await launch({headless:true,timeout:30000,env:{...process.env,TMPDIR:runtime},args:[
      '--disable-background-networking','--disable-component-update','--disable-sync','--disable-breakpad',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--disk-cache-size=0'
    ]});
  } finally { if (previous === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previous; }
});
after(async t => {
  try { await browser?.close(); }
  finally { if (runtime) await rm(runtime,{recursive:true,force:true}); await cleanupAndScan(t); }
});
async function pageAt(s,width = 390) {
  const context = await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  const errors = [],requests = [];
  await context.route('**/*',route => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    return url.origin === new URL(s.url).origin ? route.continue() : route.abort();
  });
  const page = await context.newPage(); page.on('pageerror',() => errors.push('page error'));
  try { await page.goto(s.url); await page.locator('#submit').waitFor(); }
  catch (error) { await context.close(); throw error; }
  return {context,page,errors,requests};
}
async function locked(page) {
  assert.equal(await page.locator('#form input:enabled,#form textarea:enabled,#form button:enabled,#form fieldset:enabled').count(),0,'every control must be disabled');
}
for (const width of [390,720]) test(`local page ${width}px: two questions, exact answers, sentHere and disabled controls`,async () => {
  const f = form('local-form'), s = await serve(f),h = await pageAt(s,width);
  try {
    assert.equal(await h.page.locator('fieldset').count(),2);
    assert.ok(await h.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),'no sideways scroll');
    assert.equal(await h.page.locator('#root').getAttribute('data-host'),'this computer');
    assert.equal(await h.page.locator('#root').getAttribute('data-source'),'local');
    await h.page.getByText('Warm',{exact:true}).click(); await h.page.locator('textarea').fill(sentinel);
    const pending = wait(s,5);
    await h.page.locator('#submit').click();
    equal(await pending,{status:'answered',...payload(f)},'wait returns exact answers and shown labels');
    await h.page.waitForFunction(() => document.getElementById('status').textContent === WiserForm.WORDS.sentHere);
    assert.equal(await h.page.locator('#status').innerText(),'Sent. You can close this window.'); await locked(h.page);
    assert.deepEqual(h.errors,[]);
    equal(await wait(s),{status:'answered',...payload(f)},'one replay returns the same result');
    assert.equal((await wait(s)).status,'gone');
  } finally { await h.context.close(); }
});
// Change 2: the local listener accepts word values and returns their ordered shown lines.
for(const width of [360,390,720])test(`local mixed pictures ${width}px: word values survive the listener with exact shown lines`,async()=>{
 const f=mixedPictures();f.id='mixed';const multi=mixedPictures('image-checkbox').questions[0];multi.id='many';f.questions.push(multi);
 const s=await serve(f),h=await pageAt(s,width);
 try{
  await h.page.locator('.q-image-radio .tile').first().click();
  await h.page.locator('.q-image-radio .choice').click();
  await h.page.locator('.q-image-checkbox .choice').click();
  await h.page.locator('.q-image-checkbox .tile').first().click();
  assert.deepEqual(await h.page.evaluate(()=>WiserForm.readAnswers().map(a=>({value:a.value,shown:a.shown}))),[
   {value:'neither',shown:'Neither'},{value:['neither','a'],shown:'Neither, A'}
  ]);
  await h.page.locator('#submit').click();await h.page.locator('#status.ok').waitFor();
  equal(await wait(s),{status:'answered',form:f.title,id:'mixed',answers:{look:'neither',many:['neither','a']},shown:[
   {id:'look',question:'Which look?',shown:'Neither'},{id:'many',question:'Which look?',shown:'Neither, A'}
  ]},'listener returns word values and shown lines unchanged');
  await locked(h.page);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('wait holds two seconds, later collection, one replay, then gone',async () => {
  const s = await serve(),begin = Date.now();
  equal(await wait(s,2),{status:'waiting',url:s.url},'unanswered wait returns waiting and URL');
  assert.ok(Date.now()-begin >= 2000 && Date.now()-begin <= 4000,'wait holds between two and four seconds');
  assert.equal((await http(s,'answers',{method:'POST',body:payload()})).status,200);
  const answer = await wait(s); equal(answer,{status:'answered',...payload()},'later wait collects');
  equal(await wait(s),answer,'third wait replays once'); assert.equal((await wait(s)).status,'gone');
});
test('two forms answered in the opposite order keep their own answers',async () => {
  const a = form('first'),b = form('second'); b.title = 'Second '+sentinel;
  const sa = await serve(a),sb = await serve(b);
  assert.notEqual(sa.port,sb.port); assert.notEqual(sa.code,sb.code);
  const wa = wait(sa,5),wb = wait(sb,5);
  assert.equal((await http(sb,'answers',{method:'POST',body:payload(b,'second '+sentinel)})).status,200);
  equal(await wb,{status:'answered',...payload(b,'second '+sentinel)},'second form result is isolated');
  assert.equal((await http(sa,'answers',{method:'POST',body:payload(a)})).status,200);
  equal(await wa,{status:'answered',...payload(a)},'first form result is isolated');
});
test('ttl 3: page closes and disables without sending; listener is gone',async () => {
  const s = await serve(undefined,['--ttl','3']),h = await pageAt(s);
  try {
    await h.page.waitForFunction(() => document.getElementById('status').textContent === WiserForm.WORDS.closed,{},{timeout:5000});
    assert.ok(Date.now() >= s.closes);
    assert.equal(await h.page.locator('#status').innerText(),'This form has closed. Go back to the chat to answer there.');
    await locked(h.page); assert.equal(h.requests.filter(path => path.endsWith('/answers')).length,0);
    await delay(100); assert.equal((await wait(s)).status,'gone'); await assert.rejects(http(s),{code:'ECONNREFUSED'});
  } finally { await h.context.close(); }
});
test('page failures preserve copy and retry; another tab produces alreadySent and locks',async () => {
  const s = await serve(),h = await pageAt(s);
  try {
    await h.page.getByText('Warm',{exact:true}).click(); await h.page.locator('textarea').fill(sentinel);
    for (const status of [0,400,500]) {
      await h.page.route('**/answers',route => status === 0 ? route.abort() : route.fulfill({status,body:'{}'}));
      await h.page.evaluate(() => WiserForm.setStatus([]));
      await h.page.locator('#submit').click(); await h.page.locator('#status.bad').waitFor();
      assert.equal(await h.page.locator('#status').innerText(),'Not sent. Press the button again, or copy the answers below into the chat.');
      assert.ok((await h.page.locator('#copy').innerText()).includes(sentinel),'answers remain copyable');
      assert.ok(await h.page.locator('#submit').isEnabled());
      await h.page.unroute('**/answers');
    }
    assert.equal((await http(s,'answers',{method:'POST',body:payload()})).status,200);
    await h.page.locator('#submit').click();
    await h.page.waitForFunction(() => document.getElementById('status').textContent === WiserForm.WORDS.alreadySent);
    assert.equal(await h.page.locator('#status').innerText(),'These answers were already sent.'); await locked(h.page);
    assert.ok((await h.page.locator('#copy').innerText()).includes(sentinel),'conflicting answers remain copyable');
  } finally { await h.context.close(); }
});
test('a failed submission settling after closing cannot re-enable the page',async () => {
  const s = await serve(undefined,['--ttl','2']),h = await pageAt(s);
  try {
    await h.page.route('**/answers',async route => { await delay(Math.max(0,s.closes-Date.now()+100)); await route.abort(); });
    await h.page.locator('#submit').click();
    await h.page.waitForFunction(() => document.getElementById('status').dataset.delivery === 'closed',{},{timeout:5000});
    assert.equal(await h.page.locator('#status').innerText(),'This form has closed. Go back to the chat to answer there.'); await locked(h.page);
  } finally { await h.context.close(); }
});
test('sample draws every shared question type and submits their original types',async () => {
  const s = await serve(null),h = await pageAt(s);
  try {
    assert.equal(await h.page.locator('fieldset').count(),6);
    for (const word of ['Bright','Dots','Waves','Contemporary','Website','Slides']) await h.page.getByText(word,{exact:true}).click();
    await h.page.locator('input[type=range]').fill('8'); await h.page.locator('textarea').fill(sentinel);
    await h.page.locator('#submit').click(); await h.page.locator('#status.ok').waitFor();
    const answer = await wait(s);
    equal(answer.answers,{mood:'bright',shapes:['dots','waves'],era:'contemporary',places:['website','slides'],loudness:8,never:sentinel},'all six value types retained');
    assert.equal(answer.shown.length,6); assert.equal(Object.hasOwn(answer,'id'),false); assert.deepEqual(h.errors,[]);
  } finally { await h.context.close(); }
});
test('routes, security headers, safe embedded form and closing timestamp',async () => {
  const f = form(); f.title = '</script><script>window.injected=true</script>';
  const s = await serve(f);
  for (const [suffix,method] of [['other','GET'],['answers','GET'],['','POST'],['result','POST'],['stop','GET']]) {
    const r = await http(s,suffix,{method}); assert.equal(r.status,404); assert.equal(r.text,'');
  }
  for (const suffix of ['', 'answers','result?wait=0','stop']) {
    const wrong = await http({...s,code:'0'.repeat(32)},suffix,{method:['answers','stop'].includes(suffix)?'POST':'GET'});
    assert.equal(wrong.status,404); assert.equal(wrong.text,'');
  }
  const response = await http(s);
  assert.equal(response.headers['cache-control'],'no-store');
  assert.equal(response.headers['content-security-policy'],`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src ${FONT_HOSTS.join(' ')}; connect-src 'self'; form-action 'none'; base-uri 'none'`);
  assert.ok(response.text.includes(`id="wiser-form-closes">${s.closes}</script>`));
  const h = await pageAt(s);
  try { assert.equal(await h.page.locator('h1').textContent(),f.title); assert.ok(await h.page.evaluate(() => window.injected === undefined)); }
  finally { await h.context.close(); }
  for (const raw of ['-1','3601','NaN','1.5']) assert.equal((await http(s,`result?wait=${raw}`)).status,400);
});
test('foreign Origin is refused for both POST routes; same origin is accepted',async () => {
  const s = await serve();
  for (const suffix of ['answers','stop']) assert.equal((await http(s,suffix,{method:'POST',body:payload(),headers:{Origin:'http://example.com'}})).status,403);
  assert.equal((await http(s,'answers',{method:'POST',body:payload(),headers:{Origin:`http://127.0.0.1:${s.port}`}})).status,200);
});
test('answer validation: exact ids, original types, options, ranges, text code points and ordered shown',async () => {
  const f = structuredClone(SAMPLE_FORM); f.id = 'validated';
  const s = await serve(f);
  const valid = {form:f.title,id:f.id,answers:{mood:null,shapes:[],era:'classic',places:['website'],loudness:5,never:'😀'.repeat(1000)},
    shown:f.questions.map(q => ({id:q.id,question:q.short||q.label,shown:'Shown'}))};
  const changes = [
    p => { p.answers.unknown = ''; },p => { delete p.answers.never; },p => { p.answers = []; },
    p => { p.form = 'wrong'; },p => { p.id = 'wrong'; },p => { delete p.id; },p => { p.extra = true; },
    p => { p.answers.mood = 'unknown'; },p => { p.answers.mood = []; },p => { p.answers.era = 1; },
    p => { p.answers.shapes = ['unknown']; },p => { p.answers.shapes = ['dots','dots']; },p => { p.answers.shapes = 'dots'; },
    p => { p.answers.places = ['website','website']; },p => { p.answers.places = [1]; },p => { p.answers.loudness = 11; },
    p => { p.answers.loudness = -1; },p => { p.answers.loudness = '5'; },p => { p.answers.never = '😀'.repeat(1001); },p => { p.answers.never = null; },
    p => { p.shown.reverse(); },p => { p.shown.pop(); },p => { p.shown[0].question = 1; },p => { p.shown[0].shown = []; },p => { p.shown = null; }
  ];
  for (const [i,change] of changes.entries()) {
    const invalid = structuredClone(valid); change(invalid);
    assert.equal((await http(s,'answers',{method:'POST',body:invalid})).status,400,`invalid answer case ${i+1} must return 400`);
  }
  assert.equal((await http(s,'answers',{method:'POST',body:valid})).status,200,'1000 code points and empty choices are valid');
  equal(await wait(s),{status:'answered',...valid},'valid data remains exact');
});
test('JSON only, malformed JSON and 256 KB limits with length and chunked bodies',async () => {
  const s = await serve();
  for (const type of ['text/plain','application/json; charset=utf-8','']) assert.equal((await http(s,'answers',{method:'POST',body:payload(),headers:{'Content-Type':type}})).status,415);
  assert.equal((await http(s,'answers',{method:'POST',body:'{'})).status,400);
  for (const chunked of [false,true]) assert.equal((await http(s,'answers',{method:'POST',body:'x'.repeat(262145),chunked})).status,413);
  const raw = JSON.stringify(payload()),boundary = raw+' '.repeat(262144-Buffer.byteLength(raw));
  assert.equal((await http(s,'answers',{method:'POST',body:boundary})).status,200,'exactly 256 KB is accepted');
});
test('stop resolves pending waits, repeated stop and wrong code return gone',async () => {
  const s = await serve(),pending = wait(s,5); await delay(150);
  assert.equal((await wait({...s,code:'0'.repeat(32)})).status,'gone');
  assert.equal((await stop(s)).status,'stopped'); assert.equal((await pending).status,'gone');
  assert.equal((await stop(s)).status,'gone'); assert.equal((await wait(s)).status,'gone');
});
test('SSH and denied bind produce no-window and no-listen without leaving children',async () => {
  const before = await listeners();
  for (const override of [{SSH_CONNECTION:'test'},{SSH_TTY:''},...(process.platform === 'linux' ? [{DISPLAY:undefined,WAYLAND_DISPLAY:undefined}] : [])]) {
    const r = await cli(['serve','--sample'],override);
    assert.equal(r.code,0); assert.equal(r.stderr,''); assert.equal(r.json.status,'no-window'); assert.ok(r.json.reason);
  }
  // Only tests set WISER_FORM_TEST_LISTEN_EPERM; the listener simulates EPERM at listen.
  const denied = await cli(['serve','--sample'],{WISER_FORM_TEST_LISTEN_EPERM:'1'});
  assert.equal(denied.code,0); assert.equal(denied.stderr,''); assert.equal(denied.json.status,'no-listen');
  assert.match(denied.json.reason,/^EPERM: this command was not allowed to listen on this computer; run it outside the tool's sandbox, or ask in chat\.$/);
  await delay(150); assert.deepEqual(await listeners(),before,'failed starts leave no process');
});
test('closed command flags, limits and bad forms fail before any listener starts',async () => {
  const before = await listeners();
  const args = [
    ['serve'],['serve','--sample','--form','/missing'],['serve','--form','relative.json'],
    ...['0','86401','1.5','Infinity'].map(n => ['serve','--sample','--ttl',n]),
    ['serve','--sample','--open','--help'],['serve','--sample','--ttl'],['serve','--sample','--sample'],['serve','--sample','--port','1'],
    ['wait'],['stop','--port','0','--code','0'.repeat(32)],['wait','--port','65536','--code','0'.repeat(32)],
    ['wait','--port','1','--code','A'.repeat(32)],['wait','--port','1','--code','0'.repeat(32),'--seconds','3601'],
    ['stop','--port','1','--code','0'.repeat(32),'--seconds','1'],['wait','--port','1','--code','0'.repeat(32),'--install']
  ];
  for (const command of args) { const r = await cli(command); assert.equal(r.code,1); assert.equal(r.stdout,''); assert.match(r.stderr,/help/); }
  const directory = await mkdtemp(join(tmpdir(),'wiser-form-invalid-'));
  try {
    const file = join(directory,'form.json'),f = form(); f.questions[0].type = 'unknown'; f.questions[1].id = f.questions[0].id;
    await writeFile(file,JSON.stringify(f));
    const r = await cli(['serve','--form',file],{SSH_CONNECTION:'test'});
    assert.equal(r.code,1); assert.equal(r.stdout,''); assert.match(r.stderr,/questions\[0\]\.type/); assert.match(r.stderr,/questions\[1\]\.id/);
  } finally { await rm(directory,{recursive:true,force:true}); }
  assert.deepEqual(await listeners(),before);
});
test('unused replay expires 60 seconds after first collection, replacing the shorter TTL',{timeout:65000},async () => {
  const s = await serve(undefined,['--ttl','3']);
  assert.equal((await http(s,'answers',{method:'POST',body:payload()})).status,200);
  assert.equal((await wait(s)).status,'answered');
  await delay(3500); assert.equal((await http(s)).status,200,'replay survives original closing time');
  await delay(57000); assert.equal((await wait(s)).status,'gone','unclaimed replay ends at 60 seconds');
});
