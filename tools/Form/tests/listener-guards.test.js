import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {serve,http,payload,wait,delay,cleanupAndScan} from './local-harness.js';
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
