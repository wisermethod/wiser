import dns from 'node:dns';

/**
 * What this tool is willing to send a request to.
 *
 * A harvest request names addresses, and a page it fetches can redirect to
 * another one. Both are inputs from outside, so both are screened here: an
 * address inside the machine or its network is not a source, and the addresses
 * cloud platforms answer instance credentials on are the reason that matters.
 *
 * Every hostname reaching this file has been through the URL parser, which
 * already folds the decimal, octal, and hexadecimal spellings of an IPv4
 * address into dotted form and folds an IPv4-mapped IPv6 address into hex. The
 * parsers below accept those spellings anyway: this file is the one place the
 * judgment is made, and it does not depend on a normalization done elsewhere.
 */

const REASONS = {
  loopback: 'a loopback address',
  private_range: 'a private-range address',
  link_local: 'a link-local address',
  unique_local: 'a unique-local address',
  cloud_metadata: 'a cloud instance metadata address',
  unspecified: 'an unspecified address',
  unroutable: 'an address that is not routable on the public internet',
  unresolvable: 'a hostname that does not resolve'
};

// Addresses cloud platforms answer instance credentials on. Each also falls in
// a blocked range below; naming them separately is what puts the reason in the
// failure rather than a range that says less about why it matters.
const METADATA_IPV4 = new Set([
  '169.254.169.254',
  '169.254.170.2',
  '100.100.100.200',
  '192.0.0.192'
]);

// fd00:ec2::254, the IPv6 form of the same service.
const METADATA_IPV6 = [0xfd00, 0x0ec2, 0, 0, 0, 0, 0, 0x0254];

// Names that stand for the machine itself or for a metadata service. The
// resolver check below catches these too wherever it can reach a resolver;
// naming them holds when it cannot.
const BLOCKED_HOSTNAMES = new Map([
  ['localhost', 'loopback'],
  ['metadata', 'cloud_metadata'],
  ['metadata.google.internal', 'cloud_metadata'],
  ['metadata.goog', 'cloud_metadata'],
  ['instance-data', 'cloud_metadata'],
  ['instance-data.ec2.internal', 'cloud_metadata']
]);

/** The sentence a failure uses for a reason key. */
export function destinationReasonText(reason) {
  return REASONS[reason] || 'an address this tool does not fetch';
}

/**
 * The reason a hostname may not be fetched, or null when it may be.
 *
 * `lookup` is the resolver, injected so the screen can be exercised over
 * addresses no test machine has. Nothing in this tool passes a second argument.
 */
export async function destinationReason(hostname, lookup = defaultLookup) {
  const host = String(hostname || '').toLowerCase();

  if (host === '') return 'unroutable';

  const literal = classifyLiteral(host);
  if (literal !== undefined) return literal;

  const named = BLOCKED_HOSTNAMES.get(host);
  if (named) return named;
  if (host.endsWith('.localhost')) return 'loopback';

  let addresses;

  try {
    addresses = await lookup(host);
  } catch {
    return 'unresolvable';
  }

  if (!Array.isArray(addresses) || addresses.length === 0) return 'unresolvable';

  for (const entry of addresses) {
    const reason = classifyLiteral(String(entry?.address ?? entry).toLowerCase());
    if (reason) return reason;
  }

  return null;
}

/**
 * The reason an address literal may not be fetched, null when it may be, and
 * undefined when the hostname is not an address literal at all.
 */
export function classifyLiteral(hostname) {
  const ipv6 = parseIpv6(hostname);
  if (ipv6) return classifyIpv6(ipv6);

  const ipv4 = parseIpv4(hostname);
  if (ipv4) return classifyIpv4(ipv4);

  return undefined;
}

function classifyIpv4(octets) {
  if (METADATA_IPV4.has(octets.join('.'))) return 'cloud_metadata';

  const [a, b] = octets;

  if (a === 0) return 'unspecified';
  if (a === 127) return 'loopback';
  if (a === 10) return 'private_range';
  if (a === 172 && b >= 16 && b <= 31) return 'private_range';
  if (a === 192 && b === 168) return 'private_range';
  if (a === 100 && b >= 64 && b <= 127) return 'private_range';
  if (a === 169 && b === 254) return 'link_local';
  if (a === 192 && b === 0 && octets[2] === 0) return 'unroutable';
  if (a === 198 && (b === 18 || b === 19)) return 'unroutable';
  if (a >= 224) return 'unroutable';

  return null;
}

function classifyIpv6(groups) {
  if (groups.every((group, index) => group === METADATA_IPV6[index])) return 'cloud_metadata';

  // ::ffff:0:0/96, an IPv4 address wearing an IPv6 spelling.
  if (isZeroPrefix(groups, 5) && groups[5] === 0xffff) return classifyIpv4(embeddedIpv4(groups, 6));

  // ::/96, which holds ::, ::1, and the deprecated IPv4-compatible form.
  if (isZeroPrefix(groups, 6)) {
    if (groups[6] === 0 && groups[7] === 0) return 'unspecified';
    if (groups[6] === 0 && groups[7] === 1) return 'loopback';
    return classifyIpv4(embeddedIpv4(groups, 6)) || 'unroutable';
  }

  // 64:ff9b::/96, the NAT64 prefix, and 2002::/16, the 6to4 prefix. Both carry
  // an IPv4 address inside them and reach whatever that address reaches.
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && isZeroRange(groups, 2, 6)) {
    return classifyIpv4(embeddedIpv4(groups, 6));
  }

  if (groups[0] === 0x2002) return classifyIpv4(embeddedIpv4(groups, 1));

  if ((groups[0] & 0xfe00) === 0xfc00) return 'unique_local';
  if ((groups[0] & 0xffc0) === 0xfe80) return 'link_local';
  if ((groups[0] & 0xffc0) === 0xfec0) return 'unique_local';
  if ((groups[0] & 0xff00) === 0xff00) return 'unroutable';

  return null;
}

function isZeroPrefix(groups, count) {
  return isZeroRange(groups, 0, count);
}

function isZeroRange(groups, start, end) {
  for (let index = start; index < end; index++) {
    if (groups[index] !== 0) return false;
  }
  return true;
}

function embeddedIpv4(groups, offset) {
  return [groups[offset] >> 8, groups[offset] & 0xff, groups[offset + 1] >> 8, groups[offset + 1] & 0xff];
}

/**
 * Dotted, decimal, octal, and hexadecimal IPv4, including the short forms where
 * the last part carries the remaining octets. Anything else returns null.
 */
function parseIpv4(value) {
  const parts = value.split('.');
  if (parts.length === 0 || parts.length > 4) return null;

  const numbers = [];

  for (const part of parts) {
    const number = parseNumericPart(part);
    if (number === null) return null;
    numbers.push(number);
  }

  const last = numbers.pop();
  const remaining = 4 - numbers.length;

  if (last >= 256 ** remaining) return null;
  if (numbers.some((number) => number > 255)) return null;

  const octets = [...numbers];

  for (let index = remaining - 1; index >= 0; index--) {
    octets.push(Math.floor(last / 256 ** index) % 256);
  }

  return octets;
}

function parseNumericPart(part) {
  let value;

  if (/^0[xX][0-9a-fA-F]+$/.test(part)) value = Number.parseInt(part.slice(2), 16);
  else if (/^0[0-7]+$/.test(part)) value = Number.parseInt(part.slice(1), 8);
  else if (/^[0-9]+$/.test(part)) value = Number(part);
  else return null;

  return Number.isSafeInteger(value) ? value : null;
}

/** Eight groups for an IPv6 literal, bracketed or bare, or null. */
function parseIpv6(value) {
  const inner = value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
  if (!inner.includes(':')) return null;

  const halves = inner.split('%')[0].split('::');
  if (halves.length > 2) return null;

  const head = readIpv6Side(halves[0]);
  const tail = halves.length === 2 ? readIpv6Side(halves[1]) : [];

  if (head === null || tail === null) return null;

  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    return [...head, ...new Array(fill).fill(0), ...tail];
  }

  return head.length === 8 ? head : null;
}

function readIpv6Side(side) {
  if (side === '') return [];

  const pieces = side.split(':');
  const groups = [];

  for (let index = 0; index < pieces.length; index++) {
    const piece = pieces[index];

    if (piece.includes('.')) {
      if (index !== pieces.length - 1) return null;
      const octets = parseIpv4(piece);
      if (!octets) return null;
      groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      continue;
    }

    if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
    groups.push(Number.parseInt(piece, 16));
  }

  return groups;
}

// Read through the module object rather than bound at import, so the screen can
// be exercised against a stub resolver without a flag in the shipped path.
function defaultLookup(hostname) {
  return dns.promises.lookup(hostname, { all: true, verbatim: true });
}
