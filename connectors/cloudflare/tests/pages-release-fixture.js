// Synthetic signed Pages release fixtures. Loaded by tests; registers no tests.
//
// Every key here is a FIXTURE identity generated in memory for one process. It
// is never written to disk or printed, and it is not the publisher's key. The
// shipping pages-trust.json is never modified: a test that needs a fixture key
// trusted copies the connector's source files into a default-temporary
// directory and writes the fixture's PUBLIC key there.
//
// The layout below is deliberately unlike any real release payload, so a pass
// shows the connector reads its layout from the signed contract rather than
// carrying fixed names.
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PAGES_DOMAIN = Buffer.from('wiser.pages-release.v1\u0000', 'latin1');
// The publisher layout catalog's signature domain, distinct from the contract's.
export const LAYOUTS_DOMAIN = Buffer.from('wiser.pages-layouts.v1\u0000', 'latin1');
export const CONNECTOR_SOURCE = fileURLToPath(new URL('..', import.meta.url));
// The one host the Pages module may fetch from: the existing publisher host.
export const RELEASE_HOST = 'releases.wisermemory.com';
export const CATALOG_MAX_BYTES = 64 * 1024;
// A synthetic layout, unlike any real release's: the one syntheticContract() uses.
export const SYNTHETIC_LAYOUT = Object.freeze({ root_name: 'bundle-root', assets: 'out/public' });
// A second synthetic layout, to show the classifier reads every listed entry.
export const ALTERNATE_LAYOUT = Object.freeze({ root_name: 'pkg-alpha', assets: 'build/web/static' });

export function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// An in-memory Ed25519 fixture identity. The private key object never leaves
// this closure; only the public key and the id are exposed.
export function fixtureIdentity(seedLabel = 'fixture') {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const x = publicKey.export({ format: 'jwk' }).x;
  const ed25519 = Buffer.from(x, 'base64url').toString('base64');
  const id = sha(Buffer.from(`${seedLabel}:${ed25519}`)).slice(0, 16);
  return {
    id,
    ed25519,
    key: { id, ed25519 },
    // Raw signature over exactly these bytes (the Workers release domain).
    signRaw(bytes) { return sign(null, bytes, privateKey); },
    // Pages release domain: the NUL-terminated prefix, then the exact bytes.
    signPages(bytes) { return sign(null, Buffer.concat([PAGES_DOMAIN, bytes]), privateKey); },
    // Layout catalog domain: its own NUL-terminated prefix, then the exact bytes.
    signLayouts(bytes) { return sign(null, Buffer.concat([LAYOUTS_DOMAIN, bytes]), privateKey); },
  };
}

// The trusted catalog URLs a fixture trust file names for a publisher label.
export function catalogUrls(label) {
  return {
    catalog: `https://${RELEASE_HOST}/pages/${label}/layouts.json`,
    catalog_signature: `https://${RELEASE_HOST}/pages/${label}/layouts.sig`,
  };
}

// publishers: { label: keys[] } for the default catalog URLs, or
// { label: { keys, catalog, catalog_signature, catalog_sha256 } } to set them.
// The default pin is computed from the declared default fixture catalog, never
// from whatever a fake fetch happens to return. Custom catalogs need explicit pins.
export function trustJson(publishers, catalogs = {}) {
  const out = { format: 1, purpose: 'cloudflare.pages.deploy', publishers: {} };
  for (const [label, value] of Object.entries(publishers)) {
    out.publishers[label] = Array.isArray(value) ? { keys: value, ...catalogUrls(label), catalog_sha256: sha(catalogs[label] ?? catalogBytes(label)) } : value;
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

// A closed layout catalog's exact bytes.
export function catalogBytes(publisher, layouts = [SYNTHETIC_LAYOUT], extra = {}) {
  return Buffer.from(`${JSON.stringify({
    format: 1, purpose: 'cloudflare.pages.layouts', publisher, layouts, ...extra,
  }, null, 2)}\n`, 'utf8');
}

// A fake publisher host. entries: { label: { identity, layouts, bytes, signature,
// status, sigStatus } }; bytes/signature override what identity signs. Serves
// only the trusted URLs for each label, records every request, and offers both
// a gateway fetchImpl (so the gateway's own release fetcher runs) and a direct
// ctx.fetchRelease that applies the same maxBytes rule.
export function publisherServer(entries = {}) {
  const served = new Map();
  for (const [label, entry] of Object.entries(entries)) {
    const urls = entry.urls || catalogUrls(label);
    const bytes = entry.bytes || catalogBytes(label, entry.layouts);
    const signature = entry.signature || entry.identity.signLayouts(bytes);
    if (entry.status !== 404) served.set(urls.catalog, { bytes, status: entry.status || 200, headers: entry.headers });
    if (entry.sigStatus !== 404) served.set(urls.catalog_signature, { bytes: signature, status: entry.sigStatus || 200 });
  }
  const requests = [];
  const server = {
    served,
    requests,
    urls: () => requests.map((r) => r.url),
    async fetchImpl(url, init = {}) {
      requests.push({ url, method: init.method, headers: { ...(init.headers || {}) }, credentials: init.credentials, redirect: init.redirect, via: 'gateway' });
      const hit = served.get(url);
      if (!hit) return new Response('not served', { status: 404 });
      return new Response(hit.bytes, { status: hit.status, headers: hit.headers || {} });
    },
    async fetchRelease(url, { maxBytes } = {}) {
      requests.push({ url, maxBytes, via: 'ctx' });
      const hit = served.get(url);
      const refuse = (status, reason, http_status) => Object.assign(new Error(reason), { object: { status, reason, ...(http_status ? { http_status } : {}) } });
      if (!hit || hit.status !== 200) throw refuse('vendor_error', 'release HTTP error', hit ? hit.status : 404);
      if (hit.bytes.length > maxBytes) throw refuse('denied', 'release body exceeds maxBytes');
      return { status: 200, bytes: new Uint8Array(hit.bytes), content_type: 'application/octet-stream' };
    },
  };
  return server;
}

// Replaces the process's global fetch with a recorder that refuses, so a gateway
// built without an explicit fetchImpl can never reach the network. Returns the
// attempts, which a test file asserts stay empty.
export function blockNetwork() {
  const attempts = [];
  globalThis.fetch = async (url) => {
    attempts.push(String(url));
    throw new Error(`network fetch attempted in a test: ${url}`);
  };
  return attempts;
}

// Copies the connector's source files (not its tests) into
// <tmp>/connectors/cloudflare, byte for byte. trust: string written as
// pages-trust.json, or null to leave none. release: optional string replacing
// release.json. manifest: optional function that edits the parsed manifest.json.
export function connectorCopy({ trust, release, manifest } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'pages-release-connector-')));
  const connectors = join(base, 'connectors');
  const dir = join(connectors, 'cloudflare');
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(CONNECTOR_SOURCE, { withFileTypes: true })) {
    if (entry.name === 'tests' || entry.name === 'pages-trust.json') continue;
    cpSync(join(CONNECTOR_SOURCE, entry.name), join(dir, entry.name), { recursive: true });
  }
  if (typeof trust === 'string') writeFileSync(join(dir, 'pages-trust.json'), trust);
  if (typeof release === 'string') writeFileSync(join(dir, 'release.json'), release);
  if (typeof manifest === 'function') {
    const path = join(dir, 'manifest.json');
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    manifest(parsed);
    writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`);
  }
  return {
    connectors,
    dir,
    async load() { return import(pathToFileURL(join(dir, 'index.js')).href); },
    cleanup() { rmSync(base, { recursive: true, force: true }); },
  };
}

export const SYNTHETIC_WORKER = Buffer.from(
  'export default { async fetch(request, env) { return env.ASSETS.fetch(request); } };\n// synthetic fixture worker 4c1e\n',
  'utf8',
);

export function syntheticContract(overrides = {}, workerBytes = SYNTHETIC_WORKER) {
  const contract = {
    format: 1,
    purpose: 'cloudflare.pages.deploy',
    publisher: 'fixture-pub',
    release: '7.3.1',
    layout: {
      root_name: 'bundle-root',
      assets: 'out/public',
      identity: { path: 'release-id.json', version: 'releaseTag' },
      build: { path: 'meta/stamp.json', time: 'stampedAt' },
      function: {
        directory: 'edge',
        worker: 'entry.mjs',
        routes: 'paths.json',
        data: 'table.dat',
        record: 'edge-record.json',
      },
    },
    worker: { sha256: sha(workerBytes), module_name: 'main.mjs' },
    data: { magic: Buffer.from('SYN9', 'latin1').toString('base64'), container: 'u32be-json', version_field: 'fmt', version: 3 },
    record: {
      version: 'rel',
      time: 'at',
      hashes: { worker: 'h_entry', routes: 'h_paths', data: 'h_table' },
      carried: 'inc',
      not_carried: 'exc',
      paths: 'n',
    },
  };
  return deepMerge(contract, overrides);
}

function deepMerge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

export function makeData(contract, { extra = 0, header, magic } = {}) {
  const magicBytes = magic || Buffer.from(contract.data.magic, 'base64');
  const head = Buffer.from(JSON.stringify(header || { [contract.data.version_field]: contract.data.version, note: 'SYNTH-TABLE-7d2' }), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(head.length, 0);
  return Buffer.concat([magicBytes, len, head, Buffer.alloc(extra, 0x41)]);
}

export const BUILD_TIME = '2031-04-05T06:07:08.000Z';

// Builds <tmp>/holder/<root_name>/ with the contract, its signature, the
// identity and build records, the assets and, unless fn is false, the Function.
export function makeRelease({
  identity,
  contract = syntheticContract(),
  contractBytes,
  signature,
  fn = true,
  worker = SYNTHETIC_WORKER,
  routes,
  data,
  recordOverrides = {},
  record,
  identityVersion,
  buildTime = BUILD_TIME,
  recordTime,
  omitBuild = false,
  carried = ['/synthetic/due-one'],
  notCarried = ['/synthetic/later-one'],
  assets = { 'index.html': '<h1>Synthetic</h1>\n', 'css/site.css': 'body{margin:0}\n', '_routes.json': '{"decoy":true}\n' },
  rootName,
} = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'pages-release-site-')));
  const layout = contract.layout;
  const root = join(base, 'holder', rootName || layout.root_name);
  mkdirSync(root, { recursive: true });
  const write = (rel, content) => {
    const path = join(root, ...rel.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return path;
  };
  const bytes = contractBytes || Buffer.from(`${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  const contractPath = write('release.contract.json', bytes);
  const signaturePath = join(root, 'release.contract.sig');
  if (signature !== null) {
    writeFileSync(signaturePath, signature || identity.signPages(bytes));
  }
  write(layout.identity.path, `${JSON.stringify({ [layout.identity.version]: identityVersion ?? contract.release, label: 'synthetic' })}\n`);
  if (!omitBuild) write(layout.build.path, `${JSON.stringify({ [layout.build.time]: buildTime })}\n`);
  const dist = join(root, ...layout.assets.split('/'));
  mkdirSync(dist, { recursive: true });
  for (const [rel, content] of Object.entries(assets)) write(`${layout.assets}/${rel}`, content);
  let routeBytes, dataBytes, recordBytes;
  const f = layout.function;
  if (fn) {
    routeBytes = routes || Buffer.from(`${JSON.stringify({ version: 1, include: ['/synthetic/due*'], exclude: ['/static/*'] })}\n`, 'utf8');
    dataBytes = data || makeData(contract);
    const r = contract.record;
    recordBytes = record || Buffer.from(`${JSON.stringify({
      [r.version]: contract.release,
      [r.time]: recordTime ?? buildTime,
      [r.hashes.worker]: sha(worker),
      [r.hashes.routes]: sha(routeBytes),
      [r.hashes.data]: sha(dataBytes),
      [r.carried]: carried,
      [r.not_carried]: notCarried,
      [r.paths]: 2,
      ...recordOverrides,
    }, null, 2)}\n`, 'utf8');
    write(`${f.directory}/${f.worker}`, worker);
    write(`${f.directory}/${f.routes}`, routeBytes);
    write(`${f.directory}/${f.data}`, dataBytes);
    write(`${f.directory}/${f.record}`, recordBytes);
  }
  return {
    base,
    root,
    dist,
    fnDir: join(root, ...f.directory.split('/')),
    contractPath,
    signaturePath,
    contractBytes: bytes,
    worker,
    routes: routeBytes,
    data: dataBytes,
    record: recordBytes,
    write,
    input(extra = {}) {
      return {
        account_id: 'acct-1',
        project_name: 'synthetic-site',
        dir: dist,
        release_contract: contractPath,
        release_signature: signaturePath,
        ...extra,
      };
    },
    cleanup() { rmSync(base, { recursive: true, force: true }); },
  };
}

export function okEnvelope(result) {
  return { status: 200, data: { success: true, result, errors: [], messages: [] }, headers: {} };
}

// A recording fake provider for the Pages deploy flow.
export function deployProxy(calls, { onCheck, jwt = 'synthetic-jwt-value' } = {}) {
  return async (request) => {
    calls.push(request);
    if (request.method === 'GET' && request.endpoint.endsWith('/upload-token')) return okEnvelope({ jwt });
    if (request.endpoint === '/pages/assets/check-missing') {
      if (onCheck) onCheck();
      return okEnvelope(request.body.hashes);
    }
    if (request.endpoint === '/pages/assets/upload' || request.endpoint === '/pages/assets/upsert-hashes') return okEnvelope(null);
    if (request.method === 'POST' && request.endpoint.endsWith('/deployments')) {
      return okEnvelope({ id: 'dep-synthetic', url: 'https://synthetic-site.pages.dev', environment: 'production' });
    }
    return okEnvelope(null);
  };
}

export function formParts(binary) {
  const boundary = binary.content_type.split('boundary=')[1];
  const raw = Buffer.from(binary.base64, 'base64').toString('latin1');
  const parts = [];
  for (const piece of raw.split(`--${boundary}`)) {
    const part = piece.replace(/^\r\n/, '');
    if (part === '' || part === '--\r\n' || part === '--') continue;
    const splitAt = part.indexOf('\r\n\r\n');
    if (splitAt < 0) continue;
    const head = part.slice(0, splitAt);
    let valueLatin = part.slice(splitAt + 4);
    if (valueLatin.endsWith('\r\n')) valueLatin = valueLatin.slice(0, -2);
    parts.push({
      name: /name="([^"]*)"/.exec(head)?.[1],
      filename: /filename="([^"]*)"/.exec(head)?.[1],
      contentType: /Content-Type: ([^\r\n]+)/i.exec(head)?.[1],
      value: Buffer.from(valueLatin, 'latin1'),
      head,
    });
  }
  return parts;
}

export function bundleParts(bundleBytes) {
  const line = bundleBytes.toString('latin1').split('\r\n', 1)[0];
  return formParts({ content_type: `multipart/form-data; boundary=${line.slice(2)}`, base64: bundleBytes.toString('base64') });
}

export function deploymentCalls(calls) {
  return calls.filter((call) => call.method === 'POST' && call.endpoint.endsWith('/deployments'));
}
