import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { resolveNoticeUrl } from '../notice.mjs';

const hooksSource = fileURLToPath(new URL('..', import.meta.url));
const MARKER = 'notice-marker-7c1e';

const STRIPPED = [
  'CLAUDE_PLUGIN_ROOT',
  'WISER_DISABLE_NOTICES',
  'WISER_NOTICE_TEST_LOOPBACK',
  'NO_COLOR',
  'FORCE_COLOR',
  'NODE_USE_ENV_PROXY',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
];

function treeDigest(dir) {
  const rows = [];
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      const rel = path.slice(dir.length);
      const st = lstatSync(path);
      if (st.isSymbolicLink()) rows.push(`link\t${rel}\t${readlinkSync(path)}`);
      else if (st.isDirectory()) walk(path);
      else if (st.isFile()) {
        const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
        rows.push(`file\t${rel}\t${hash}`);
      } else rows.push(`other\t${rel}`);
    }
  };
  walk(dir);
  return rows;
}

function childEnv(home, root, { loopback = true, disable = false, pluginRoot = root, extra } = {}) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  for (const key of STRIPPED) delete env[key];
  if (pluginRoot) env.CLAUDE_PLUGIN_ROOT = pluginRoot;
  if (loopback) env.WISER_NOTICE_TEST_LOOPBACK = '1';
  if (disable) env.WISER_DISABLE_NOTICES = '1';
  if (extra) Object.assign(env, extra);
  return env;
}

function makePlugin(port, { query = '', mcp = 'url' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'wiser-notice-plugin-'));
  const home = mkdtempSync(join(tmpdir(), 'wiser-notice-home-'));
  cpSync(hooksSource, join(root, 'hooks'), { recursive: true });
  const file = join(root, '.mcp.json');
  if (mcp === 'url') {
    const url = `http://127.0.0.1:${port}/mcp${query}`;
    writeFileSync(file, `${JSON.stringify({ mcpServers: { wiser: { type: 'http', url } } })}\n`);
  } else if (mcp === 'malformed') {
    writeFileSync(file, '{');
  } else if (typeof mcp === 'string' && mcp !== 'missing') {
    writeFileSync(file, mcp);
  }
  return { root, home, script: join(root, 'hooks', 'notice.mjs') };
}

function runChild(script, env, event, { killAfter = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [script], {
      env,
      cwd: env.HOME,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out = [];
    const err = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    const killer = setTimeout(() => child.kill('SIGKILL'), killAfter);
    child.on('error', (error) => {
      clearTimeout(killer);
      reject(error);
    });
    child.on('close', (status) => {
      clearTimeout(killer);
      resolve({
        status,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        elapsed: Date.now() - started,
      });
    });
    if (event === undefined) child.stdin.end();
    else child.stdin.end(typeof event === 'string' ? event : JSON.stringify(event));
  });
}

function listen(handler) {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('error', () => {});
    res.on('error', () => {});
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: { ...req.headers },
        body: Buffer.concat(chunks).toString('utf8'),
      });
      try {
        handler(req, res);
      } catch {
        // a test handler can fail after the request is recorded
      }
    });
  });
  server.on('clientError', () => {});
  server.on('error', () => {});
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        requests,
        close() {
          server.closeAllConnections();
          return new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}

function assertQuiet(result, label) {
  assert.equal(result.status, 0, `${label} stderr=${result.stderr}`);
  assert.equal(result.stdout, '', label);
  assert.equal(result.stderr, '', label);
}

function assertUntouched(root, home, beforeRoot, beforeHome) {
  assert.deepEqual(treeDigest(root), beforeRoot);
  assert.deepEqual(treeDigest(home), beforeHome);
}

function assertPrivate(record, marker) {
  assert.equal(record.method, 'GET');
  assert.equal(record.url, '/notice');
  assert.equal(record.body, '');
  const names = Object.keys(record.headers).map((name) => name.toLowerCase());
  assert.equal(names.includes('authorization'), false);
  assert.equal(names.includes('cookie'), false);
  assert.equal(JSON.stringify(record).includes(marker), false);
}

const startup = {
  hook_event_name: 'SessionStart',
  source: 'startup',
  session_id: MARKER,
  prompt: MARKER,
  cwd: `/tmp/${MARKER}`,
  extra: { token: MARKER },
};

test('resolveNoticeUrl keeps https and the loopback seam, and drops the rest', () => {
  const prev = process.env.WISER_NOTICE_TEST_LOOPBACK;
  try {
    delete process.env.WISER_NOTICE_TEST_LOOPBACK;
    assert.equal(resolveNoticeUrl('https://example.com/mcp?q=1#f'), 'https://example.com/notice');
    assert.equal(resolveNoticeUrl('https://example.com:8443/mcp'), 'https://example.com:8443/notice');
    assert.equal(resolveNoticeUrl('http://127.0.0.1:9/mcp?q=1'), null);
    assert.equal(resolveNoticeUrl('http://localhost/mcp'), null);
    assert.equal(resolveNoticeUrl('http://[::1]/mcp'), null);
    assert.equal(resolveNoticeUrl('https://user:pass@example.com/mcp'), null);
    assert.equal(resolveNoticeUrl('not a url'), null);

    process.env.WISER_NOTICE_TEST_LOOPBACK = '1';
    assert.equal(resolveNoticeUrl('http://127.0.0.1:9/mcp?q=secret#frag'), 'http://127.0.0.1:9/notice');
    assert.equal(resolveNoticeUrl('http://localhost:9/a'), 'http://localhost:9/notice');
    assert.equal(resolveNoticeUrl('http://[::1]:9/a?q=1'), 'http://[::1]:9/notice');
    assert.equal(resolveNoticeUrl('http://[0:0:0:0:0:0:0:1]:9/a'), 'http://[::1]:9/notice');
    assert.equal(resolveNoticeUrl('http://user@127.0.0.1/mcp'), null);
    assert.equal(resolveNoticeUrl('http://:secret@127.0.0.1/mcp'), null);
    assert.equal(resolveNoticeUrl('http://127.0.0.1.example/mcp'), null);
    assert.equal(resolveNoticeUrl('http://localhost./mcp'), null);
    assert.equal(resolveNoticeUrl('http://example.com/mcp'), null);
    assert.equal(resolveNoticeUrl('https://example.com/mcp?q=1#f'), 'https://example.com/notice');
  } finally {
    if (prev === undefined) delete process.env.WISER_NOTICE_TEST_LOOPBACK;
    else process.env.WISER_NOTICE_TEST_LOOPBACK = prev;
  }
});

test('a notice is one systemMessage line and the request carries nothing private', async () => {
  const server = await listen((req, res) => {
    const body = JSON.stringify({ id: 'n-1', text: 'The desk is clear.' });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
  });
  try {
    const plugin = makePlugin(server.port, { query: `?sent=${MARKER}#${MARKER}` });
    const beforeRoot = treeDigest(plugin.root);
    const beforeHome = treeDigest(plugin.home);
    const extra = { NOTICE_LEAK_MARKER: MARKER };
    const runs = [
      childEnv(plugin.home, plugin.root, { extra }),
      childEnv(plugin.home, plugin.root, { pluginRoot: false, extra }),
      childEnv(plugin.home, plugin.root, { pluginRoot: false, extra: { ...extra, CLAUDE_PLUGIN_ROOT: '' } }),
    ];
    for (const env of runs) {
      const result = await runChild(plugin.script, env, startup);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '{"systemMessage":"Wiser: The desk is clear."}\n');
      assert.equal(result.stderr, '');
      const doc = JSON.parse(result.stdout);
      assert.deepEqual(Object.keys(doc), ['systemMessage']);
      assert.equal(doc.systemMessage, 'Wiser: The desk is clear.');
      assert.equal(doc.hookSpecificOutput, undefined);
      assert.equal(doc.additionalContext, undefined);
    }
    assert.equal(server.requests.length, runs.length);
    for (const record of server.requests) assertPrivate(record, MARKER);
    assertUntouched(plugin.root, plugin.home, beforeRoot, beforeHome);
    assert.equal(existsSync(join(plugin.root, '.mcp.json')), true);
  } finally {
    await server.close();
  }
});

test('404, non-JSON, and a missing or blank text print nothing', async () => {
  const cases = [
    { label: '404', status: 404, body: JSON.stringify({ text: 'hidden' }) },
    { label: 'non-json', status: 200, body: 'not json' },
    { label: 'missing text', status: 200, body: JSON.stringify({ id: 'only' }) },
    { label: 'number text', status: 200, body: JSON.stringify({ text: 1 }) },
    { label: 'null text', status: 200, body: JSON.stringify({ text: null }) },
    { label: 'blank text', status: 200, body: JSON.stringify({ text: ' \n\t\u200b\ufeff ' }) },
    { label: 'empty text', status: 200, body: JSON.stringify({ text: '' }) },
    { label: 'array', status: 200, body: JSON.stringify([{ text: 'hi' }]) },
    { label: 'string', status: 200, body: JSON.stringify('hi') },
    { label: 'null', status: 200, body: 'null' },
  ];
  let index = 0;
  const server = await listen((req, res) => {
    const item = cases[index];
    index += 1;
    res.writeHead(item.status, { 'Content-Type': 'application/json' });
    res.end(item.body);
  });
  try {
    const plugin = makePlugin(server.port);
    for (const item of cases) {
      const before = server.requests.length;
      const result = await runChild(plugin.script, childEnv(plugin.home, plugin.root), startup);
      assertQuiet(result, item.label);
      assert.equal(server.requests.length, before + 1, item.label);
      assert.equal(server.requests.at(-1).url, '/notice', item.label);
    }
  } finally {
    await server.close();
  }
});

test('controls and format characters are spaces, then the text is trimmed and capped', async () => {
  const pair = '\uD800\uDC00';
  const controls = '\u0000\u001fA\u007f\u009f\u200b\u202e\u2066B\u2067\u2068\u2069\ufeff';
  const cases = [
    { text: controls, message: `A${' '.repeat(5)}B` },
    { text: '  hello  ', message: 'hello' },
    { text: 'say "hi" \\ there', message: 'say "hi" \\ there' },
    { text: 'a'.repeat(600), message: 'a'.repeat(500) },
    { text: `${'b'.repeat(499)}${pair}z`, message: 'b'.repeat(499) },
    { text: `${'c'.repeat(498)}${pair}`, message: `${'c'.repeat(498)}${pair}` },
  ];
  let index = 0;
  const server = await listen((req, res) => {
    const item = cases[index];
    index += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 's', text: item.text }));
  });
  try {
    const plugin = makePlugin(server.port);
    for (const item of cases) {
      const result = await runChild(plugin.script, childEnv(plugin.home, plugin.root), startup);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout, `${JSON.stringify({ systemMessage: `Wiser: ${item.message}` })}\n`);
    }
  } finally {
    await server.close();
  }
});

test('a body over 16384 bytes prints nothing, and one at the limit is capped', async () => {
  function payload(bytes) {
    const overhead = Buffer.byteLength(JSON.stringify({ id: 'n', text: '' }));
    const text = 'm'.repeat(bytes - overhead);
    const body = Buffer.from(JSON.stringify({ id: 'n', text }));
    assert.equal(body.length, bytes);
    return body;
  }
  const bodies = [payload(16384), payload(16385)];
  let index = 0;
  const server = await listen((req, res) => {
    const body = bodies[index];
    index += 1;
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': body.length,
    });
    res.end(body);
  });
  try {
    const plugin = makePlugin(server.port);
    const env = childEnv(plugin.home, plugin.root);
    const atLimit = await runChild(plugin.script, env, startup);
    assert.equal(atLimit.status, 0, atLimit.stderr);
    assert.equal(atLimit.stderr, '');
    assert.equal(atLimit.stdout, `${JSON.stringify({ systemMessage: `Wiser: ${'m'.repeat(500)}` })}\n`);
    const over = await runChild(plugin.script, env, startup);
    assertQuiet(over, 'over limit');
    assert.equal(server.requests.length, 2);
  } finally {
    await server.close();
  }
});

test('a redirect is not followed', async () => {
  const server = await listen((req, res) => {
    if (req.url === '/notice') {
      res.writeHead(302, { Location: '/second' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text: 'followed' }));
  });
  try {
    const plugin = makePlugin(server.port);
    const result = await runChild(plugin.script, childEnv(plugin.home, plugin.root), startup);
    assertQuiet(result, 'redirect');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(server.requests.length, 1);
    assert.equal(server.requests[0].url, '/notice');
  } finally {
    await server.close();
  }
});

test('a server that never answers exits 0 with no output', { timeout: 10000 }, async () => {
  const server = await listen(() => {});
  try {
    const plugin = makePlugin(server.port);
    const result = await runChild(plugin.script, childEnv(plugin.home, plugin.root), startup);
    assertQuiet(result, 'silent server');
    assert.ok(result.elapsed < 3500, `elapsed ${result.elapsed}`);
    assert.ok(result.elapsed >= 1000, `elapsed ${result.elapsed}`);
    assert.equal(server.requests.length, 1);
    assert.equal(server.requests[0].url, '/notice');
  } finally {
    await server.close();
  }
});

test('a server that stalls mid-body exits 0 with no output', { timeout: 10000 }, async () => {
  const server = await listen((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"text":"hello');
  });
  try {
    const plugin = makePlugin(server.port);
    const result = await runChild(plugin.script, childEnv(plugin.home, plugin.root), startup);
    assertQuiet(result, 'stalled body');
    assert.ok(result.elapsed < 3500, `elapsed ${result.elapsed}`);
    assert.ok(result.elapsed >= 1000, `elapsed ${result.elapsed}`);
    assert.equal(server.requests.length, 1);
  } finally {
    await server.close();
  }
});

test('a missing or malformed config makes no request', async () => {
  const server = await listen((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text: 'should not be fetched' }));
  });
  try {
    const kinds = [
      'missing',
      'malformed',
      JSON.stringify({ mcpServers: {} }),
      JSON.stringify({ mcpServers: { wiser: { url: 1 } } }),
      JSON.stringify({ mcpServers: { wiser: { type: 'http' } } }),
    ];
    for (const mcp of kinds) {
      const plugin = makePlugin(server.port, { mcp });
      const beforeRoot = treeDigest(plugin.root);
      const beforeHome = treeDigest(plugin.home);
      const before = server.requests.length;
      const result = await runChild(plugin.script, childEnv(plugin.home, plugin.root), startup);
      assertQuiet(result, mcp === 'missing' || mcp === 'malformed' ? mcp : 'bad url');
      assert.equal(server.requests.length, before);
      assertUntouched(plugin.root, plugin.home, beforeRoot, beforeHome);
    }
  } finally {
    await server.close();
  }
});

test('the loopback seam unset makes no request', async () => {
  const server = await listen((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text: 'should not be fetched' }));
  });
  try {
    const plugin = makePlugin(server.port, { query: '?sent=loop' });
    const result = await runChild(
      plugin.script,
      childEnv(plugin.home, plugin.root, { loopback: false }),
      startup,
    );
    assertQuiet(result, 'seam unset');
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

test('WISER_DISABLE_NOTICES=1 makes no request and writes no file', async () => {
  const server = await listen((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text: 'should not be fetched' }));
  });
  try {
    const plugin = makePlugin(server.port);
    const beforeRoot = treeDigest(plugin.root);
    const beforeHome = treeDigest(plugin.home);
    const result = await runChild(
      plugin.script,
      childEnv(plugin.home, plugin.root, { disable: true, extra: { NOTICE_LEAK_MARKER: MARKER } }),
      startup,
    );
    assertQuiet(result, 'disabled');
    assert.equal(server.requests.length, 0);
    assertUntouched(plugin.root, plugin.home, beforeRoot, beforeHome);
  } finally {
    await server.close();
  }
});

test('credentials on a loopback address make no request', async () => {
  const server = await listen((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text: 'should not be fetched' }));
  });
  try {
    const plugin = makePlugin(server.port, { mcp: 'missing' });
    writeFileSync(join(plugin.root, '.mcp.json'), `${JSON.stringify({
      mcpServers: { wiser: { type: 'http', url: `http://user:pass@127.0.0.1:${server.port}/mcp?sent=${MARKER}` } },
    })}\n`);
    const result = await runChild(plugin.script, childEnv(plugin.home, plugin.root), startup);
    assertQuiet(result, 'credentials');
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

test('unexpected input exits 0 and makes no request', async () => {
  const server = await listen((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text: 'should not be fetched' }));
  });
  try {
    const plugin = makePlugin(server.port);
    for (const event of ['not json', '', '[]', 'null']) {
      const result = await runChild(plugin.script, childEnv(plugin.home, plugin.root), event);
      assertQuiet(result, JSON.stringify(event));
    }
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});
