import dns from 'node:dns';
import cases from './cases.json' with { type: 'json' };
import { fixtureNetwork } from './network.mjs';
const testCase = cases.find(({ name }) => name === process.env.SITEMAP_CASE);
// node --test discovers fixture modules too. Loading this helper alone has no effect.
if (testCase) {
  const network = fixtureNetwork(testCase);
  globalThis.fetch = network.fetch;
  dns.promises.lookup = async (host) => (await network.lookup(host)).map((address) => ({ address }));
  process.on('exit', () => {
    if (JSON.stringify(network.requests) !== JSON.stringify(testCase.requests)) process.exitCode = 2;
  });
}
