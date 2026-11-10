import dns from 'node:dns';
import { readFileSync } from 'node:fs';
import { FIXED_TIME, fixtureNetwork } from './network.mjs';
const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url)));
const c = cases.find(c => c.name === process.env.SITE_CRAWL_CASE);
if (!c) throw new Error('Missing offline crawl fixture');
const network = fixtureNetwork(c);
globalThis.fetch = network.fetch;
dns.promises.lookup = async host => (await network.lookup(host)).map(address => ({ address, family: address.includes(':') ? 6 : 4 }));
const NativeDate = Date;
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [FIXED_TIME])); }
};
process.on('exit', () => {
  if (JSON.stringify(network.requests) !== JSON.stringify(c.requests)) {
    process.stderr.write('Offline fixture request order differed\n');
    process.exitCode = 2;
  }
});
