import '../../lib/tests/isolated-home.js';
import test,{before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {mkdtemp,mkdir,cp,symlink,writeFile,readFile,readdir,rm,realpath,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {connect} from 'node:net';
import {SAMPLE_FORM} from '../scripts/format.js';

const source = fileURLToPath(new URL('../',import.meta.url));
const browserSource = fileURLToPath(new URL('../../Browser Control/',import.meta.url));
const runtimeSource = fileURLToPath(new URL('../../lib/browser-runtime/',import.meta.url));
const consentSource = fileURLToPath(new URL('../../lib/consent.js',import.meta.url));
const delay = ms => new Promise(done => setTimeout(done,ms));
let root,copy,script,browser;
const children = new Set(),seenListeners = new Map();

function env() {
  const value = {...process.env,HOME:join(root,'home'),USERPROFILE:join(root,'home'),XDG_CONFIG_HOME:'',APPDATA:'',TMPDIR:join(root,'runtime'),DISPLAY:':form-test'};
  delete value.SSH_CONNECTION; delete value.SSH_TTY; delete value.WISER_ALLOW_INSTALL;
  return value;
}
function command(file,args,overrides = {},options = {}) {
  const child = spawn(process.execPath,[file,...args],{...options,env:{...env(),...overrides},stdio:['ignore','pipe','pipe']});
  children.add(child);
  let stdout = '',stderr = '';
  child.stdout.on('data',chunk => { stdout += chunk; });
  child.stderr.on('data',chunk => { stderr += chunk; });
  const done = new Promise((accept,reject) => {
    child.once('error',reject);
    child.once('close',(code,signal) => { children.delete(child); accept({code,signal,stdout,stderr}); });
  });
  return {child,done};
}
async function bc(args) {
  const r = await command(browser,[...args,'--port','4395']).done;
  assert.equal(r.code,0,r.stderr); return JSON.parse(r.stdout);
}
async function processes() {
  return new Promise((accept,reject) => execFile('ps',['-axo','pid=,ppid=,command='],{env:env()},(error,out) => error ? reject(error) : accept(out.split('\n'))));
}
async function listenerPids() {
  return (await processes()).filter(line => line.trim().endsWith(join(copy,'tools/Form/scripts/listener.js'))).map(line => Number(line.trim().split(/\s+/)[0]));
}
async function observeListener(pid) {
  for (const line of await processes()) {
    const fields = line.trim().split(/\s+/);
    if (Number(fields[1]) === pid && line.trim().endsWith('listener.js')) seenListeners.set(Number(fields[0]),true);
  }
}
async function portOpen(port) {
  return new Promise((accept,reject) => {
    const socket = connect({host:'127.0.0.1',port});
    socket.once('connect',() => { socket.destroy(); accept(true); });
    socket.once('error',error => error.code === 'ECONNREFUSED' ? accept(false) : reject(error));
  });
}
async function profiles() { return (await readdir(join(root,'runtime'))).filter(name => name.startsWith('wiser-form-ask-')); }
function json(r,stderr = '') {
  assert.equal(r.code,0,r.stderr); assert.equal(r.signal,null);
  assert.equal(r.stdout.split('\n').length,2,'exactly one JSON line');
  assert.equal(r.stderr,stderr); return JSON.parse(r.stdout);
}
async function waitForFile(file) {
  for (let i = 0; i < 400; i++) {
    try { return await readFile(file,'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await delay(25);
  }
  assert.fail(`test marker did not arrive: ${file}`);
}
async function clean({url,profile,reused = false,kept = false} = {}) {
  assert.deepEqual(await listenerPids(),[],'no form listener process remains');
  if (url) assert.equal(await portOpen(Number(new URL(url).port)),false,'form port closed before output');
  assert.deepEqual(await profiles(),kept ? [basename(profile)] : [],'only an unsettled host keeps its temporary profile');
  if (kept) await access(profile);
  if (profile && !reused && !kept) await assert.rejects(readFile(join(profile,'host-stderr.log')),{code:'ENOENT'});
  const status = await bc(['session','status']);
  assert.equal(status.running,reused,'only a reused host may remain');
  assert.equal(await portOpen(4395),reused,'host port closed before output unless reused');
  if (reused) assert.equal(status.profile,profile);
  if (profile && !reused) assert.equal((await processes()).some(line => line.includes('server.js --port 4395 --profile '+profile)),false,'owned host process exited');
}
async function ready(run) {
  for (let i = 0; i < 150; i++) {
    await observeListener(run.child.pid);
    const status = await bc(['session','status']);
    if (status.running && /^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{32}\/$/.test(status.url || '')) {
      const viewport = await bc(['execute','--code','({width:innerWidth,height:innerHeight,button:!!document.getElementById("submit")})']);
      if (viewport.result?.width === 480 && viewport.result.height === 900 && viewport.result.button) return status;
    }
    if (run.child.exitCode !== null) assert.fail(`ask ended before the page was ready: ${JSON.stringify(await run.done)}`);
    await delay(50);
  }
  assert.fail('ask page did not become ready');
}
async function submit() {
  return (await bc(['execute','--code',`(() => {
    document.querySelector('input[value="bright"]').click();
    document.querySelector('textarea').value = 'A scripted answer';
    const rows = WiserForm.readAnswers();
    const result = {status:'answered',form:document.querySelector('h1').textContent,
      answers:Object.fromEntries(rows.map(row => [row.id,row.value])),
      shown:rows.map(({id,question,shown}) => ({id,question,shown}))};
    document.getElementById('submit').click(); return result;
  })()`])).result;
}
async function copyTool(directory,installed) {
  await mkdir(join(directory,'tools/lib'),{recursive:true});
  await cp(join(source,'scripts'),join(directory,'tools/Form/scripts'),{recursive:true});
  await cp(join(source,'engine'),join(directory,'tools/Form/engine'),{recursive:true});
  await cp(join(source,'package.json'),join(directory,'tools/Form/package.json'));
  await cp(join(browserSource,'scripts'),join(directory,'tools/Browser Control/scripts'),{recursive:true});
  await cp(join(browserSource,'package.json'),join(directory,'tools/Browser Control/package.json'));
  await cp(consentSource,join(directory,'tools/lib/consent.js'));
  await cp(new URL('../../lib/user-config.js',import.meta.url),join(directory,'tools/lib/user-config.js'));
  if (!installed) await cp(runtimeSource,join(directory,'tools/lib/browser-runtime'),{recursive:true,filter:path => !path.includes('node_modules')});
  await writeFile(join(directory,'package.json'),'{"type":"module"}');
  await writeFile(join(directory,'tools/AGENTS.md'),'Test copy; no install consent.\n');
  if (installed) await symlink(runtimeSource,join(directory,'tools/lib/browser-runtime'),'dir');
}

before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(),'wiser-form-ask-tests-')));
  await mkdir(join(root,'runtime'));
  copy = join(root,'installed'); await copyTool(copy,true);
  script = join(copy,'tools/Form/scripts/form.js'); browser = join(copy,'tools/Browser Control/scripts/browser.js');
  assert.equal((await bc(['session','status'])).running,false,'4395 must be free; never stop another session for tests');
});
async function recover() {
  // Recovery is deliberately after the assertions, so a broken cleanup fails.
  for (const child of children) child.kill('SIGKILL');
  for (const pid of [...seenListeners.keys(),...await listenerPids()]) { try { process.kill(pid,'SIGTERM'); } catch {} }
  const status = await bc(['session','status']);
  if (status.running && status.profile?.startsWith(root+'/')) await bc(['session','stop']);
  // A startup fault can leave a detached host that has not bound its port yet.
  for (const line of await processes()) {
    if (line.includes(join(copy,'tools/Browser Control/scripts/server.js')+' --port 4395')) {
      try { process.kill(Number(line.trim().split(/\s+/)[0]),'SIGKILL'); } catch {}
    }
  }
  for (const name of await profiles()) await rm(join(root,'runtime',name),{recursive:true,force:true});
  await delay(100); seenListeners.clear();
}
afterEach(recover);
after(async () => {
  await recover();
  await rm(root,{recursive:true,force:true});
});

test('ask answered: scripted Browser Control submit has the wait shape and cleans everything',{timeout:30000},async () => {
  const run = command(script,['ask','--sample','--headless']);
  const status = await ready(run),expected = await submit();
  const result = json(await run.done);
  assert.deepEqual(result,expected);
  assert.equal(result.form,SAMPLE_FORM.title); assert.equal(result.answers.mood,'bright');
  assert.equal(result.shown.length,6); assert.equal(Object.hasOwn(result,'id'),false);
  await clean(status);
});
test('ask unanswered: short wait cleans the listener, host and profile',{timeout:30000},async () => {
  const run = command(script,['ask','--sample','--headless','--seconds','3']);
  const status = await ready(run);
  assert.deepEqual(json(await run.done),{status:'unanswered'}); await clean(status);
});
test('ask refusal and preflight: same output and exit as serve, no listener, host or profile',{timeout:30000},async () => {
  const file = join(root,'refused.json');
  await writeFile(file,JSON.stringify({title:5,questions:[]}));
  const refused = await command(script,['serve','--form',file]).done;
  assert.equal(refused.code,1); assert.equal(refused.stdout,'');
  assert.deepEqual(await command(script,['ask','--form',file,'--headless']).done,refused);
  await clean();
  for (const overrides of [{SSH_CONNECTION:'test'},{SSH_TTY:''},{WISER_FORM_TEST_LISTEN_EPERM:'1'}]) {
    const expected = await command(script,['serve','--sample'],overrides).done;
    assert.deepEqual(await command(script,['ask','--sample','--headless'],overrides).done,expected);
    assert.ok(['no-window','no-listen'].includes(JSON.parse(expected.stdout).status));
    await clean();
  }
  for (const args of [[],['--sample','--form',file],['--form','relative'],['--sample','--seconds','0'],
    ['--sample','--seconds','3601'],['--sample','--seconds','1.5'],['--sample','--ttl','0'],['--sample','--ttl','86401'],
    ['--sample','--headless','--headless'],['--sample','--install','--install'],['--sample','--unknown','--help'],['--sample','--port','4395']]) {
    const result = await command(script,['ask',...args]).done;
    assert.equal(result.code,1); assert.equal(result.stdout,''); assert.match(result.stderr,/help/);
    await clean();
  }
  await clean();
});
test('ask reuses a host on 4395 and leaves it running while cleaning its own listener',{timeout:30000},async () => {
  const profile = join(root,'reused-profile');
  await bc(['session','start','--profile',profile,'--headless']);
  try {
    const run = command(script,['ask','--sample','--headless','--seconds','3']);
    const status = await ready(run);
    assert.equal(status.profile,profile);
    assert.deepEqual(await profiles(),[],'reuse never makes a profile');
    assert.deepEqual(json(await run.done),{status:'unanswered'});
    await clean({...status,reused:true});
  } finally { await bc(['session','stop']); }
});
for (const missing of [false,true]) test(`ask recovers an orphan host with its profile ${missing ? 'already gone' : 'still present'}`,{timeout:30000},async () => {
  const profile = await mkdtemp(join(root,'runtime','wiser-form-ask-'));
  await bc(['session','start','--profile',profile,'--headless']);
  if (missing) await rm(profile,{recursive:true,force:true});
  const run = command(script,['ask','--sample','--headless']);
  const status = await ready(run);
  assert.equal(status.profile,profile,'navigate the orphan instead of starting another host');
  const expected = await submit();
  assert.deepEqual(json(await run.done),expected);
  await clean(status);
});
for (const signal of ['SIGTERM','SIGINT','SIGHUP']) test(`ask ${signal} while waiting cleans the listener, host and profile`,{timeout:30000},async () => {
  const run = command(script,['ask','--sample','--headless']);
  const status = await ready(run); run.child.kill(signal);
  assert.deepEqual(json(await run.done),{status:'interrupted',signal}); await clean(status);
});
test('ask install reports: package and Chromium consent leave no listener or profile',{timeout:30000},async () => {
  const missing = join(root,'missing'); await copyTool(missing,false);
  const run = command(join(missing,'tools/Form/scripts/form.js'),['ask','--sample','--headless']);
  while (run.child.exitCode === null) { await observeListener(run.child.pid); await delay(5); }
  const result = json(await run.done);
  assert.equal(result.status,'needs-install');
  assert.equal(result.question,"This Wiser skill needs to download and install the code that drives a browser (and a private copy of the Chromium browser, if you don't have it yet) on your machine in order to show your form in a window of its own. It's about 19 MB, or about 600 MB with the browser. You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.");
  assert.match(result.report,/Details for the assistant: this tool is not installed yet/);
  assert.match(result.report,/registry\.npmjs\.org/); assert.match(result.report,/cdn\.playwright\.dev/);
  assert.match(result.reason,/yes means running ask again with --install/);
  const leftover = (await processes()).filter(line => line.trim().endsWith(join(missing,'tools/Form/scripts/listener.js')));
  assert.deepEqual(leftover,[],'install refusal leaves no listener');
  for (const pid of seenListeners.keys()) assert.throws(() => process.kill(pid,0),{code:'ESRCH'},'observed listeners have exited');
  await clean();
  await assert.rejects(readFile(join(missing,'.wiser-consent')),{code:'ENOENT'});

  const chromium = join(root,'missing-chromium'); await copyTool(chromium,true);
  const chromiumRun = command(join(chromium,'tools/Form/scripts/form.js'),['ask','--sample','--headless'],{
    PLAYWRIGHT_BROWSERS_PATH:join(root,'absent-browser')
  });
  while (chromiumRun.child.exitCode === null) { await observeListener(chromiumRun.child.pid); await delay(5); }
  const chromiumResult = json(await chromiumRun.done);
  assert.equal(chromiumResult.status,'needs-install');
  assert.equal(chromiumResult.question,"This Wiser skill needs to download and install a private copy of the Chromium browser on your machine in order to show your form in a window of its own. It's about 580 MB. You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.");
  assert.match(chromiumResult.report,/Details for the assistant: this tool's packages are installed but the Chromium build they drive is not/);
  assert.match(chromiumResult.report,/has not authorised a Wiser install\./);
  assert.match(chromiumResult.report,/No package is fetched and npm is not run/);
  assert.match(chromiumResult.reason,/yes means running ask again with --install/);
  assert.deepEqual((await processes()).filter(line => line.trim().endsWith(join(chromium,'tools/Form/scripts/listener.js'))),[]);
  for (const pid of seenListeners.keys()) assert.throws(() => process.kill(pid,0),{code:'ESRCH'});
  await clean();
  await assert.rejects(readFile(join(chromium,'.wiser-consent')),{code:'ENOENT'});
});

// Faults live only in copied scripts, never in production flags.
async function withBrowserFault(condition,body,fn) {
  const original = await readFile(browser);
  const real = join(copy,'tools/Browser Control/scripts/real-browser.js');
  await writeFile(real,original);
  await writeFile(browser,`import {spawnSync} from 'node:child_process';
    const args = process.argv.slice(2);
    const matches = ${condition};
    ${body}
    const r = spawnSync(process.execPath,[${JSON.stringify(real)},...args],{stdio:'inherit'});
    process.exit(r.status ?? 1);`);
  try { await fn(); }
  finally { await writeFile(browser,original); await rm(real); }
}
async function withLocalFault(body,fn) {
  const local = join(copy,'tools/Form/scripts/local.js'),real = join(copy,'tools/Form/scripts/real-local.js');
  const original = await readFile(local);
  await writeFile(real,original);
  await writeFile(local,`export {serve} from './real-local.js';
    import {localRequest as request} from './real-local.js';
    import {writeFile,access} from 'node:fs/promises';
    export async function localRequest(...args) {
      const result = await request(...args);
      ${body}
      return result;
    }`);
  try { await fn(); }
  finally { await writeFile(local,original); await rm(real); }
}
test('ask process-group SIGINT during host startup leaves no host, listener or profile',{timeout:30000},async () => {
  const server = join(copy,'tools/Browser Control/scripts/server.js'),original = await readFile(server);
  const held = join(root,'start-held'),release = join(root,'start-release'),listening = join(root,'start-listening');
  await writeFile(server,original.toString().replace('const TOOL_DIR =',`
    writeFileSync(${JSON.stringify(held)},String(process.pid));
    while (!existsSync(${JSON.stringify(release)})) await new Promise(done => setTimeout(done,25));
    const TOOL_DIR =`)+`\nserver.once('listening',() => writeFileSync(${JSON.stringify(listening)},''));\n`);
  try {
    const run = command(script,['ask','--sample','--headless'],{},{detached:true});
    const hostPid = Number(await waitForFile(held));
    await observeListener(run.child.pid);
    assert.equal(await portOpen(4395),false,'signal lands before the host listens');
    process.kill(-run.child.pid,'SIGINT');
    // Keep the host unbound long enough for the original one-shot cleanup to finish.
    await delay(500);
    await writeFile(release,'');
    await waitForFile(listening);
    assert.deepEqual(json(await run.done),{status:'interrupted',signal:'SIGINT'});
    await clean();
    assert.throws(() => process.kill(hostPid,0),{code:'ESRCH'},'startup host exited');
    assert.equal((await processes()).some(line => line.includes(join(copy,'tools/Browser Control/scripts/server.js')+' --port 4395')),false);
  } finally {
    await writeFile(release,'');
    await writeFile(server,original);
  }
});
test('ask collects answers accepted after waiting and before listener stop',{timeout:30000},async () => {
  const held = join(root,'wait-held'),release = join(root,'wait-release');
  await withLocalFault(`if (args[1].startsWith('result?wait=') && args[1] !== 'result?wait=0' && result.status === 'waiting') {
    await writeFile(${JSON.stringify(held)},JSON.stringify(result));
    for (;;) { try { await access(${JSON.stringify(release)}); break; } catch {} await new Promise(done => setTimeout(done,25)); }
  }`,async () => {
    const run = command(script,['ask','--sample','--headless','--seconds','3']);
    const status = await ready(run);
    assert.equal(JSON.parse(await waitForFile(held)).status,'waiting');
    const expected = await submit();
    for (let i = 0; ; i++) {
      const state = await bc(['execute','--code','document.getElementById("status").textContent']);
      if (state.result === 'Sent. You can close this window.') break;
      assert.ok(i < 100,'the listener accepted the late submit'); await delay(25);
    }
    await writeFile(release,'');
    assert.deepEqual(json(await run.done),expected,'keep the listener body, including every answer and shown label');
    await clean(status);
  });
});
test('ask keeps answered stdout and reports a cleanup failure on stderr',{timeout:30000},async () => {
  await withBrowserFault("args[0] === 'session' && args[1] === 'stop'",`if (matches) {
    const r = spawnSync(process.execPath,[${JSON.stringify(join(copy || '', 'tools/Browser Control/scripts/real-browser.js'))},...args],{stdio:'pipe'});
    if (r.status !== 0) { process.stderr.write(r.stderr); process.exit(1); }
    process.stderr.write('Error: scripted cleanup failure\\n'); process.exit(1);
  }`,async () => {
    const run = command(script,['ask','--sample','--headless']);
    const status = await ready(run),expected = await submit(),output = await run.done;
    assert.deepEqual(json(output,output.stderr),expected);
    assert.equal(output.stderr,'Cleanup: Error: scripted cleanup failure\n');
    await clean({...status,kept:true});
  });
});
for (const stage of ['navigate','emulate']) test(`ask Browser Control ${stage} failure cleans its listener, host and profile`,{timeout:30000},async () => {
  await withBrowserFault(`args[0] === '${stage}'`,
    `if (matches) { process.stderr.write('Error: scripted ${stage} failure\\n'); process.exit(1); }`,async () => {
      const run = command(script,['ask','--sample','--headless']);
      while (run.child.exitCode === null) { await observeListener(run.child.pid); await delay(5); }
      assert.deepEqual(json(await run.done),{status:'no-window',reason:`Error: scripted ${stage} failure`});
      await clean();
    });
});
test('ask failed start that left its own host up recovers that host and profile',{timeout:30000},async () => {
  await withBrowserFault("args[0] === 'session' && args[1] === 'start'",`if (matches) {
    const r = spawnSync(process.execPath,[${JSON.stringify(join(copy || '', 'tools/Browser Control/scripts/real-browser.js'))},...args],{stdio:'pipe'});
    if (r.status !== 0) { process.stderr.write(r.stderr); process.exit(1); }
    process.stderr.write('Error: scripted failure after host startup\\n'); process.exit(1);
  }`,async () => {
    const run = command(script,['ask','--sample','--headless']);
    while (run.child.exitCode === null) { await observeListener(run.child.pid); await delay(5); }
    assert.deepEqual(json(await run.done),{status:'no-window',reason:'Error: scripted failure after host startup'});
    await clean();
  });
});
test('ask exception making its profile cleans the already started listener',{timeout:30000},async () => {
  const run = command(script,['ask','--sample','--headless'],{TMPDIR:join(root,'absent')});
  while (run.child.exitCode === null) { await observeListener(run.child.pid); await delay(5); }
  const result = json(await run.done);
  assert.equal(result.status,'no-window'); assert.match(result.reason,/ENOENT/);
  await clean();
});

test('ask failed start waits for its spawned host to come up late before removing its profile',{timeout:30000},async () => {
  const server = join(copy,'tools/Browser Control/scripts/server.js'),original = await readFile(server);
  const held = join(root,'late-held'),release = join(root,'late-release'),failed = join(root,'late-failed'),probe = join(root,'late-probe');
  await writeFile(server,original.toString().replace('const TOOL_DIR =',`
    writeFileSync(${JSON.stringify(held)},JSON.stringify({pid:process.pid,profile:process.argv[process.argv.indexOf('--profile')+1]}));
    while (!existsSync(${JSON.stringify(release)})) await new Promise(done => setTimeout(done,25));
    const TOOL_DIR =`));
  try {
    await withBrowserFault("args[0] === 'session' && args[1] === 'start'",`
      const {spawn} = await import('node:child_process');
      const {existsSync,writeFileSync} = await import('node:fs');
      if (matches) {
        const child = spawn(process.execPath,[${JSON.stringify(join(copy,'tools/Browser Control/scripts/real-browser.js'))},...args],{detached:true,stdio:'ignore'});
        child.unref();
        while (!existsSync(${JSON.stringify(held)})) await new Promise(done => setTimeout(done,25));
        writeFileSync(${JSON.stringify(failed)},String(child.pid));
        process.stderr.write('Error: scripted failure before host listens\\n'); process.exit(1);
      }
      if (args[1] === 'status' && existsSync(${JSON.stringify(failed)})) {
        const r = spawnSync(process.execPath,[${JSON.stringify(join(copy,'tools/Browser Control/scripts/real-browser.js'))},...args],{encoding:'utf8'});
        if (r.status === 0 && !JSON.parse(r.stdout).running) writeFileSync(${JSON.stringify(probe)},'');
        process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exit(r.status ?? 1);
      }`,async () => {
      const run = command(script,['ask','--sample','--headless']);
      const {pid,profile} = JSON.parse(await waitForFile(held));
      await waitForFile(probe);
      await delay(500);
      assert.equal(await portOpen(4395),false,'the spawned host is still coming up');
      await access(profile);
      assert.equal(run.child.exitCode,null,'a quiet port after start exited is not final');
      await writeFile(release,'');
      assert.deepEqual(json(await run.done),{status:'no-window',reason:'Error: scripted failure before host listens'});
      await clean({profile});
      assert.throws(() => process.kill(pid,0),{code:'ESRCH'},'late host exited');
    });
  } finally {
    await writeFile(release,'');
    await writeFile(server,original);
    try { process.kill(Number(await readFile(failed,'utf8')),'SIGKILL'); } catch (error) { if (!['ENOENT','ESRCH'].includes(error.code)) throw error; }
  }
});

for (const failure of ['success while still listening','throw while still listening']) test(`ask stop ${failure} keeps its profile and interrupted result`,{timeout:30000},async () => {
  await withBrowserFault("args[0] === 'session' && args[1] === 'stop'",`if (matches) {
    ${failure.startsWith('success') ? "process.stdout.write('{}\\n'); process.exit(0);" : "process.stderr.write('Error: scripted stop failure\\n'); process.exit(1);"}
  }`,async () => {
    const run = command(script,['ask','--sample','--headless']);
    const status = await ready(run); run.child.kill('SIGINT');
    const output = await run.done;
    assert.deepEqual(json(output,output.stderr),{status:'interrupted',signal:'SIGINT'});
    assert.equal(output.stderr,failure.startsWith('success') ? 'Cleanup: The browser host did not stop.\n' : 'Cleanup: Error: scripted stop failure\n');
    await clean({...status,reused:true,kept:true});
  });
});

for (const status of ['interrupted','needs-install']) test(`ask keeps ${status} when listener cleanup fails`,{timeout:30000},async () => {
  await withLocalFault("if (args[1] === 'stop') throw new Error('scripted listener cleanup failure');",async () => {
    const run = command(script,['ask','--sample','--headless'],status === 'needs-install' ? {
      PLAYWRIGHT_BROWSERS_PATH:join(root,'absent-browser')
    } : {});
    if (status === 'interrupted') { await ready(run); run.child.kill('SIGTERM'); }
    const output = await run.done,result = json(output,output.stderr);
    assert.equal(result.status,status);
    if (status === 'interrupted') assert.equal(result.signal,'SIGTERM');
    else assert.match(result.report,/has not authorised a Wiser install\./);
    assert.equal(output.stderr,'Cleanup: scripted listener cleanup failure\n');
    await clean();
  });
});

test('ask retries reset probes until its stopped host refuses connections',{timeout:30000},async () => {
  const ask = join(copy,'tools/Form/scripts/ask.js'),original = await readFile(ask);
  const net = join(copy,'tools/Form/scripts/test-net.js'),probes = join(root,'reset-probes');
  await writeFile(net,`import {connect as realConnect} from 'node:net';
    import {EventEmitter} from 'node:events';
    import {appendFileSync} from 'node:fs';
    let resets = 0;
    export function connect(options) {
      if (options.port !== 4395 || resets++ >= 2) return realConnect(options);
      appendFileSync(${JSON.stringify(probes)},'reset\\n');
      const socket = new EventEmitter();
      socket.setTimeout = () => {}; socket.destroy = () => {};
      queueMicrotask(() => socket.emit('error',Object.assign(new Error('scripted close reset'),{code:'ECONNRESET'})));
      return socket;
    }`);
  await writeFile(ask,original.toString().replace("from 'node:net'","from './test-net.js'"));
  try {
    const run = command(script,['ask','--sample','--headless']);
    const status = await ready(run); run.child.kill('SIGHUP');
    assert.deepEqual(json(await run.done),{status:'interrupted',signal:'SIGHUP'});
    assert.equal(await readFile(probes,'utf8'),'reset\nreset\n','retry after both close resets');
    await clean(status);
  } finally { await writeFile(ask,original); await rm(net); }
});

test('ask paged: local window uses the shared navigation and returns all answers',{timeout:30000},async()=>{
 const f={...structuredClone(SAMPLE_FORM),paged:true},file=join(root,'paged.json');
 await writeFile(file,JSON.stringify(f));
 const run=command(script,['ask','--form',file,'--headless']);
 const status=await ready(run);
 const initial=(await bc(['execute','--code',`({count:[...document.querySelectorAll('fieldset')].filter(e=>!e.hidden).length,title:document.querySelector('h1').textContent})`])).result;
 assert.deepEqual(initial,{count:1,title:`${f.title} · 1 of 6`});
 await bc(['execute','--code',`document.querySelector('input[value="bright"]').click()`]);
 for(let i=0;i<100;i++) {
  const page=(await bc(['execute','--code',`document.querySelector('fieldset:not([hidden])').dataset.id`])).result;
  if(page==='shapes')break;
  assert.ok(i<99,'radio advances in the ask window');await delay(25);
 }
 await bc(['execute','--code',`(() => {for(let i=0;i<4;i++)document.getElementById('next').click();document.querySelector('textarea').value='Paged answer';document.getElementById('submit').click();})()`]);
 const result=json(await run.done);
 assert.equal(result.status,'answered');assert.deepEqual(result.answers,{mood:'bright',shapes:[],era:null,places:[],loudness:5,never:'Paged answer'});
 assert.equal(result.shown.length,6);await clean(status);
});
