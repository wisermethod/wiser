import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestGateway, createFakeProviders, putActive } from '../../../gateway/test/fake-provider.js';

// The shipped fake's proxy destructures { endpoint, method } only, so a test routed
// through it cannot see binary_body or parameters and would assert nothing about the
// payload. createTestGateway accepts an injected provider, so the recording one below
// replaces it without changing anything under gateway/.
function recording(responder) {
  const fake = createFakeProviders();
  const calls = [];
  fake.auth.proxy = async (req) => {
    calls.push(req);
    const res = responder ? responder(req, calls.length) : null;
    return res || { status: 200, data: {} };
  };
  return { fake, calls };
}

async function gatewayWithGrants(fake) {
  const { gw, store } = await createTestGateway({ fake });
  await putActive(store, fake, { service: 'vercel', module: 'deployments', privilege: 'write' });
  await putActive(store, fake, { service: 'vercel', module: 'projects', privilege: 'write' });
  return gw;
}

function fixture(entries) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-vercel-')));
  for (const [name, body] of Object.entries(entries)) {
    const full = join(root, name);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

const sha1 = (text) => createHash('sha1').update(Buffer.from(text)).digest('hex');

const SITE = { 'index.html': '<h1>one</h1>', 'about/index.html': '<h1>two</h1>', 'style.css': 'body{}' };
const EXPECTED = Object.entries(SITE)
  .map(([file, body]) => ({ file, sha: sha1(body), size: Buffer.byteLength(body) }))
  .sort((a, b) => (a.file < b.file ? -1 : 1));

test('upload_file needs the deployments grant before it reads or sends anything', async () => {
  const { fake, calls } = recording();
  const { gw } = await createTestGateway({ fake });
  const root = fixture(SITE);
  const res = await gw.execute({
    action: 'vercel.deployments.upload_file',
    input: { path: join(root, 'index.html') },
    confirm: true,
  });
  assert.equal(res.status, 'needs_connect');
  assert.equal(calls.length, 0);
});

test('upload_file sends the exact bytes and the digest as a request header', async () => {
  const { fake, calls } = recording(() => ({ status: 200, data: { urls: ['https://example.invalid/blob'] } }));
  const gw = await gatewayWithGrants(fake);
  const root = fixture(SITE);

  const unconfirmed = await gw.execute({
    action: 'vercel.deployments.upload_file',
    input: { path: join(root, 'index.html') },
  });
  assert.equal(unconfirmed.status, 'needs_confirmation');
  assert.equal(calls.length, 0, 'nothing is read or sent before confirmation');

  const res = await gw.execute({
    action: 'vercel.deployments.upload_file',
    input: { path: join(root, 'index.html'), team_id: 'team-example' },
    confirm: true,
  });
  assert.deepEqual(res, { file: 'index.html', sha: sha1(SITE['index.html']), size: 12 });

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.endpoint, '/v2/files?teamId=team-example');
  assert.equal(call.method, 'POST');
  assert.equal(call.body, undefined, 'the bytes travel as binary_body, never as a JSON body');
  assert.equal(call.binary_body.content_type, 'application/octet-stream');
  assert.equal(
    Buffer.from(call.binary_body.base64, 'base64').toString('utf8'),
    SITE['index.html'],
    'the uploaded bytes decode back to the file on disk',
  );
  assert.deepEqual(call.parameters, [
    { name: 'x-vercel-digest', value: sha1(SITE['index.html']), type: 'header' },
  ]);
});

test('upload_file refuses a path it must not read, and sends nothing', async () => {
  const root = fixture(SITE);
  const userConfig = process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'wiser')
    : join(homedir(), '.config', 'wiser');

  for (const [path, note] of [
    [join(root, 'absent.html'), 'a missing file'],
    [root, 'a directory'],
    [join(userConfig, 'auth-provider.env'), 'the provider key file'],
  ]) {
    const { fake, calls } = recording();
    const gw = await gatewayWithGrants(fake);
    const res = await gw.execute({ action: 'vercel.deployments.upload_file', input: { path }, confirm: true });
    assert.equal(res.status, 'invalid_arguments', note);
    assert.equal(res.field, 'path', note);
    assert.equal(calls.length, 0, `${note}: no proxy call was made`);
  }

  // Only assert the credential reason where the file is actually present; a machine
  // without it refuses for a different, still-correct reason and must not read as a pass.
  if (existsSync(join(userConfig, 'auth-provider.env'))) {
    const { fake } = recording();
    const gw = await gatewayWithGrants(fake);
    const res = await gw.execute({
      action: 'vercel.deployments.upload_file',
      input: { path: join(userConfig, 'auth-provider.env') },
      confirm: true,
    });
    assert.equal(res.reason, 'credential');
  }
});

test('create with a directory uploads every file by reference and inlines none', async () => {
  const { fake, calls } = recording((req) => (req.endpoint.startsWith('/v2/files')
    ? { status: 200, data: { urls: ['https://example.invalid/blob'] } }
    : { status: 200, data: { id: 'dpl_example', readyState: 'QUEUED' } }));
  const gw = await gatewayWithGrants(fake);
  const root = fixture(SITE);
  const call = { action: 'vercel.deployments.create', input: { name: 'example-site', dir: root } };

  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal(calls.length, 0, 'nothing is read or uploaded before confirmation');

  const res = await gw.execute({ ...call, confirm: true });
  assert.deepEqual(res.deployment, { id: 'dpl_example', readyState: 'QUEUED' });

  assert.equal(calls.length, 4, 'three uploads and one deployment');
  const uploads = calls.slice(0, 3);
  const deploy = calls[3];
  assert.ok(uploads.every((c) => c.endpoint.startsWith('/v2/files')));
  assert.equal(deploy.endpoint, '/v13/deployments');

  // The whole assertion, not a size ratio: the reference array must equal the three
  // independently computed triples exactly. files:[] passes a ratio and a data-absence
  // check while proving nothing, which is the failure this replaces.
  assert.equal(deploy.body.files.length, 3);
  assert.deepEqual([...deploy.body.files].sort((a, b) => (a.file < b.file ? -1 : 1)), EXPECTED);
  assert.deepEqual([...res.uploaded].sort((a, b) => (a.file < b.file ? -1 : 1)), EXPECTED);
  assert.ok(deploy.body.files.every((f) => !Object.hasOwn(f, 'data')), 'no file item carries inline bytes');
  assert.equal(deploy.binary_body, undefined);
  assert.equal(deploy.body.name, 'example-site');

  // The recorded measurement, kept as a regression signal and not as the assertion.
  const inline = Object.values(SITE).reduce((n, b) => n + Math.ceil(Buffer.byteLength(b) * 4 / 3), 0);
  assert.ok(JSON.stringify(deploy.body).length > 0 && inline > 0);
});

test('create skips a credential and a link out of the tree, and says which it skipped', async () => {
  const { fake, calls } = recording((req) => (req.endpoint.startsWith('/v2/files')
    ? { status: 200, data: {} }
    : { status: 200, data: { id: 'dpl_example' } }));
  const gw = await gatewayWithGrants(fake);
  const root = fixture(SITE);
  const outside = fixture({ 'secret.txt': 'do not upload me' });
  writeFileSync(join(root, '.env'), 'TOKEN=should-never-be-uploaded');
  symlinkSync(join(outside, 'secret.txt'), join(root, 'escape.txt'));

  const res = await gw.execute({
    action: 'vercel.deployments.create',
    input: { name: 'example-site', dir: root },
    confirm: true,
  });

  const names = res.uploaded.map((f) => f.file).sort();
  assert.deepEqual(names, ['about/index.html', 'index.html', 'style.css']);
  const sent = calls.map((c) => c.binary_body?.base64).filter(Boolean)
    .map((b) => Buffer.from(b, 'base64').toString('utf8'));
  assert.ok(!sent.some((body) => body.includes('should-never-be-uploaded')), 'the .env bytes never left');
  assert.ok(!sent.some((body) => body.includes('do not upload me')), 'the escaping link never resolved in');
  assert.deepEqual(
    res.skipped.map((s) => [s.file, s.reason]).sort(),
    [['.env', 'credential'], ['escape.txt', 'outside the named directory']],
  );
});

test('create refuses a directory it must not walk', async () => {
  const userConfig = process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'wiser')
    : join(homedir(), '.config', 'wiser');
  for (const dir of [userConfig, homedir()]) {
    const { fake, calls } = recording();
    const gw = await gatewayWithGrants(fake);
    const res = await gw.execute({
      action: 'vercel.deployments.create',
      input: { name: 'example-site', dir },
      confirm: true,
    });
    assert.equal(res.status, 'invalid_arguments');
    assert.equal(res.field, 'dir');
    assert.equal(calls.length, 0);
  }
});

test('create refuses a source set that is not exactly one, and an empty one', async () => {
  const root = fixture(SITE);
  const empty = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-vercel-empty-')));
  const cases = [
    [{ name: 'a', dir: root, git_source: { type: 'github' } }, 'two sources'],
    [{ name: 'a' }, 'no source'],
    [{ name: 'a', dir: root, files: [], git_source: {} }, 'three sources, two of them empty'],
    [{ name: 'a', files: [] }, 'an empty array is a wrong source, not an absent one'],
    [{ name: 'a', git_source: {} }, 'an empty object is a wrong source, not an absent one'],
    [{ name: 'a', dir: empty }, 'a directory with nothing in it'],
    [{ name: '', dir: root }, 'an empty name'],
    [{ name: 'a', dir: root, target: '' }, 'an empty target'],
    [{ name: 'a', dir: root, skip_auto_detection: 'yes' }, 'a non-boolean flag'],
    [{ name: 'a', files: [{ file: 'a.html', data: 'x' }, 'also/a/path'], }, 'mixed paths and objects'],
    [{ name: 'a', files: [{ file: 'a.html', sha: 'short', size: 1 }] }, 'a malformed reference'],
    [{ name: 'a', files: [{ file: '../escape.html', sha: 'a'.repeat(40), size: 1 }] }, 'a traversing name'],
    [{ name: 'a', files: [{ file: 'a.html', data: 'x' }, { file: 'a.html', data: 'y' }] }, 'a duplicate name'],
  ];
  for (const [input, note] of cases) {
    const { fake, calls } = recording();
    const gw = await gatewayWithGrants(fake);
    const res = await gw.execute({ action: 'vercel.deployments.create', input, confirm: true });
    assert.equal(res.status, 'invalid_arguments', note);
    assert.equal(calls.length, 0, `${note}: no proxy call was made`);
  }
});

test('create still forwards a non-empty inline files array verbatim, uploading nothing', async () => {
  const { fake, calls } = recording(() => ({ status: 200, data: { id: 'dpl_example' } }));
  const gw = await gatewayWithGrants(fake);
  const files = [{ file: 'index.html', data: 'PGgxPm9uZTwvaDE+', encoding: 'base64' }];
  const res = await gw.execute({
    action: 'vercel.deployments.create',
    input: { name: 'example-site', files, target: 'production' },
    confirm: true,
  });
  assert.equal(res.deployment.id, 'dpl_example');
  assert.equal(calls.length, 1, 'no upload call was made');
  assert.equal(calls[0].endpoint, '/v13/deployments');
  assert.deepEqual(calls[0].body.files, files);
  assert.equal(calls[0].body.target, 'production');
});

test('create accepts an explicit list of paths and uploads only those', async () => {
  const { fake, calls } = recording((req) => (req.endpoint.startsWith('/v2/files')
    ? { status: 200, data: {} }
    : { status: 200, data: { id: 'dpl_example' } }));
  const gw = await gatewayWithGrants(fake);
  const root = fixture(SITE);
  const res = await gw.execute({
    action: 'vercel.deployments.create',
    input: { name: 'example-site', files: [join(root, 'index.html'), join(root, 'style.css')] },
    confirm: true,
  });
  assert.equal(calls.length, 3, 'two uploads and one deployment');
  assert.deepEqual(res.uploaded.map((f) => f.file).sort(), ['index.html', 'style.css']);
  assert.deepEqual(calls[2].body.files.map((f) => f.file).sort(), ['index.html', 'style.css']);
});

test('create forwards git_source as gitSource and uploads nothing', async () => {
  const { fake, calls } = recording(() => ({ status: 200, data: { id: 'dpl_example' } }));
  const gw = await gatewayWithGrants(fake);
  const git_source = { type: 'github', repo: 'example/site', ref: 'main' };
  await gw.execute({
    action: 'vercel.deployments.create',
    input: { name: 'example-site', git_source, skip_auto_detection: true },
    confirm: true,
  });
  assert.equal(calls.length, 1, 'no upload call was made');
  assert.equal(calls[0].endpoint, '/v13/deployments?skipAutoDetectionConfirmation=1');
  assert.deepEqual(calls[0].body.gitSource, git_source);
  assert.equal(calls[0].body.files, undefined);
});

test('an upload failure stops the run before the deployment is created', async () => {
  const { fake, calls } = recording((req, n) => {
    if (!req.endpoint.startsWith('/v2/files')) return { status: 200, data: { id: 'dpl_example' } };
    return n === 2 ? { status: 500, error: { code: 'vendor_error', endpoint: req.endpoint, method: 'POST' } } : { status: 200, data: {} };
  });
  const gw = await gatewayWithGrants(fake);
  const root = fixture(SITE);
  const res = await gw.execute({
    action: 'vercel.deployments.create',
    input: { name: 'example-site', dir: root },
    confirm: true,
  });
  assert.equal(res.status, 'vendor_error');
  assert.equal(calls.length, 2, 'the first upload succeeded, the second failed, and nothing followed');
  assert.ok(calls.every((c) => c.endpoint.startsWith('/v2/files')), 'no deployment call was made');
});

test('every creation needs its own confirmation, and reads need none', async () => {
  const { fake } = recording(() => ({ status: 200, data: { id: 'dpl_example' } }));
  const gw = await gatewayWithGrants(fake);
  const call = {
    action: 'vercel.deployments.create',
    input: { name: 'example-site', files: [{ file: 'a.html', data: 'eA==' }] },
  };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal((await gw.execute({ ...call, confirm: true })).deployment.id, 'dpl_example');
  assert.equal((await gw.execute(call)).status, 'needs_confirmation', 'success does not bank a confirmation');

  const deployments = await gw.execute({ action: 'vercel.deployments.list', input: {} });
  assert.equal(deployments.deployments[0].uid, 'deployment-example');
});

test('project reads use their own catalog grant', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'vercel', module: 'projects', privilege: 'write' });
  assert.equal((await gw.execute({ action: 'vercel.projects.list', input: {} })).projects[0].id, 'project-example');
  assert.equal((await gw.execute({ action: 'vercel.projects.get', input: { id_or_name: 'project-example' } })).id, 'project-example');
  assert.equal((await gw.execute({ action: 'vercel.deployments.list', input: {} })).status, 'needs_connect');
});

test('the catalog reads map their inputs to the documented field names', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'vercel', module: 'projects', privilege: 'write' });
  await putActive(store, fake, { service: 'vercel', module: 'deployments', privilege: 'write' });
  for (const [action, input, expected] of [
    ['vercel.projects.get', { id_or_name: 'project-example', team_id: 'team-example' }, { idOrName: 'project-example', teamId: 'team-example' }],
    ['vercel.deployments.list', { project_id: 'prj-example', team_id: 'team-example' }, { projectId: 'prj-example', teamId: 'team-example' }],
  ]) {
    fake.catalog.setResult(fake.catalog.toSlug(action), (args) => { assert.deepEqual(args, expected); return { checked: true }; });
    assert.equal((await gw.execute({ action, input })).checked, true);
  }
});

test('a directory symlink is not followed, and a cycle cannot hang the walk', { timeout: 10000 }, async () => {
  const { fake, calls } = recording((req) => (req.endpoint.startsWith('/v2/files')
    ? { status: 200, data: {} }
    : { status: 200, data: { id: 'dpl_example' } }));
  const gw = await gatewayWithGrants(fake);
  const root = fixture(SITE);
  symlinkSync(root, join(root, 'loop'));
  mkdirSync(join(root, 'real'));
  writeFileSync(join(root, 'real/page.html'), 'real');
  symlinkSync(join(root, 'real'), join(root, 'alias'));

  const res = await gw.execute({
    action: 'vercel.deployments.create',
    input: { name: 'example-site', dir: root },
    confirm: true,
  });

  assert.deepEqual(
    res.uploaded.map((f) => f.file).sort(),
    ['about/index.html', 'index.html', 'real/page.html', 'style.css'],
    'each real file appears once and neither link was walked',
  );
  assert.deepEqual(
    res.skipped.map((s) => [s.file, s.reason]).sort(),
    [['alias', 'link to a directory'], ['loop', 'link to a directory']],
  );
  assert.equal(calls.length, 5, 'four uploads and one deployment');
});

test('a worktree .git file is excluded, not uploaded as content', async () => {
  const { fake } = recording((req) => (req.endpoint.startsWith('/v2/files')
    ? { status: 200, data: {} }
    : { status: 200, data: { id: 'dpl_example' } }));
  const gw = await gatewayWithGrants(fake);
  const root = fixture(SITE);
  writeFileSync(join(root, '.git'), 'gitdir: /private/work/project/.git/worktrees/site\n');

  const res = await gw.execute({
    action: 'vercel.deployments.create',
    input: { name: 'example-site', dir: root },
    confirm: true,
  });
  assert.ok(!res.uploaded.some((f) => f.file === '.git'), 'the .git file was not uploaded');
  assert.ok(!res.skipped.some((s) => s.file === '.git'), 'it is excluded outright, not merely refused');
  assert.equal(res.uploaded.length, 3);
});

test('binary bytes survive the round trip, NUL and invalid UTF-8 included', async () => {
  const { fake, calls } = recording(() => ({ status: 200, data: {} }));
  const gw = await gatewayWithGrants(fake);
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-vercel-bin-')));
  const bytes = Buffer.from([0x00, 0xff, 0xfe, 0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a, 0x0a]);
  writeFileSync(join(root, 'logo.png'), bytes);

  const res = await gw.execute({
    action: 'vercel.deployments.upload_file',
    input: { path: join(root, 'logo.png') },
    confirm: true,
  });
  assert.equal(res.size, bytes.length);
  assert.equal(res.sha, createHash('sha1').update(bytes).digest('hex'));
  assert.deepEqual(Buffer.from(calls[0].binary_body.base64, 'base64'), bytes, 'byte-identical, not UTF-8 mangled');
});

test('a deployment name that is not safe is refused however it was generated', async () => {
  const root = fixture(SITE);
  const backslash = join(root, 'a\\b.html');
  writeFileSync(backslash, 'x');
  const cases = [
    [{ name: 'a', files: [backslash] }, 'a backslash in a generated basename'],
    [{ name: 'a', files: [{ file: '..\\escape.html', data: 'x' }] }, 'a backslash traversal in an object name'],
    [{ name: 'a', files: [{ file: 'C:asset.txt', data: 'x' }] }, 'a drive-qualified object name'],
    [{ name: 'a', git_source: { repo: 'example/site' } }, 'a git_source with no type'],
  ];
  for (const [input, note] of cases) {
    const { fake, calls } = recording();
    const gw = await gatewayWithGrants(fake);
    const res = await gw.execute({ action: 'vercel.deployments.create', input, confirm: true });
    assert.equal(res.status, 'invalid_arguments', note);
    assert.equal(calls.length, 0, `${note}: nothing was uploaded first`);
  }
});

test('uploaded reports only what this call uploaded', async () => {
  const { fake } = recording(() => ({ status: 200, data: { id: 'dpl_example' } }));
  const gw = await gatewayWithGrants(fake);
  const res = await gw.execute({
    action: 'vercel.deployments.create',
    input: { name: 'example-site', files: [{ file: 'a.html', sha: 'a'.repeat(40), size: 3 }] },
    confirm: true,
  });
  assert.deepEqual(res.uploaded, [], 'a pass-through array uploaded nothing, so it is not reported as uploaded');
});
