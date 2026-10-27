// Fixtures live in memory except the caller's temporary input, removed as soon as serve returns.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createReadStream,realpathSync} from 'node:fs';
import {mkdtemp,writeFile,rm,readdir,lstat,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {request} from 'node:http';

export const script = realpathSync(process.env.WISER_FORM_TEST_SCRIPT || fileURLToPath(new URL('../scripts/form.js',import.meta.url)));
export const started = Date.now();
export const sentinel = `form-private-${randomBytes(24).toString('hex')}`;
export const delay = ms => new Promise(done => setTimeout(done,ms));
export const equal = (actual,wanted,message) => assert.ok(JSON.stringify(actual) === JSON.stringify(wanted),message);
const active = new Set();
const fixtureDirs = new Set();
export function form(id) {
  return {...(id ? {id} : {}),title:`Local ${sentinel}`,questions:[
    {id:'mood',type:'image-radio',label:'Which mood?',options:[
      {value:'warm',label:'Warm',picture:'palette:#F4F1EA,#C8553D'},
      {value:'cool',label:'Cool',picture:'motif:waves:#2F6FED,#FFFFFF'}]},
    {id:'note',type:'text',label:'Your note?',short:'Note'}
  ]};
}
export function payload(f = form(),note = sentinel) {
  return {form:f.title,...(f.id === undefined ? {} : {id:f.id}),answers:{mood:'warm',note},shown:[
    {id:'mood',question:'Which mood?',shown:'Warm'}, {id:'note',question:'Note',shown:note}
  ]};
}
export function cli(args,overrides = {},budget = 10000) {
  return new Promise((accept,reject) => {
    const env = {...process.env,DISPLAY:':form-test',...overrides};
    delete env.SSH_CONNECTION; delete env.SSH_TTY;
    Object.assign(env,overrides);
    for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
    const child = spawn(process.execPath,[script,...args],{env,stdio:['ignore','pipe','pipe']});
    let stdout = '',stderr = '',expired = false;
    const timer = setTimeout(() => { expired = true; child.kill('SIGKILL'); },budget);
    child.stdout.on('data',chunk => { stdout += chunk; });
    child.stderr.on('data',chunk => { stderr += chunk; });
    child.once('error',reject);
    child.once('close',code => {
      clearTimeout(timer);
      if (expired) return reject(new Error('CLI exceeded its time budget.'));
      let json;
      if (stdout && code === 0) {
        try { json = JSON.parse(stdout); }
        catch { return reject(new Error('CLI must print exactly one JSON object.')); }
        if (!json || Array.isArray(json) || typeof json !== 'object') return reject(new Error('CLI result must be an object.'));
      }
      accept({code,stdout,stderr,json});
    });
  });
}
export const dest = s => ['--port',String(s.port),'--code',s.code];
export async function serve(f = form(),extra = [],overrides = {}) {
  let directory;
  try {
    const args = ['serve'];
    if (f === null) args.push('--sample');
    else {
      directory = await mkdtemp(join(tmpdir(),'wiser-form-input-')); fixtureDirs.add(directory);
      const file = join(directory,'form.json'); await writeFile(file,JSON.stringify(f)); args.push('--form',file);
    }
    const begin = Date.now();
    const r = await cli([...args,...extra],overrides);
    assert.equal(r.code,0,'serve must succeed'); assert.equal(r.stderr,'');
    const s = r.json;
    if (s?.status === 'serving') active.add(s);
    assert.equal(s?.status,'serving');
    assert.ok(Date.now()-begin < 5000,'serve returns within five seconds');
    assert.match(s.code,/^[0-9a-f]{32}$/);
    assert.equal(s.url,`http://127.0.0.1:${s.port}/${s.code}/`);
    assert.ok(Number.isSafeInteger(s.closes) && s.closes > begin,'closing time is a timestamp');
    const quote = value => `'${value.replace(/'/g,"'\\''")}'`;
    assert.equal(s.wait,`node ${quote(script)} wait --port ${s.port} --code ${s.code}`);
    return s;
  } finally { if (directory) { await rm(directory,{recursive:true,force:true}); fixtureDirs.delete(directory); } }
}
export async function wait(s,seconds = 0) {
  const r = await cli(['wait',...dest(s),'--seconds',String(seconds)],{},(seconds+6)*1000);
  assert.equal(r.code,0); assert.equal(r.stderr,''); return r.json;
}
export async function stop(s) {
  const r = await cli(['stop',...dest(s)]);
  assert.equal(r.code,0); assert.ok(['stopped','gone'].includes(r.json?.status));
  active.delete(s); return r.json;
}
export function http(s,suffix = '',{method = 'GET',headers = {},body,chunked = false,path} = {}) {
  return new Promise((accept,reject) => {
    const raw = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const req = request({hostname:'127.0.0.1',port:s.port,path:path ?? `/${s.code}/${suffix}`,method,agent:false,
      headers:{...(raw === undefined ? {} : {'Content-Type':'application/json',...(chunked ? {} : {'Content-Length':Buffer.byteLength(raw)})}),...headers}},res => {
      let text = '';
      res.setEncoding('utf8'); res.on('data',chunk => { text += chunk; }); res.on('error',reject);
      res.on('end',() => accept({status:res.statusCode,text,headers:res.headers}));
    });
    req.setTimeout(5000,() => req.destroy(new Error('Test request timed out.')));
    req.on('error',reject);
    if (chunked && raw) { req.write(raw.slice(0,32768)); req.write(raw.slice(32768)); req.end(); }
    else req.end(raw);
  });
}
export async function listeners() {
  const text = await new Promise((accept,reject) => execFile('ps',['-axo','pid=,command='],(error,out) => error ? reject(error) : accept(out)));
  const listener = join(dirname(script),'listener.js');
  return text.split('\n').filter(line => line.trim().endsWith(listener)).map(line => line.trim().split(/\s+/)[0]);
}
export async function scanFile(file) {
  const needle = Buffer.from(sentinel); let tail = Buffer.alloc(0);
  for await (const chunk of createReadStream(file)) {
    const block = Buffer.concat([tail,chunk]);
    if (block.includes(needle)) return true;
    tail = block.subarray(Math.max(0,block.length-needle.length+1));
  }
  return false;
}
export async function cleanupAndScan(t) {
  const closing = [...active];
  for (const s of active) await stop(s);
  for (const directory of fixtureDirs) await rm(directory,{recursive:true,force:true});
  await delay(150);
  // Test files run in parallel: prove our own listeners are gone without counting another file's live form.
  for (const s of closing) await assert.rejects(http(s),{code:'ECONNREFUSED'},'no detached listener socket left');
  const plantedDir = await mkdtemp(join(tmpdir(),'wiser-form-scan-'));
  try { const planted = join(plantedDir,'control'); await writeFile(planted,sentinel); assert.ok(await scanFile(planted),'privacy scanner must detect a planted sentinel'); }
  finally { await rm(plantedDir,{recursive:true,force:true}); }
  const seen = new Set(); let files = 0,older = 0;
  async function scan(directory) {
    directory = await realpath(directory);
    if (seen.has(directory)) return; seen.add(directory);
    let entries;
    try { entries = await readdir(directory,{withFileTypes:true}); }
    catch (error) {
      if (!['EACCES','EPERM'].includes(error.code)) throw error;
      assert.ok((await lstat(directory)).mtimeMs < started-1000,'cannot clear unreadable temporary directory changed during run'); older++; return;
    }
    for (const entry of entries) {
      if (entry.name === 'memory' || /^\.env(?:\.|$)/i.test(entry.name)) continue;
      const file = join(directory,entry.name);
      try {
        if (entry.isDirectory()) await scan(file);
        else if (entry.isFile()) {
          // A run-unique random marker cannot occur in files last written before this run.
          if ((await lstat(file)).mtimeMs < started-1000) { older++; continue; }
          files++; assert.equal(await scanFile(file),false,'a form or answer was persisted');
        }
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        if (['EACCES','EPERM'].includes(error.code)) {
          assert.ok((await lstat(file)).mtimeMs < started-1000,'cannot clear unreadable temporary file changed during run'); older++;
        } else throw error;
      }
    }
  }
  await scan(fileURLToPath(new URL('../',import.meta.url)));
  await scan(tmpdir());
  t.diagnostic(`Privacy: ${files} changed files scanned; ${older} older entries excluded; planted marker detected; no marker or listener left.`);
}
