import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {serve,http,payload,wait,stop,delay,cleanupAndScan} from './local-harness.js';
after(cleanupAndScan);

test('guard Host: literal loopback host only',async () => {
  const s = await serve();
  for (const host of [`localhost:${s.port}`,'example.com']) {
    assert.equal((await http(s,'',{headers:{Host:host}})).status,403,'nonliteral Host must return 403');
  }
  assert.equal((await http(s)).status,200);
});

test('guard once: second and simultaneous submissions are refused',async () => {
  const s = await serve();
  assert.equal((await http(s,'answers',{method:'POST',body:payload()})).status,200);
  assert.equal((await http(s,'answers',{method:'POST',body:payload(undefined,'other')})).status,409,'second answers must return 409');
  assert.ok((await wait(s)).answers.note === payload().answers.note,'first answer must survive');
  const parallel = await serve();
  const posts = await Promise.all([http(parallel,'answers',{method:'POST',body:payload()}),http(parallel,'answers',{method:'POST',body:payload()})]);
  assert.deepEqual(posts.map(r => r.status).sort(),[200,409],'simultaneous submissions accept once');
});

test('guard closing: ttl 3 closes the listener and a pending wait',async () => {
  const s = await serve(undefined,['--ttl','3']);
  const pending = wait(s,10);
  await delay(Math.max(0,s.closes-Date.now()+200));
  assert.equal((await pending).status,'gone','closing time must end a pending wait');
  assert.equal((await wait(s)).status,'gone','closing time must stop the listener');
  await assert.rejects(http(s),{code:'ECONNREFUSED'});
});

test('the largest answers a checked form allows are accepted',async () => {
  const f = {title:`Long ${Date.now()}`,questions:Array.from({length:12},(_,i) => ({id:`t${i}`,type:'text',label:'😀'.repeat(200)}))};
  const text = '\u4e2d'.repeat(500)+'😀'.repeat(500);
  const s = await serve(f);
  const body = {form:f.title,answers:Object.fromEntries(f.questions.map(q => [q.id,text])),shown:f.questions.map(q => ({id:q.id,question:q.label,shown:text}))};
  assert.ok(Buffer.byteLength(JSON.stringify(body)) > 64*1024,'larger than the old cap');
  assert.equal((await http(s,'answers',{method:'POST',body})).status,200,'a legal full set is accepted');
  assert.equal((await wait(s)).answers.t11,text);
  await stop(s);
});

test('a slider answer off its step is refused, on it accepted',async () => {
  const f = {title:`Steps ${Date.now()}`,questions:[{id:'n',type:'slider',label:'N',min:0,max:1,step:0.1}]};
  const s = await serve(f);
  const body = n => ({form:f.title,answers:{n},shown:[{id:'n',question:'N',shown:String(n)}]});
  assert.equal((await http(s,'answers',{method:'POST',body:body(0.55)})).status,400,'off a step');
  assert.equal((await http(s,'answers',{method:'POST',body:body(0.30000000000000004)})).status,200,'a step as the range control sends it');
  await stop(s);
});

test('answers sent with no wait running survive the closing time',async () => {
  const s = await serve(undefined,['--ttl','3']);
  assert.equal((await http(s,'answers',{method:'POST',body:payload()})).status,200);
  await delay(Math.max(0,s.closes-Date.now()+1000));
  assert.equal((await wait(s)).status,'answered','kept past the closing time');
  await stop(s);
});
