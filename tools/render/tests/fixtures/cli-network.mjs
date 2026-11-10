import dns from 'node:dns';
import { network } from './network.mjs';
const fake = network(process.env.RENDER_NETWORK);
dns.promises.lookup = fake.lookup;
globalThis.fetch = fake.fetch;
