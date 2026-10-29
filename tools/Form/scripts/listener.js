// A detached, memory-only loopback listener. Invoked through IPC, never as a public command.
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {checkForm,FONT_HOSTS} from './format.js';
import {actionAllowed,displayOnly,minimumPicks} from './boards.js';
import {composePage} from './page.js';

// The largest answers a checked form allows, twelve 1000-character texts sent twice in four-byte characters with their labels, fit well inside this.
const LIMIT = 256*1024;
const CSP = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src ${FONT_HOSTS.join(' ')}; connect-src 'self'; form-action 'none'; base-uri 'none'`;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// The same allowance format.js gives a slider's steps.
const onStep = n => Number.isFinite(n) && Math.abs(n-Math.round(n)) <= Number.EPSILON*Math.max(1,Math.abs(n))*8;
const keys = (value,wanted) => record(value) && Object.keys(value).length === wanted.length && wanted.every(key => Object.hasOwn(value,key));

function validAnswers(payload,form) {
  if (displayOnly(form)) return false;
  if (!keys(payload,['form','answers','shown',...(form.actions ? ['action'] : []),...(form.id === undefined ? [] : ['id'])]) || payload.form !== form.title || payload.id !== form.id) return false;
  const ids = form.questions.map(q => q.id);
  if (!keys(payload.answers,ids) || !Array.isArray(payload.shown) || payload.shown.length !== ids.length) return false;
  if (!payload.shown.every((entry,i) => keys(entry,['id','question','shown']) && entry.id === ids[i] && typeof entry.question === 'string' && typeof entry.shown === 'string')) return false;
  if(form.actions){
    const action=form.actions.find(a=>a.value===payload.action);
    const count=form.questions.filter(q=>q.type==='boards').reduce((n,q)=>n+(Array.isArray(payload.answers[q.id])?payload.answers[q.id].length:0),0);
    const question=form.questions.find(q=>q.type==='boards');
    if(!action||!actionAllowed(action.needs,count,question.min))return false;
  }
  return form.questions.every(q => {
    const value = payload.answers[q.id];
    if (q.type === 'text') return typeof value === 'string' && [...value].length <= 1000;
    if (q.type === 'slider') return typeof value === 'number' && Number.isFinite(value) && value >= q.min && value <= q.max && onStep((value-q.min)/(q.step ?? 1));
    const allowed = v => typeof v === 'string' && q.options.some(option => option.value === v);
    if (q.type === 'radio' || q.type === 'image-radio') return value === null || allowed(value);
    if(q.type==='boards' && (!Array.isArray(value)||value.length>q.pick||(!form.actions&&value.length<minimumPicks(q))))return false;
    return Array.isArray(value) && new Set(value).size === value.length && value.every(allowed);
  });
}

export async function listen({form,ttl}) {
  if (!checkForm(form).ok || !Number.isInteger(ttl) || ttl < 1 || ttl > 86400) throw Object.assign(new Error(),{code:'INVALID_START'});
  const code = randomBytes(16).toString('hex'), base = `/${code}/`;
  const closes = Date.now()+ttl*1000;
  const script = readFileSync(new URL('../engine/engine.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../engine/local.js',import.meta.url),'utf8');
  const page = composePage({script,form,closes});
  let port,url,result = null,collections = 0,closing = false,ttlTimer,replayTimer;
  const waiters = new Set();
  const json = (res,status,value) => {
    res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify(value));
  };
  function shutdown() {
    if (closing) return;
    closing = true;
    clearTimeout(ttlTimer); clearTimeout(replayTimer);
    for (const waiting of [...waiters]) waiting(false);
    server.close();
    // Flush replies, then also close clients holding an incomplete request.
    setTimeout(() => { server.closeAllConnections(); process.exit(0); },50);
  }
  function collect(res) {
    if (closing || collections >= 2) return json(res,200,{status:'gone'});
    collections++;
    if (collections === 1) {
      clearTimeout(ttlTimer); clearTimeout(replayTimer);
      replayTimer = setTimeout(shutdown,60000);
    }
    if (collections === 2) res.once('finish',shutdown);
    json(res,200,result);
  }
  const server = createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403).end(); req.resume(); return; } // HOST_GUARD
    if (req.method === 'POST' && req.headers.origin !== undefined && req.headers.origin !== `http://127.0.0.1:${port}`) {
      res.writeHead(403).end(); req.resume(); return;
    }
    const path = (req.url || '').split('?')[0];
    if (closing) { res.writeHead(404).end(); req.resume(); return; }
    if (req.method === 'GET' && path === base) {
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':CSP});
      res.end(page);
    } else if (req.method === 'POST' && path === `${base}stop`) {
      res.once('finish',shutdown);
      json(res,200,{status:'stopped'}); req.resume();
    } else if (req.method === 'GET' && path === `${base}result`) {
      const raw = new URLSearchParams((req.url || '').split('?')[1]).get('wait') ?? '50';
      if (!/^\d+$/.test(raw) || Number(raw) > 3600) return json(res,400,{status:'invalid-wait'});
      if (result) return collect(res);
      const done = answered => {
        clearTimeout(timer); waiters.delete(done);
        if (res.destroyed) return;
        if (answered) collect(res);
        else json(res,200,closing ? {status:'gone'} : {status:'waiting',url});
      };
      const timer = setTimeout(() => done(false),Number(raw)*1000);
      waiters.add(done);
      res.once('close',() => { clearTimeout(timer); waiters.delete(done); });
    } else if (req.method === 'POST' && path === `${base}answers`) {
      if (result) { json(res,409,{status:'already-sent'}); req.resume(); return; } // ONCE_GUARD
      if (req.headers['content-type']?.trim().toLowerCase() !== 'application/json') {
        json(res,415,{status:'json-required'}); req.resume(); return;
      }
      if (Number(req.headers['content-length']) > LIMIT) {
        json(res,413,{status:'too-large'}); req.resume(); return;
      }
      let bytes = 0;
      const chunks = [];
      try {
        for await (const chunk of req.iterator({destroyOnReturn:false})) {
          bytes += chunk.length;
          if (bytes > LIMIT) { json(res,413,{status:'too-large'}); req.resume(); return; }
          chunks.push(chunk);
        }
      } catch { if (!res.destroyed) json(res,400,{status:'invalid-body'}); return; }
      if (closing) return json(res,400,{status:'closed'});
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return json(res,400,{status:'invalid-answers'}); }
      if (!validAnswers(payload,form)) return json(res,400,{status:'invalid-answers'});
      if (result) return json(res,409,{status:'already-sent'}); // ONCE_RACE_GUARD
      result = {status:'answered',...payload};
      // Sent answers outlive the closing time: they are kept until a wait collects them, for up to ten minutes.
      clearTimeout(ttlTimer);
      replayTimer = setTimeout(shutdown,600000);
      json(res,200,{status:'accepted'});
      for (const waiting of [...waiters]) waiting(true);
    } else { res.writeHead(404).end(); req.resume(); }
  });
  server.on('clientError',(_error,socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
  await new Promise((accept,reject) => {
    server.once('error',reject);
    // WISER_FORM_TEST_LISTEN_EPERM is set only by tests to exercise a denied bind without a sandbox.
    if (process.env.WISER_FORM_TEST_LISTEN_EPERM === '1') {
      server.emit('error',Object.assign(new Error('test bind denied'),{code:'EPERM'}));
    } else server.listen(0,'127.0.0.1',accept);
  });
  port = server.address().port;
  url = `http://127.0.0.1:${port}${base}`;
  ttlTimer = setTimeout(shutdown,Math.max(0,closes-Date.now())); // TTL_GUARD
  process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
  const scriptPath = fileURLToPath(new URL('./form.js',import.meta.url));
  const quote = value => `'${value.replace(/'/g,"'\\''")}'`;
  process.send({status:'serving',url,port,code,closes,wait:`node ${quote(scriptPath)} wait --port ${port} --code ${code}`});
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href && process.send) {
  let kept = false;
  const orphanTimer = setTimeout(() => process.exit(1),4500);
  process.on('disconnect',() => { if (!kept) process.exit(1); });
  process.on('message',message => {
    if (message.keep === true) { kept = true; clearTimeout(orphanTimer); }
  });
  process.once('message',message => listen(message).catch(error => {
    process.send({status:'no-listen',code:error.code || 'STARTUP_FAILED'},() => process.exit(1));
  }));
}
