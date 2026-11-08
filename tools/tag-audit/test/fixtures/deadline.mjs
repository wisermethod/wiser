import assert from 'node:assert/strict';
import dns from 'node:dns';

if (process.env.TAG_AUDIT_DEADLINE_PHASE) {
  const phase = process.env.TAG_AUDIT_DEADLINE_PHASE;
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  let signal, signals = 0, lookups = 0, requests = 0;
  AbortSignal.timeout = ms => {
    assert.equal(ms, 20000);
    signals++;
    signal = timeout(25);
    return signal;
  };
  // Keep Node alive while the fake DNS promise waits, as a real DNS request does.
  setTimeout(() => { throw new Error('CLI lookup exceeded its test deadline'); }, 2000);
  dns.promises.lookup = async () => {
    lookups++;
    const blockedAt = { preflight: 1, caller: 2, redirect: 3 }[phase];
    if (lookups >= blockedAt) return new Promise(() => {});
    return [{ address: '93.184.216.34', family: 4 }];
  };
  globalThis.fetch = async (_, init) => {
    requests++;
    assert.equal(init.signal, signal);
    return new Response('', { status: 302, headers: { location: 'https://other.test/' } });
  };
  process.on('exit', () => {
    assert.equal(signals, phase === 'preflight' ? 1 : 2, 'the preflight has its own deadline, and the run one more, started after any install');
    assert.equal(requests, phase === 'redirect' ? 1 : 0);
  });
}
