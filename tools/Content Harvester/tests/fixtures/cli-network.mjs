import dns from 'node:dns';
import { readFileSync } from 'node:fs';
import { fixtureNetwork, fixedTime } from './network.mjs';
const c = JSON.parse(readFileSync(process.env.HARVEST_CASE, 'utf8'));
const network = fixtureNetwork(c);
dns.promises.lookup = network.lookup;
globalThis.fetch = network.fetch;
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [fixedTime])); }
  static now() { return RealDate.parse(fixedTime); }
};
