import dns from 'node:dns';
import { destinationReason as reason } from '../../../lib/destination-core.js';
export { classifyLiteral, destinationReasonText } from '../../../lib/destination-core.js';

// Keep Node's resolver here; portable cores receive their host's resolver.
export function lookup(hostname) {
  return dns.promises.lookup(hostname, { all: true, verbatim: true });
}
export function destinationReason(hostname, resolve = lookup) {
  return reason(hostname, resolve);
}
