import dns from 'node:dns';
import cases from './cases.json' with { type: 'json' };
import { fixtureNetwork } from './network.mjs';
const c = cases.find(c => c.name === process.env.TAG_AUDIT_CASE);
if (c) {
  const network = fixtureNetwork(c);
  globalThis.fetch = network.fetch;
  dns.promises.lookup = async host => (await network.lookup(host)).map(address => ({ address }));
  process.on('exit', () => {
    const expected = process.env.TAG_AUDIT_MAIN ? c.mainRequests ?? c.requests : c.requests;
    if (JSON.stringify(network.requests) !== JSON.stringify(expected)) process.exitCode = 2;
  });
}
