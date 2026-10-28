import { Resolver } from 'node:dns';
import { Agent, request } from 'node:https';
import { isIP } from 'node:net';
import { checkServerIdentity } from 'node:tls';
import { setTimeout, clearTimeout } from 'node:timers';
import { STATUS, statusSignal } from './errors.js';

const DEADLINE_MS = 120_000;
const SLAB_BYTES = 64 * 1024;

/** Canonical DNS permission, never a URL, address, suffix or wildcard. */
export function isCanonicalMediaHost(host) {
  if (typeof host !== 'string' || host.length > 253 || isIP(host) || host !== host.toLowerCase()) return false;
  const labels = host.split('.');
  if (labels.length < 2 || !labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return false;
  // URL's host parser also rejects noncanonical IDN and numeric-address forms.
  try { return new URL(`https://${host}/`).hostname === host && !/^\d+$/.test(labels.at(-1)); } catch { return false; }
}

function v4Number(address) {
  return address.split('.').reduce((out, part) => out * 256 + Number(part), 0);
}

function inV4(address, base, bits) {
  return Math.floor(address / 2 ** (32 - bits)) === Math.floor(v4Number(base) / 2 ** (32 - bits));
}

function v6Number(address) {
  const [left, right] = address.split('::');
  const a = left ? left.split(':') : [];
  const b = right ? right.split(':') : [];
  const groups = right === undefined ? a : [...a, ...Array(8 - a.length - b.length).fill('0'), ...b];
  return groups.reduce((out, group) => (out << 16n) + BigInt(`0x${group}`), 0n);
}

function inV6(address, base, bits) {
  const shift = BigInt(128 - bits);
  return address >> shift === v6Number(base) >> shift;
}

/**
 * Conservative ordinary public unicast, based on IANA's IPv4/IPv6 Special-
 * Purpose Address Registries (iana.org/assignments/iana-ipv4-special-registry
 * and iana-ipv6-special-registry). Deny whole special-purpose allocations,
 * including their globally reachable exceptions, rather than guessing whether
 * an exception is an appropriate media endpoint. IPv6 is restricted to 2000::/3;
 * that also excludes local, mapped, translated, discard and multicast space.
 */
export function isPublicMediaAddress(address) {
  if (typeof address !== 'string' || address.includes('%')) return false;
  if (isIP(address) === 4) {
    const n = v4Number(address);
    return ![
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
      ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
      ['192.31.196.0', 24], ['192.52.193.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
      ['192.175.48.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
      ['224.0.0.0', 4], ['240.0.0.0', 4],
    ].some(([base, bits]) => inV4(n, base, bits));
  }
  if (isIP(address) !== 6 || address.includes('.')) return false;
  const n = v6Number(address);
  return inV6(n, '2000::', 3) && ![
    ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['2620:4f:8000::', 48], ['3fff::', 20],
  ].some(([base, bits]) => inV6(n, base, bits));
}

function sameAddress(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (isIP(a) === 4 && isIP(b) === 4) return a === b;
  return isIP(a) === 6 && isIP(b) === 6 && !a.includes('.') && !b.includes('.') && v6Number(a) === v6Number(b);
}

function failure(detail, httpStatus) {
  return statusSignal(STATUS.VENDOR_ERROR, {
    reason: 'media_download_failed', detail,
    ...(Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? { http_status: httpStatus } : {}),
  });
}

/**
 * Internal gateway capability. Its seam is Node's Resolver/HTTPS/timer boundary,
 * below all permission, address, stream and failure decisions. No connector can
 * provide transport options. Snapshot permissions when the context is built.
 */
export function createMediaDownload({ hosts, mediaTypes, maxBytes, signal, remember }) {
  const allowedHosts = new Set(hosts);
  const allowedTypes = new Set(mediaTypes);
  return function downloadMedia(input) {
    return new Promise((resolve, reject) => {
      let done = false;
      let resolver, req, res, agent, timer;
      let chunks = [];
      let tail = null;
      let tailUsed = 0;
      let allocated = 0;
      let total = 0;
      let stage = 'invalid_request';

      function cleanup() {
        clearTimeout(timer);
        signal?.removeEventListener('abort', inactive);
        // Never let cleanup exceptions replace a closed failure with raw text.
        for (const close of [() => resolver?.cancel(), () => res?.destroy(), () => req?.destroy(), () => agent?.destroy()]) {
          try { close(); } catch { /* Already stopped or unavailable. */ }
        }
        chunks = [];
        tail = null;
      }
      function fail(detail, status) {
        if (done) return;
        done = true;
        cleanup();
        reject(failure(detail, status));
      }
      function inactive() { fail('inactive'); }

      try {
        const urlValue = input?.url;
        remember?.(urlValue); // Before any refusal, including invalid options.
        if (signal?.aborted) return fail('inactive');
        signal?.addEventListener('abort', inactive, { once: true });
        timer = setTimeout(() => fail('deadline'), DEADLINE_MS);
        if (!input || typeof input !== 'object' || Array.isArray(input) ||
            Reflect.ownKeys(input).length !== 2 || !Object.hasOwn(input, 'url') || !Object.hasOwn(input, 'media_type')) return fail('invalid_request');
        if (!allowedTypes.has(input.media_type)) return fail('media_type_refused');
        stage = 'invalid_url';
        if (typeof urlValue !== 'string' || urlValue.includes('#')) return fail('invalid_url');
        const url = new URL(urlValue);
        if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password ||
            /^https:\/\/[^/?#]*@/i.test(urlValue) || !isCanonicalMediaHost(url.hostname)) return fail('invalid_url');
        if (!allowedHosts.has(url.hostname)) return fail('host_refused');

        stage = 'dns_failed';
        resolver = new Resolver();
        const answers = [];
        let pending = 2;
        function resolved(family, err, addresses) {
          if (done) return;
          try {
            if (err && err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') return fail('dns_failed');
            if (!err && (!Array.isArray(addresses) || addresses.some((address) => isIP(address) !== family || !isPublicMediaAddress(address)))) return fail('address_refused');
            if (!err) answers.push(...addresses.map((address) => ({ address, family })));
            if (--pending !== 0) return;
            if (answers.length === 0) return fail('address_refused');
            connect(url, answers[0]);
          } catch { fail('dns_failed'); }
        }
        resolver.resolve4(url.hostname, (err, addresses) => resolved(4, err, addresses));
        if (!done) resolver.resolve6(url.hostname, (err, addresses) => resolved(6, err, addresses));
      } catch { fail(stage); }

      function connect(url, selected) {
        if (done) return;
        try {
          agent = new Agent({ keepAlive: false, maxCachedSessions: 0 });
          req = request({
            protocol: 'https:', hostname: selected.address, family: selected.family, port: 443,
            servername: url.hostname, rejectUnauthorized: true,
            checkServerIdentity: (_hostname, cert) => checkServerIdentity(url.hostname, cert),
            method: 'GET', path: url.pathname + url.search, agent,
            headers: { Host: url.hostname, 'Accept-Encoding': 'identity' },
          }, (response) => {
            if (done) { try { response.destroy(); } catch { /* Already cancelled. */ } return; }
            res = response;
            res.on('error', () => fail('transport_failed'));
            res.on('aborted', () => fail('truncated'));
            res.on('close', () => { if (!done) fail('truncated'); });
            try {
              if (!sameAddress(res.socket?.remoteAddress, selected.address) || res.socket?.authorized !== true) return fail('transport_failed');
              const status = res.statusCode;
              if (!Number.isInteger(status) || status < 100 || status > 599) return fail('http_refused');
              if (status >= 300 && status < 400) return fail('redirect_refused', status);
              if (status < 200 || status >= 300) return fail('http_refused', status);
              const encoding = res.headers['content-encoding'];
              if (encoding !== undefined && (typeof encoding !== 'string' || encoding.trim().toLowerCase() !== 'identity')) return fail('encoding_refused');
              const length = res.headers['content-length'];
              let expected;
              if (length !== undefined) {
                if (typeof length !== 'string' || !/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))) return fail('length_refused');
                expected = Number(length);
                if (expected > maxBytes) return fail('over_cap');
              }
              res.on('data', (chunk) => {
                if (done) return;
                try {
                  if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) return fail('transport_failed');
                  if (chunk.byteLength > maxBytes - total) return fail('over_cap');
                  if (chunk.byteLength === 0) return;
                  total += chunk.byteLength;
                  // Coalesce tiny chunks into bounded slabs. Retaining one object
                  // per byte (or per empty chunk) could dwarf the declared cap.
                  let offset = 0;
                  while (offset < chunk.byteLength) {
                    if (!tail || tailUsed === tail.length) {
                      const capacity = Math.min(SLAB_BYTES, maxBytes - allocated);
                      if (capacity <= 0) return fail('over_cap');
                      tail = Buffer.allocUnsafe(capacity);
                      allocated += tail.length;
                      tailUsed = 0;
                      chunks.push(tail);
                    }
                    const count = Math.min(tail.length - tailUsed, chunk.byteLength - offset);
                    tail.set(chunk.subarray(offset, offset + count), tailUsed);
                    tailUsed += count;
                    offset += count;
                  }
                } catch { fail('allocation_failed'); }
              });
              res.on('end', () => {
                if (done) return;
                if (res.complete !== true || (expected !== undefined && expected !== total)) return fail('truncated');
                if (total === 0) return fail('empty');
                let bytes;
                try {
                  chunks[chunks.length - 1] = tail.subarray(0, tailUsed);
                  bytes = Buffer.concat(chunks, total);
                } catch { return fail('allocation_failed'); }
                done = true;
                cleanup();
                resolve(bytes);
              });
            } catch { fail('transport_failed'); }
          });
          req.on('error', () => fail('transport_failed'));
          req.on('socket', (socket) => {
            // Before the ClientRequest's secureConnect listener can send bytes.
            socket.prependOnceListener('secureConnect', () => {
              if (!sameAddress(socket.remoteAddress, selected.address) || socket.authorized !== true) fail('transport_failed');
            });
          });
          req.end();
        } catch { fail('transport_failed'); }
      }
    });
  };
}
