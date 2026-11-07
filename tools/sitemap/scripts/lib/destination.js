import dns from 'node:dns';
import { destinationReason as reason } from './destination-core.js';
export { classifyLiteral, destinationReasonText } from './destination-core.js';

// Keep Node's resolver here; the snapshot engine receives its host's resolver.
export function lookup(hostname) {
  return dns.promises.lookup(hostname, { all: true, verbatim: true });
}
export function destinationReason(hostname, resolve = lookup) {
  return reason(hostname, resolve);
}
