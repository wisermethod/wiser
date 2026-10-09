import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modules } from '../index.js';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

const ZONE = '0123456789abcdef0123456789abcdef';
const ACCOUNT = 'fedcba9876543210fedcba9876543210';
const RS = 'ruleset_1';
const RULE = 'rule_1';
const LIST = 'list_1';
const OP = 'op_1';

function envelope(result, extra = {}) {
  return { data: { success: true, errors: [], messages: [], result, ...extra } };
}

function vendorSignal(http_status, endpoint = '/x', method = 'GET') {
  return { object: { status: 'vendor_error', http_status, endpoint, method } };
}

function recording(responder) {
  const calls = [];
  const ctx = {
    async proxy(req) {
      calls.push(req);
      const out = await responder(req, calls.length);
      return out;
    },
  };
  return { calls, ctx };
}

function refused(result, field) {
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(result.field, field);
}

const rule = { action: 'redirect', expression: 'true' };
const hsts = {
  enabled: true,
  max_age: 31536000,
  include_subdomains: true,
  preload: false,
  nosniff: true,
};

test('manifest declares the new actions with confirmation, risk, and proxy', () => {
  const expect = {
    'zones.get_settings': ['low', 'none'],
    'zones.get_setting': ['low', 'none'],
    'zones.update_setting': ['high', 'always'],
    'zones.get_bot_management': ['low', 'none'],
    'zones.list_certificate_packs': ['low', 'none'],
    'zones.list_workers_routes': ['low', 'none'],
    'zones.list_access_apps': ['low', 'none'],
    'rulesets.list': ['low', 'none'],
    'rulesets.get_phase_entrypoint': ['low', 'none'],
    'rulesets.list_page_rules': ['low', 'none'],
    'rulesets.list_lists': ['low', 'none'],
    'rulesets.list_list_items': ['low', 'none'],
    'rulesets.get_bulk_operation': ['low', 'none'],
    'rulesets.put_phase_entrypoint': ['high', 'always'],
    'rulesets.add_rule': ['high', 'always'],
    'rulesets.update_rule': ['high', 'always'],
    'rulesets.reorder_rule': ['high', 'always'],
    'rulesets.remove_rule': ['destructive', 'always'],
    'rulesets.create_list': ['high', 'always'],
    'rulesets.add_list_items': ['high', 'always'],
    'rulesets.remove_list_items': ['destructive', 'always'],
    'rulesets.delete_list': ['destructive', 'always'],
    'pages.list_domains': ['low', 'none'],
    'pages.get_domain': ['low', 'none'],
    'pages.retry_domain_validation': ['high', 'always'],
  };
  for (const [id, [risk, confirmation]] of Object.entries(expect)) {
    const [mod, action] = id.split('.');
    const row = manifest.modules[mod].actions[action];
    assert.equal(row.risk, risk, id);
    assert.equal(row.confirmation, confirmation, id);
    assert.equal(row.execution.prefer, 'proxy', id);
    assert.equal(row.input.additionalProperties, false, id);
  }
  assert.equal(manifest.modules.rulesets.actions.create.execution.prefer, 'catalog');
  assert.equal(manifest.modules.rulesets.actions.get.execution.prefer, 'catalog');
  // delete moved to the proxy 2026-10-09 after the catalog tool answered 400 live.
  assert.equal(manifest.modules.rulesets.actions.delete.execution.prefer, 'proxy');
});

test('zone reads send the catalog paths and refuse a bad zone id', async () => {
  const cases = [
    ['get_settings', { zone_id: ZONE }, 'GET', `/zones/${ZONE}/settings`, undefined],
    ['get_setting', { zone_id: ZONE, setting_id: 'ssl' }, 'GET', `/zones/${ZONE}/settings/ssl`, undefined],
    ['get_bot_management', { zone_id: ZONE }, 'GET', `/zones/${ZONE}/bot_management`, undefined],
    ['list_certificate_packs', { zone_id: ZONE }, 'GET', `/zones/${ZONE}/ssl/certificate_packs?status=all`, undefined],
    ['list_workers_routes', { zone_id: ZONE }, 'GET', `/zones/${ZONE}/workers/routes`, undefined],
  ];
  for (const [action, input, method, endpoint] of cases) {
    const { calls, ctx } = recording(async () => envelope({ id: 'one' }));
    const result = await modules.zones[action](input, ctx);
    assert.equal(result.success, true, action);
    assert.equal(calls.length, 1, action);
    assert.equal(calls[0].method, method, action);
    assert.equal(calls[0].endpoint, endpoint, action);
    assert.equal(Object.hasOwn(calls[0], 'body'), false, action);
    const { calls: none, ctx: dead } = recording(async () => { throw new Error('called'); });
    refused(await modules.zones[action]({ ...input, zone_id: 'ABCDEF0123456789abcdef0123456789' }, dead), 'zone_id');
    assert.equal(none.length, 0, action);
  }
  const { calls, ctx } = recording(async () => { throw new Error('called'); });
  refused(await modules.zones.get_setting({ zone_id: ZONE, setting_id: 'SSL' }, ctx), 'setting_id');
  refused(await modules.zones.get_setting({ zone_id: ZONE, setting_id: 'a'.repeat(65) }, ctx), 'setting_id');
  assert.equal(calls.length, 0);
});

test('update_setting reads before, patches, reads after, and reports applied', async () => {
  const seen = [];
  const { calls, ctx } = recording(async (req) => {
    seen.push(req.method);
    if (req.method === 'GET' && seen.filter((m) => m === 'GET').length === 1) return envelope({ id: 'ssl', value: 'off' });
    if (req.method === 'PATCH') return envelope({ id: 'ssl', value: 'full' });
    return envelope({ id: 'ssl', value: 'full' });
  });
  const result = await modules.zones.update_setting({ zone_id: ZONE, setting_id: 'ssl', value: 'full' }, ctx);
  assert.deepEqual(result, { success: true, setting_id: 'ssl', before: 'off', after: 'full', applied: true });
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'PATCH', 'GET']);
  assert.equal(calls[1].endpoint, `/zones/${ZONE}/settings/ssl`);
  assert.deepEqual(calls[1].body, { value: 'full' });

  const mismatched = await modules.zones.update_setting(
    { zone_id: ZONE, setting_id: 'ssl', value: 'strict' },
    recording(async (req) => envelope({ id: 'ssl', value: req.method === 'PATCH' ? 'strict' : 'full' })).ctx,
  );
  assert.equal(mismatched.before, 'full');
  assert.equal(mismatched.after, 'full');
  assert.equal(mismatched.applied, false);
});

test('update_setting compares a security header key by key and keeps a failed reread from looking like a failed write', async () => {
  const value = { strict_transport_security: hsts };
  const before = { strict_transport_security: { ...hsts, enabled: false } };
  const after = { strict_transport_security: { ...hsts }, modified_on: '2026-10-09' };
  let gets = 0;
  const ok = await modules.zones.update_setting(
    { zone_id: ZONE, setting_id: 'security_header', value },
    recording(async (req) => {
      if (req.method === 'GET') {
        gets += 1;
        return envelope({ id: 'security_header', value: gets === 1 ? before : after });
      }
      assert.deepEqual(req.body, { value });
      return envelope({ id: 'security_header', value });
    }).ctx,
  );
  assert.deepEqual(ok.before, before);
  assert.deepEqual(ok.after, after);
  assert.equal(ok.applied, true);

  const extra = await modules.zones.update_setting(
    { zone_id: ZONE, setting_id: 'security_header', value },
    recording(async () => envelope({
      id: 'security_header',
      value: { strict_transport_security: { ...hsts, preload: true } },
    })).ctx,
  );
  assert.equal(extra.applied, false);

  const thrown = recording(async (req) => {
    if (req.method === 'PATCH') return envelope({ id: 'ssl', value: 'full' });
    if (req.method === 'GET' && callsOf(thrown).length === 1) return envelope({ id: 'ssl', value: 'off' });
    throw new Error('read failed');
  });
  function callsOf(rec) { return rec.calls; }
  const failed = await modules.zones.update_setting({ zone_id: ZONE, setting_id: 'ssl', value: 'full' }, thrown.ctx);
  assert.deepEqual(failed, {
    success: true,
    setting_id: 'ssl',
    before: 'off',
    after: null,
    applied: null,
    reason: 'read after write failed',
  });
  assert.deepEqual(thrown.calls.map((call) => call.method), ['GET', 'PATCH', 'GET']);

  const falseRead = recording(async (req, n) => {
    if (n === 3) return { data: { success: false, errors: [{ code: 1 }], result: null } };
    if (req.method === 'PATCH') return envelope({ id: 'ssl', value: 'full' });
    return envelope({ id: 'ssl', value: 'off' });
  });
  const soft = await modules.zones.update_setting({ zone_id: ZONE, setting_id: 'ssl', value: 'full' }, falseRead.ctx);
  assert.equal(soft.reason, 'read after write failed');
  assert.equal(soft.success, true);
  assert.equal(soft.before, 'off');

  const early = recording(async () => { throw new Error('before'); });
  await assert.rejects(() => modules.zones.update_setting({ zone_id: ZONE, setting_id: 'ssl', value: 'full' }, early.ctx), /before/);
  assert.deepEqual(early.calls.map((call) => call.method), ['GET']);

  const patch = recording(async (req) => {
    if (req.method === 'PATCH') throw new Error('patch');
    return envelope({ id: 'ssl', value: 'off' });
  });
  await assert.rejects(() => modules.zones.update_setting({ zone_id: ZONE, setting_id: 'ssl', value: 'full' }, patch.ctx), /patch/);
  assert.deepEqual(patch.calls.map((call) => call.method), ['GET', 'PATCH']);

  const denied = recording(async () => ({ data: { success: false, errors: [], result: null } }));
  const stopped = await modules.zones.update_setting({ zone_id: ZONE, setting_id: 'ssl', value: 'full' }, denied.ctx);
  assert.equal(stopped.status, 'vendor_error');
  assert.deepEqual(denied.calls.map((call) => call.method), ['GET']);
});

test('update_setting refuses each setting value before any call', async () => {
  const { calls, ctx } = recording(async () => { throw new Error('called'); });
  const bad = [
    ['minify', 'full', 'setting_id'],
    ['ssl', 'on', 'value'],
    ['always_use_https', 'full', 'value'],
    ['automatic_https_rewrites', 'yes', 'value'],
    ['min_tls_version', '1.4', 'value'],
    ['security_header', { strict_transport_security: { ...hsts, extra: true } }, 'value'],
    ['security_header', { strict_transport_security: { ...hsts, max_age: 31536001 } }, 'value'],
    ['security_header', { strict_transport_security: { ...hsts, enabled: 'true' } }, 'value'],
    ['security_header', { enabled: true }, 'value'],
    ['ssl', { strict_transport_security: hsts }, 'value'],
  ];
  for (const [setting_id, value, field] of bad) {
    refused(await modules.zones.update_setting({ zone_id: ZONE, setting_id, value }, ctx), field);
  }
  refused(await modules.zones.update_setting({ zone_id: 'not-hex', setting_id: 'ssl', value: 'off' }, ctx), 'zone_id');
  assert.equal(calls.length, 0);
  const accepted = ['flexible', 'full', 'strict', 'off'];
  for (const value of accepted) {
    const one = await modules.zones.update_setting(
      { zone_id: ZONE, setting_id: 'ssl', value },
      recording(async () => envelope({ id: 'ssl', value })).ctx,
    );
    assert.equal(one.applied, true, value);
  }
  for (const setting_id of ['always_use_https', 'automatic_https_rewrites']) {
    const one = await modules.zones.update_setting(
      { zone_id: ZONE, setting_id, value: 'on' },
      recording(async () => envelope({ id: setting_id, value: 'on' })).ctx,
    );
    assert.equal(one.applied, true, setting_id);
  }
  const tls = await modules.zones.update_setting(
    { zone_id: ZONE, setting_id: 'min_tls_version', value: '1.2' },
    recording(async () => envelope({ id: 'min_tls_version', value: '1.2' })).ctx,
  );
  assert.equal(tls.applied, true);
});

test('list_access_apps follows pages and filters by host', async () => {
  const pages = recording(async (req) => {
    if (req.endpoint.endsWith('page=1')) {
      return envelope([{ id: 'a' }], { result_info: { total_pages: 2 } });
    }
    assert.equal(req.endpoint, `/accounts/${ACCOUNT}/access/apps?per_page=1000&page=2`);
    return envelope([{ id: 'b' }], { result_info: { total_pages: 2 } });
  });
  const listed = await modules.zones.list_access_apps({ account_id: ACCOUNT }, pages.ctx);
  assert.deepEqual(listed.result.map((row) => row.id), ['a', 'b']);
  assert.deepEqual(listed.unresolved, []);
  assert.equal(listed.filtered_by, null);
  assert.equal(listed.success, true);
  assert.equal(pages.calls[0].endpoint, `/accounts/${ACCOUNT}/access/apps?per_page=1000&page=1`);
  assert.equal(pages.calls[0].endpoint.includes('hostname'), false);

  const apps = [
    { id: 'domain', domain: 'WWW.Example.com.' },
    { id: 'self', domain: 'nope.example.net', self_hosted_domains: ['www.example.com'] },
    { id: 'dest', domain: 'nope.example.net', destinations: [{ uri: 'WWW.Example.com./path' }] },
    { id: 'wild', domain: '*.example.com' },
    { id: 'miss', domain: 'other.com', self_hosted_domains: ['example.org'], destinations: [{ uri: 'no.example.net/x' }] },
  ];
  const filtered = await modules.zones.list_access_apps(
    { account_id: ACCOUNT, hostname: 'www.example.com' },
    recording(async () => envelope(apps, { result_info: { total_pages: 1 } })).ctx,
  );
  assert.deepEqual(filtered.result.map((row) => row.id), ['domain', 'self', 'dest', 'wild']);
  assert.deepEqual(filtered.unresolved, []);
  assert.equal(filtered.filtered_by, 'www.example.com');

  const { calls, ctx } = recording(async () => { throw new Error('called'); });
  refused(await modules.zones.list_access_apps({ account_id: 'nope' }, ctx), 'account_id');
  refused(await modules.zones.list_access_apps({ account_id: ACCOUNT, hostname: '*.example.com' }, ctx), 'hostname');
  refused(await modules.zones.list_access_apps({ account_id: ACCOUNT, hostname: 'localhost' }, ctx), 'hostname');
  assert.equal(calls.length, 0);
});

test('list_access_apps keeps a destination that has no uri', async () => {
  const apps = [
    { id: 'worker', domain: 'other.example', destinations: [{ type: 'worker' }] },
    { id: 'all', destinations: [{ type: 'all_workers' }] },
    { id: 'blank', destinations: [{ uri: '' }] },
    { id: 'none', destinations: [{}] },
    { id: 'both', domain: 'www.example.com', destinations: [{ type: 'worker' }] },
    { id: 'uri', destinations: [{ uri: 'www.example.com/x' }] },
    { id: 'miss', domain: 'nope.example', destinations: [{ uri: 'no.example' }] },
    { id: 'empty', destinations: [] },
  ];
  const filtered = await modules.zones.list_access_apps(
    { account_id: ACCOUNT, hostname: 'www.example.com' },
    recording(async () => envelope(apps, { result_info: { total_pages: 1 } })).ctx,
  );
  assert.deepEqual(filtered.result.map((row) => row.id), ['worker', 'all', 'blank', 'none', 'both', 'uri']);
  assert.deepEqual(filtered.unresolved, ['worker', 'all', 'blank', 'none']);
});

test('ruleset list and list items follow two cursor pages', async () => {
  const listed = recording(async (req, n) => {
    if (n === 1) {
      assert.equal(req.endpoint, `/zones/${ZONE}/rulesets?per_page=50`);
      return envelope([{ id: 'one' }], { result_info: { cursors: { after: 'cursor-2' } } });
    }
    assert.equal(req.endpoint, `/zones/${ZONE}/rulesets?cursor=cursor-2&per_page=50`);
    return envelope([{ id: 'two' }], { result_info: { cursors: {} } });
  });
  const rules = await modules.rulesets.list({ accounts_or_zones: 'zones', account_or_zone_id: ZONE }, listed.ctx);
  assert.deepEqual(rules.result.map((row) => row.id), ['one', 'two']);
  assert.equal(rules.success, true);
  assert.equal(rules.result_info.count, 2);

  const items = recording(async (req, n) => {
    if (n === 1) return envelope([{ id: 'i1' }], { result_info: { cursors: { after: 'next' } } });
    assert.equal(req.endpoint, `/accounts/${ACCOUNT}/rules/lists/${LIST}/items?cursor=next&per_page=50`);
    return envelope([{ id: 'i2' }], { result_info: { cursors: { after: '' } } });
  });
  const rows = await modules.rulesets.list_list_items({ account_id: ACCOUNT, list_id: LIST }, items.ctx);
  assert.deepEqual(rows.result.map((row) => row.id), ['i1', 'i2']);
});

test('simple ruleset and pages reads and the pages validation retry', async () => {
  const reads = [
    [modules.rulesets.list_page_rules, { zone_id: ZONE }, 'GET', `/zones/${ZONE}/pagerules`],
    [modules.rulesets.list_lists, { account_id: ACCOUNT }, 'GET', `/accounts/${ACCOUNT}/rules/lists`],
    [modules.rulesets.get_bulk_operation, { account_id: ACCOUNT, operation_id: OP }, 'GET', `/accounts/${ACCOUNT}/rules/lists/bulk_operations/${OP}`],
    [modules.pages.list_domains, { account_id: ACCOUNT, project_name: 'effectivesc' }, 'GET', `/accounts/${ACCOUNT}/pages/projects/effectivesc/domains`],
    [modules.pages.get_domain, { account_id: ACCOUNT, project_name: 'effectivesc', domain: 'www.example.com' }, 'GET', `/accounts/${ACCOUNT}/pages/projects/effectivesc/domains/www.example.com`],
  ];
  for (const [fn, input, method, endpoint] of reads) {
    const { calls, ctx } = recording(async () => envelope({ id: 'one' }));
    const result = await fn(input, ctx);
    assert.equal(result.success, true);
    assert.equal(calls[0].method, method);
    assert.equal(calls[0].endpoint, endpoint);
    assert.equal(Object.hasOwn(calls[0], 'body'), false);
  }
  const retry = recording(async () => envelope({ status: 'pending' }));
  const retried = await modules.pages.retry_domain_validation(
    { account_id: ACCOUNT, project_name: 'effectivesc', domain: 'www.example.com' },
    retry.ctx,
  );
  assert.equal(retried.success, true);
  assert.equal(retry.calls[0].method, 'PATCH');
  assert.equal(retry.calls[0].endpoint, `/accounts/${ACCOUNT}/pages/projects/effectivesc/domains/www.example.com`);
  assert.equal(Object.hasOwn(retry.calls[0], 'body'), false);

  const { calls, ctx } = recording(async () => { throw new Error('called'); });
  refused(await modules.rulesets.list_page_rules({ zone_id: 'Z' }, ctx), 'zone_id');
  refused(await modules.rulesets.list_lists({ account_id: 'Z' }, ctx), 'account_id');
  refused(await modules.rulesets.get_bulk_operation({ account_id: ACCOUNT, operation_id: 'op/1' }, ctx), 'operation_id');
  refused(await modules.rulesets.list_list_items({ account_id: ACCOUNT, list_id: '' }, ctx), 'list_id');
  refused(await modules.pages.list_domains({ account_id: ACCOUNT, project_name: 'Bad_Name' }, ctx), 'project_name');
  refused(await modules.pages.get_domain({ account_id: ACCOUNT, project_name: 'effectivesc', domain: 'localhost' }, ctx), 'domain');
  refused(await modules.pages.retry_domain_validation({ account_id: ACCOUNT, project_name: 'effectivesc', domain: '..' }, ctx), 'domain');
  assert.equal(calls.length, 0);

  const falseEnvelope = await modules.pages.list_domains(
    { account_id: ACCOUNT, project_name: 'effectivesc' },
    recording(async () => ({ data: { success: false, errors: [{ code: 1 }] } })).ctx,
  );
  assert.equal(falseEnvelope.status, 'vendor_error');
});

test('get_phase_entrypoint treats 404 as absent and rethrows anything else', async () => {
  const missing = await modules.rulesets.get_phase_entrypoint(
    { accounts_or_zones: 'zones', account_or_zone_id: ZONE, phase: 'http_request_dynamic_redirect' },
    recording(async (req) => {
      assert.equal(req.method, 'GET');
      assert.equal(req.endpoint, `/zones/${ZONE}/rulesets/phases/http_request_dynamic_redirect/entrypoint`);
      throw vendorSignal(404, req.endpoint, 'GET');
    }).ctx,
  );
  assert.deepEqual(missing, {
    success: true,
    exists: false,
    phase: 'http_request_dynamic_redirect',
    accounts_or_zones: 'zones',
    account_or_zone_id: ZONE,
    result: null,
  });

  const found = await modules.rulesets.get_phase_entrypoint(
    { accounts_or_zones: 'accounts', account_or_zone_id: ACCOUNT, phase: 'http_request_firewall_custom' },
    recording(async () => envelope({ id: 'ep', version: '4' })).ctx,
  );
  assert.equal(found.exists, true);
  assert.equal(found.result.version, '4');
  assert.equal(found.success, true);

  const forbidden = vendorSignal(403, '/zones', 'GET');
  await assert.rejects(
    () => modules.rulesets.get_phase_entrypoint(
      { accounts_or_zones: 'zones', account_or_zone_id: ZONE, phase: 'http_request_redirect' },
      { async proxy() { throw forbidden; } },
    ),
    (err) => err === forbidden,
  );
  await assert.rejects(
    () => modules.rulesets.get_phase_entrypoint(
      { accounts_or_zones: 'zones', account_or_zone_id: ZONE, phase: 'http_request_redirect' },
      { async proxy() { throw new Error('boom'); } },
    ),
    /boom/,
  );

  const { calls, ctx } = recording(async () => { throw new Error('called'); });
  refused(await modules.rulesets.get_phase_entrypoint({ accounts_or_zones: 'nope', account_or_zone_id: ZONE, phase: 'http_request_redirect' }, ctx), 'accounts_or_zones');
  refused(await modules.rulesets.get_phase_entrypoint({ accounts_or_zones: 'zones', account_or_zone_id: 'zz', phase: 'http_request_redirect' }, ctx), 'account_or_zone_id');
  refused(await modules.rulesets.get_phase_entrypoint({ accounts_or_zones: 'zones', account_or_zone_id: ZONE, phase: 'http_request_other' }, ctx), 'phase');
  refused(await modules.rulesets.list({ accounts_or_zones: 'both', account_or_zone_id: ZONE }, ctx), 'accounts_or_zones');
  assert.equal(calls.length, 0);
});

const READ_PHASES = [
  'ddos_l4',
  'ddos_l7',
  'http_config_settings',
  'http_custom_errors',
  'http_log_custom_fields',
  'http_ratelimit',
  'http_request_cache_settings',
  'http_request_dynamic_redirect',
  'http_request_firewall_custom',
  'http_request_firewall_managed',
  'http_request_late_transform',
  'http_request_origin',
  'http_request_redirect',
  'http_request_sanitize',
  'http_request_sbfm',
  'http_request_transform',
  'http_response_cache_settings',
  'http_response_compression',
  'http_response_firewall_managed',
  'http_response_headers_transform',
  'magic_transit',
  'magic_transit_ids_managed',
  'magic_transit_managed',
  'magic_transit_ratelimit',
];

test('get_phase_entrypoint reads every published phase and put stays on the two redirects', async () => {
  assert.deepEqual(manifest.modules.rulesets.actions.get_phase_entrypoint.input.properties.phase.enum, READ_PHASES);
  for (const phase of READ_PHASES) {
    const read = recording(async (req) => {
      assert.equal(req.method, 'GET');
      assert.equal(req.endpoint, `/zones/${ZONE}/rulesets/phases/${phase}/entrypoint`);
      return envelope({ id: 'ep', phase });
    });
    const found = await modules.rulesets.get_phase_entrypoint(
      { accounts_or_zones: 'zones', account_or_zone_id: ZONE, phase },
      read.ctx,
    );
    assert.equal(found.exists, true, phase);
    assert.equal(found.result.phase, phase);
  }
  const { calls, ctx } = recording(async () => { throw new Error('called'); });
  for (const phase of ['http_ratelimit', 'http_request_firewall_managed', 'ddos_l7']) {
    refused(await modules.rulesets.put_phase_entrypoint({
      accounts_or_zones: 'zones',
      account_or_zone_id: ZONE,
      phase,
      rules: [rule],
      expected_version: null,
    }, ctx), 'phase');
  }
  assert.equal(manifest.modules.rulesets.actions.put_phase_entrypoint.input.properties.phase.enum.includes('http_ratelimit'), false);
  assert.equal(calls.length, 0);
});

test('put_phase_entrypoint refuses on version and falls back to POST when PUT 404s', async () => {
  const input = {
    accounts_or_zones: 'zones',
    account_or_zone_id: ZONE,
    phase: 'http_request_dynamic_redirect',
    rules: [rule],
    description: 'www',
  };
  const created = { id: 'ep', version: '2', rules: [rule] };

  const none = recording(async (req) => {
    if (req.method === 'GET') throw vendorSignal(404, req.endpoint, 'GET');
    assert.equal(req.method, 'PUT');
    assert.deepEqual(req.body, { rules: [rule], description: 'www' });
    return envelope(created);
  });
  const fresh = await modules.rulesets.put_phase_entrypoint({ ...input, expected_version: null }, none.ctx);
  assert.equal(fresh.created_with, 'put');
  assert.equal(fresh.result.id, 'ep');
  assert.deepEqual(none.calls.map((call) => call.method), ['GET', 'PUT']);

  const exists = recording(async () => envelope({ version: '3', rules: [{}, {}, {}] }));
  const blocked = await modules.rulesets.put_phase_entrypoint({ ...input, expected_version: null }, exists.ctx);
  assert.deepEqual(blocked, {
    status: 'invalid_arguments',
    field: 'expected_version',
    reason: 'entrypoint exists',
    current_version: '3',
    rule_count: 3,
  });
  assert.deepEqual(exists.calls.map((call) => call.method), ['GET']);

  const match = recording(async (req) => {
    if (req.method === 'GET') return envelope({ version: '3', rules: [rule] });
    return envelope(created);
  });
  const replaced = await modules.rulesets.put_phase_entrypoint({ ...input, expected_version: '3' }, match.ctx);
  assert.equal(replaced.created_with, 'put');
  assert.equal(match.calls[1].method, 'PUT');

  const mismatch = recording(async () => envelope({ version: '9', rules: [] }));
  const differed = await modules.rulesets.put_phase_entrypoint({ ...input, expected_version: '3' }, mismatch.ctx);
  assert.equal(differed.reason, 'version mismatch');
  assert.equal(differed.current_version, '9');
  assert.equal(differed.field, 'expected_version');
  assert.deepEqual(mismatch.calls.map((call) => call.method), ['GET']);

  const absentVersion = recording(async () => { throw vendorSignal(404); });
  const absent = await modules.rulesets.put_phase_entrypoint({ ...input, expected_version: '3' }, absentVersion.ctx);
  assert.equal(absent.reason, 'version mismatch');
  assert.equal(absent.current_version, null);
  assert.equal(absentVersion.calls.length, 1);

  const fallback = recording(async (req) => {
    if (req.method === 'GET' || req.method === 'PUT') throw vendorSignal(404, req.endpoint, req.method);
    assert.equal(req.method, 'POST');
    assert.equal(req.endpoint, `/zones/${ZONE}/rulesets`);
    assert.deepEqual(req.body, {
      name: 'default',
      kind: 'zone',
      phase: 'http_request_dynamic_redirect',
      rules: [rule],
      description: 'www',
    });
    return envelope({ id: 'new' });
  });
  const posted = await modules.rulesets.put_phase_entrypoint({ ...input, expected_version: null }, fallback.ctx);
  assert.equal(posted.created_with, 'post');
  assert.deepEqual(fallback.calls.map((call) => call.method), ['GET', 'PUT', 'POST']);

  const accountFallback = recording(async (req) => {
    if (req.method === 'POST') {
      assert.equal(req.body.kind, 'root');
      assert.equal(req.body.phase, 'http_request_redirect');
      assert.equal(Object.hasOwn(req.body, 'description'), false);
      return envelope({ id: 'root' });
    }
    throw vendorSignal(404, req.endpoint, req.method);
  });
  const accountPosted = await modules.rulesets.put_phase_entrypoint({
    accounts_or_zones: 'accounts',
    account_or_zone_id: ACCOUNT,
    phase: 'http_request_redirect',
    rules: [rule],
    expected_version: null,
  }, accountFallback.ctx);
  assert.equal(accountPosted.created_with, 'post');

  const stillThere = recording(async (req) => {
    if (req.method === 'GET') return envelope({ version: '3', rules: [] });
    throw vendorSignal(404, req.endpoint, req.method);
  });
  await assert.rejects(
    () => modules.rulesets.put_phase_entrypoint({ ...input, expected_version: '3' }, stillThere.ctx),
    (err) => err.object.http_status === 404,
  );
  assert.deepEqual(stillThere.calls.map((call) => call.method), ['GET', 'PUT']);

  const { calls, ctx } = recording(async () => { throw new Error('called'); });
  refused(await modules.rulesets.put_phase_entrypoint({ ...input, phase: 'http_request_redirect', expected_version: null }, ctx), 'phase');
  refused(await modules.rulesets.put_phase_entrypoint({
    ...input,
    accounts_or_zones: 'accounts',
    account_or_zone_id: ACCOUNT,
    phase: 'http_request_dynamic_redirect',
    expected_version: null,
  }, ctx), 'phase');
  refused(await modules.rulesets.put_phase_entrypoint({ ...input, phase: 'http_request_firewall_custom', expected_version: null }, ctx), 'phase');
  refused(await modules.rulesets.put_phase_entrypoint({ ...input, rules: [], expected_version: null }, ctx), 'rules');
  refused(await modules.rulesets.put_phase_entrypoint({ ...input, rules: Array.from({ length: 101 }, () => rule), expected_version: null }, ctx), 'rules');
  refused(await modules.rulesets.put_phase_entrypoint({ ...input, rules: [{ action: 'block' }], expected_version: null }, ctx), 'rules');
  refused(await modules.rulesets.put_phase_entrypoint({ ...input, rules: ['redirect'], expected_version: null }, ctx), 'rules');
  const { expected_version, ...without } = input;
  refused(await modules.rulesets.put_phase_entrypoint(without, ctx), 'expected_version');
  refused(await modules.rulesets.put_phase_entrypoint({ ...input, expected_version: '' }, ctx), 'expected_version');
  refused(await modules.rulesets.put_phase_entrypoint({ ...input, expected_version: 1 }, ctx), 'expected_version');
  assert.equal(calls.length, 0);
  assert.equal(expected_version, undefined);
});

function redirectRuleset(phase, rules) {
  const result = { id: RS, phase };
  if (rules !== undefined) result.rules = rules;
  return envelope(result);
}

test('rule writes go through the proxy and refuse a non-redirect or a bad position', async () => {
  const added = recording(async (req) => {
    if (req.method === 'GET') {
      assert.equal(req.endpoint, `/zones/${ZONE}/rulesets/${RS}`);
      return redirectRuleset('http_request_dynamic_redirect', []);
    }
    assert.equal(req.method, 'POST');
    assert.equal(req.endpoint, `/zones/${ZONE}/rulesets/${RS}/rules`);
    assert.deepEqual(req.body, { ...rule, position: { index: 1 } });
    return envelope({ id: RULE });
  });
  const add = await modules.rulesets.add_rule({
    accounts_or_zones: 'zones',
    ruleset_id: RS,
    zone_id: ZONE,
    rule,
    position: { index: 1 },
  }, added.ctx);
  assert.equal(add.result.id, RULE);
  assert.deepEqual(added.calls.map((call) => call.method), ['GET', 'POST']);

  const emptyBefore = recording(async (req) => {
    if (req.method === 'GET') return redirectRuleset('http_request_redirect', []);
    assert.deepEqual(req.body.position, { before: '' });
    return envelope({ id: RULE });
  });
  await modules.rulesets.add_rule({
    accounts_or_zones: 'accounts',
    ruleset_id: RS,
    account_id: ACCOUNT,
    rule,
    position: { before: '' },
  }, emptyBefore.ctx);
  assert.equal(emptyBefore.calls[0].method, 'GET');
  assert.equal(emptyBefore.calls[0].endpoint, `/accounts/${ACCOUNT}/rulesets/${RS}`);
  assert.equal(emptyBefore.calls[1].endpoint, `/accounts/${ACCOUNT}/rulesets/${RS}/rules`);

  const updated = recording(async (req) => {
    if (req.method === 'GET') return redirectRuleset('http_request_dynamic_redirect', [{ id: RULE }]);
    assert.equal(req.method, 'PATCH');
    assert.equal(req.endpoint, `/zones/${ZONE}/rulesets/${RS}/rules/${RULE}`);
    assert.deepEqual(req.body, rule);
    assert.equal(Object.hasOwn(req.body, 'position'), false);
    return envelope(rule);
  });
  await modules.rulesets.update_rule({
    accounts_or_zones: 'zones',
    account_or_zone_id: ZONE,
    ruleset_id: RS,
    rule_id: RULE,
    rule,
  }, updated.ctx);
  assert.deepEqual(updated.calls.map((call) => call.method), ['GET', 'PATCH']);

  const moved = recording(async (req) => {
    if (req.method === 'GET') return redirectRuleset('http_request_dynamic_redirect', [{ id: RULE }]);
    assert.deepEqual(req.body, { position: { after: '' } });
    assert.equal(Object.keys(req.body).join(), 'position');
    return envelope({ id: RULE });
  });
  await modules.rulesets.reorder_rule({
    accounts_or_zones: 'zones',
    account_or_zone_id: ZONE,
    ruleset_id: RS,
    rule_id: RULE,
    position: { after: '' },
  }, moved.ctx);
  assert.deepEqual(moved.calls.map((call) => call.method), ['GET', 'PATCH']);

  const removed = recording(async (req) => {
    if (req.method === 'GET') return redirectRuleset('http_request_redirect', [{ id: RULE, action: 'redirect' }]);
    assert.equal(req.method, 'DELETE');
    assert.equal(req.endpoint, `/accounts/${ACCOUNT}/rulesets/${RS}/rules/${RULE}`);
    assert.equal(Object.hasOwn(req, 'body'), false);
    return envelope({ id: RULE });
  });
  const gone = await modules.rulesets.remove_rule({
    accounts_or_zones: 'accounts',
    account_or_zone_id: ACCOUNT,
    ruleset_id: RS,
    rule_id: RULE,
  }, removed.ctx);
  assert.equal(gone.success, true);
  assert.deepEqual(removed.calls.map((call) => call.method), ['GET', 'DELETE']);

  const { calls, ctx } = recording(async () => { throw new Error('called'); });
  refused(await modules.rulesets.add_rule({ accounts_or_zones: 'zones', ruleset_id: RS, zone_id: ZONE, rule: { action: 'block' } }, ctx), 'rule');
  refused(await modules.rulesets.update_rule({
    accounts_or_zones: 'zones', account_or_zone_id: ZONE, ruleset_id: RS, rule_id: RULE, rule: { action: 'block' },
  }, ctx), 'rule');
  refused(await modules.rulesets.add_rule({ accounts_or_zones: 'zones', ruleset_id: RS, rule }, ctx), 'zone_id');
  refused(await modules.rulesets.add_rule({ accounts_or_zones: 'accounts', ruleset_id: RS, rule }, ctx), 'account_id');
  refused(await modules.rulesets.add_rule({ accounts_or_zones: 'zones', ruleset_id: RS, zone_id: ZONE, account_id: ACCOUNT, rule }, ctx), 'account_id');
  refused(await modules.rulesets.add_rule({ accounts_or_zones: 'accounts', ruleset_id: RS, account_id: ACCOUNT, zone_id: ZONE, rule }, ctx), 'zone_id');
  refused(await modules.rulesets.add_rule({ accounts_or_zones: 'zones', ruleset_id: 'bad/id', zone_id: ZONE, rule }, ctx), 'ruleset_id');
  refused(await modules.rulesets.remove_rule({
    accounts_or_zones: 'zones', account_or_zone_id: ZONE, ruleset_id: RS, rule_id: 'a'.repeat(65),
  }, ctx), 'rule_id');
  for (const position of [{}, { before: '', after: '' }, { index: 0 }, { index: 1.5 }, { before: 1 }, { index: 1, before: '' }, null]) {
    refused(await modules.rulesets.add_rule({ accounts_or_zones: 'zones', ruleset_id: RS, zone_id: ZONE, rule, position }, ctx), 'position');
    refused(await modules.rulesets.reorder_rule({
      accounts_or_zones: 'zones', account_or_zone_id: ZONE, ruleset_id: RS, rule_id: RULE, position,
    }, ctx), 'position');
  }
  refused(await modules.rulesets.add_rule({
    accounts_or_zones: 'zones', ruleset_id: RS, zone_id: ZONE,
    rule: { action: 'redirect', expression: 'true', position: { index: 1 } },
  }, ctx), 'rule');
  refused(await modules.rulesets.update_rule({
    accounts_or_zones: 'zones', account_or_zone_id: ZONE, ruleset_id: RS, rule_id: RULE,
    rule: { action: 'redirect', position: { before: 'x' } },
  }, ctx), 'rule');
  refused(await modules.rulesets.put_phase_entrypoint({
    accounts_or_zones: 'zones',
    account_or_zone_id: ZONE,
    phase: 'http_request_dynamic_redirect',
    rules: [{ action: 'redirect', position: { index: 1 } }],
    expected_version: null,
  }, ctx), 'rules');
  assert.equal(calls.length, 0);
});

test('rule writes refuse a ruleset outside the two redirect phases', async () => {
  const zoneRule = {
    accounts_or_zones: 'zones',
    account_or_zone_id: ZONE,
    ruleset_id: RS,
    rule_id: RULE,
  };
  const waf = recording(async (req) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.endpoint, `/zones/${ZONE}/rulesets/${RS}`);
    return redirectRuleset('http_request_firewall_managed', [{ id: RULE }]);
  });
  const removed = await modules.rulesets.remove_rule(zoneRule, waf.ctx);
  assert.deepEqual(removed, {
    status: 'invalid_arguments',
    field: 'ruleset_id',
    reason: 'not a redirect ruleset',
    phase: 'http_request_firewall_managed',
  });
  assert.deepEqual(waf.calls.map((call) => call.method), ['GET']);

  const wrongScope = await modules.rulesets.add_rule({
    accounts_or_zones: 'zones',
    ruleset_id: RS,
    zone_id: ZONE,
    rule,
  }, recording(async () => redirectRuleset('http_request_redirect', [])).ctx);
  assert.equal(wrongScope.reason, 'not a redirect ruleset');
  assert.equal(wrongScope.phase, 'http_request_redirect');
  assert.equal(wrongScope.field, 'ruleset_id');

  const accountWrong = await modules.rulesets.reorder_rule({
    ...zoneRule,
    accounts_or_zones: 'accounts',
    account_or_zone_id: ACCOUNT,
    position: { index: 1 },
  }, recording(async (req) => {
    assert.equal(req.method, 'GET');
    return redirectRuleset('http_request_dynamic_redirect', [{ id: RULE }]);
  }).ctx);
  assert.equal(accountWrong.reason, 'not a redirect ruleset');
  assert.equal(accountWrong.phase, 'http_request_dynamic_redirect');

  const absentRule = await modules.rulesets.update_rule({
    ...zoneRule,
    rule,
  }, recording(async () => redirectRuleset('http_request_dynamic_redirect', [{ id: 'other' }])).ctx);
  assert.deepEqual(absentRule, { status: 'invalid_arguments', field: 'rule_id', reason: 'rule not in ruleset' });

  const movedMissing = await modules.rulesets.reorder_rule({
    ...zoneRule,
    position: { index: 1 },
  }, recording(async () => redirectRuleset('http_request_dynamic_redirect', [])).ctx);
  assert.equal(movedMissing.reason, 'rule not in ruleset');
  assert.equal(movedMissing.field, 'rule_id');

  const removedMissing = await modules.rulesets.remove_rule(
    zoneRule,
    recording(async () => redirectRuleset('http_request_dynamic_redirect')).ctx,
  );
  assert.equal(removedMissing.reason, 'rule not in ruleset');

  const populated = recording(async (req) => {
    assert.equal(req.method, 'GET');
    return redirectRuleset('http_request_dynamic_redirect', [{ id: 'a' }, { id: 'b' }]);
  });
  const blockedDelete = await modules.rulesets.delete({
    accounts_or_zones: 'zones', account_or_zone_id: ZONE, ruleset_id: RS,
  }, populated.ctx);
  assert.deepEqual(blockedDelete, {
    status: 'invalid_arguments',
    field: 'ruleset_id',
    reason: 'ruleset not empty',
    rule_count: 2,
  });
  assert.deepEqual(populated.calls.map((call) => call.method), ['GET']);

  const falseRead = recording(async () => ({ data: { success: false, errors: [{ code: 1 }], result: null } }));
  const falseAdd = await modules.rulesets.add_rule({
    accounts_or_zones: 'zones', ruleset_id: RS, zone_id: ZONE, rule,
  }, falseRead.ctx);
  assert.equal(falseAdd.status, 'vendor_error');
  assert.deepEqual(falseRead.calls.map((call) => call.method), ['GET']);

  const noResult = recording(async () => ({ data: { success: true, errors: [], messages: [] } }));
  const noUpdate = await modules.rulesets.update_rule({
    ...zoneRule, rule,
  }, noResult.ctx);
  assert.equal(noUpdate.status, 'vendor_error');
  assert.equal(noResult.calls.length, 1);

  const boom = vendorSignal(403, `/zones/${ZONE}/rulesets/${RS}`, 'GET');
  const throwing = recording(async () => { throw boom; });
  await assert.rejects(
    () => modules.rulesets.remove_rule(zoneRule, throwing.ctx),
    (err) => err === boom,
  );
  assert.deepEqual(throwing.calls.map((call) => call.method), ['GET']);
});

test('redirect lists create, replace items, and delete through the proxy', async () => {
  const created = recording(async (req) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.endpoint, `/accounts/${ACCOUNT}/rules/lists`);
    assert.deepEqual(req.body, { name: 'www_to_apex', kind: 'redirect', description: 'cutover' });
    return envelope({ id: LIST });
  });
  const list = await modules.rulesets.create_list({ account_id: ACCOUNT, name: 'www_to_apex', description: 'cutover' }, created.ctx);
  assert.equal(list.result.id, LIST);

  const items = [{
    redirect: {
      source_url: 'https://www.example.com/a',
      target_url: 'https://example.com/a',
      status_code: 301,
      preserve_query_string: true,
      include_subdomains: false,
      subpath_matching: true,
      preserve_path_suffix: false,
    },
  }];
  const added = recording(async (req) => {
    if (req.method === 'POST') {
      assert.deepEqual(req.body, items);
      assert.equal(Array.isArray(req.body), true);
      return envelope({ operation_id: OP });
    }
    assert.equal(req.method, 'GET');
    assert.equal(req.endpoint, `/accounts/${ACCOUNT}/rules/lists/bulk_operations/${OP}`);
    return envelope({ id: OP, status: 'pending' });
  });
  const bulk = await modules.rulesets.add_list_items({ account_id: ACCOUNT, list_id: LIST, items }, added.ctx);
  assert.deepEqual(bulk, { success: true, operation_id: OP, operation: { id: OP, status: 'pending' } });

  const removed = recording(async (req) => {
    if (req.method === 'DELETE') {
      assert.deepEqual(req.body, { items: [{ id: 'item_1' }, { id: 'item_2' }] });
      return envelope({ operation_id: 'op_2' });
    }
    return { data: { success: false, errors: [], result: null } };
  });
  const removal = await modules.rulesets.remove_list_items({
    account_id: ACCOUNT,
    list_id: LIST,
    item_ids: ['item_1', 'item_2'],
  }, removed.ctx);
  assert.deepEqual(removal, {
    success: true,
    operation_id: 'op_2',
    operation: null,
    operation_read: { status: 'vendor_error', http_status: null },
  });

  const deleted = recording(async (req) => {
    assert.equal(req.method, 'DELETE');
    assert.equal(req.endpoint, `/accounts/${ACCOUNT}/rules/lists/${LIST}`);
    assert.equal(Object.hasOwn(req, 'body'), false);
    return envelope({ id: LIST });
  });
  assert.equal((await modules.rulesets.delete_list({ account_id: ACCOUNT, list_id: LIST }, deleted.ctx)).success, true);

  const { calls, ctx } = recording(async () => { throw new Error('called'); });
  refused(await modules.rulesets.create_list({ account_id: ACCOUNT, name: 'Bad-Name' }, ctx), 'name');
  refused(await modules.rulesets.create_list({ account_id: ACCOUNT, name: 'A' }, ctx), 'name');
  refused(await modules.rulesets.create_list({ account_id: ACCOUNT, name: 'ok', description: 'x'.repeat(501) }, ctx), 'description');
  refused(await modules.rulesets.add_list_items({ account_id: ACCOUNT, list_id: LIST, items: [] }, ctx), 'items');
  refused(await modules.rulesets.add_list_items({
    account_id: ACCOUNT,
    list_id: LIST,
    items: Array.from({ length: 1001 }, () => ({ redirect: { source_url: 'https://a.example', target_url: 'https://b.example' } })),
  }, ctx), 'items');
  refused(await modules.rulesets.add_list_items({
    account_id: ACCOUNT,
    list_id: LIST,
    items: [{ redirect: { source_url: '', target_url: 'https://b.example' } }],
  }, ctx), 'items');
  refused(await modules.rulesets.add_list_items({
    account_id: ACCOUNT,
    list_id: LIST,
    items: [{ redirect: { source_url: 'https://a.example', target_url: 'https://b.example', status_code: 200 } }],
  }, ctx), 'items');
  refused(await modules.rulesets.add_list_items({
    account_id: ACCOUNT,
    list_id: LIST,
    items: [{ redirect: { source_url: 'https://a.example', target_url: 'https://b.example' }, extra: true }],
  }, ctx), 'items');
  refused(await modules.rulesets.remove_list_items({ account_id: ACCOUNT, list_id: LIST, item_ids: [] }, ctx), 'item_ids');
  refused(await modules.rulesets.remove_list_items({ account_id: ACCOUNT, list_id: LIST, item_ids: ['bad/id'] }, ctx), 'item_ids');
  refused(await modules.rulesets.remove_list_items({
    account_id: ACCOUNT,
    list_id: LIST,
    item_ids: Array.from({ length: 1001 }, () => 'item_1'),
  }, ctx), 'item_ids');
  refused(await modules.rulesets.delete_list({ account_id: 'nope', list_id: LIST }, ctx), 'account_id');
  assert.equal(calls.length, 0);
});

test('an accepted bulk write keeps its operation id when the status read throws', async () => {
  const items = [{ redirect: { source_url: 'https://a.example', target_url: 'https://b.example' } }];
  const thrown = recording(async (req) => {
    if (req.method === 'POST') return envelope({ operation_id: OP });
    throw vendorSignal(504, req.endpoint, 'GET');
  });
  const added = await modules.rulesets.add_list_items({ account_id: ACCOUNT, list_id: LIST, items }, thrown.ctx);
  assert.deepEqual(added, {
    success: true,
    operation_id: OP,
    operation: null,
    operation_read: { status: 'vendor_error', http_status: 504 },
  });
  assert.deepEqual(thrown.calls.map((call) => call.method), ['POST', 'GET']);

  const plain = recording(async (req) => {
    if (req.method === 'DELETE') return envelope({ operation_id: 'op_9' });
    throw new Error('boom');
  });
  const removed = await modules.rulesets.remove_list_items({
    account_id: ACCOUNT,
    list_id: LIST,
    item_ids: ['item_1'],
  }, plain.ctx);
  assert.deepEqual(removed, {
    success: true,
    operation_id: 'op_9',
    operation: null,
    operation_read: { status: 'vendor_error', http_status: null },
  });
  assert.deepEqual(plain.calls.map((call) => call.method), ['DELETE', 'GET']);

  const forbidden = recording(async (req) => {
    if (req.method === 'POST') return envelope({ operation_id: 'op_3' });
    const err = new Error('vendor_error');
    err.object = { status: 'vendor_error', http_status: 403, endpoint: req.endpoint, method: 'GET' };
    throw err;
  });
  const again = await modules.rulesets.add_list_items({ account_id: ACCOUNT, list_id: LIST, items }, forbidden.ctx);
  assert.equal(again.operation_id, 'op_3');
  assert.equal(again.operation, null);
  assert.deepEqual(again.operation_read, { status: 'vendor_error', http_status: 403 });
});

test('rulesets.delete removes a ruleset through the proxy and refuses bad ids first', async () => {
  const deleted = recording(async (req) => {
    if (req.method === 'GET') {
      assert.equal(req.endpoint, `/zones/${ZONE}/rulesets/${RS}`);
      return redirectRuleset('http_request_dynamic_redirect', []);
    }
    assert.equal(req.method, 'DELETE');
    assert.equal(req.endpoint, `/zones/${ZONE}/rulesets/${RS}`);
    assert.equal(Object.hasOwn(req, 'body'), false);
    return { status: 204, data: { successful: true, data: null } };
  });
  const gone = await modules.rulesets.delete({ accounts_or_zones: 'zones', account_or_zone_id: ZONE, ruleset_id: RS }, deleted.ctx);
  assert.equal(gone.success, true);
  assert.equal(gone.deleted, RS);
  assert.deepEqual(deleted.calls.map((call) => call.method), ['GET', 'DELETE']);
  const enveloped = recording(async (req) => {
    if (req.method === 'GET') return redirectRuleset('http_request_dynamic_redirect');
    return envelope(null);
  });
  assert.equal((await modules.rulesets.delete({ accounts_or_zones: 'zones', account_or_zone_id: ZONE, ruleset_id: RS }, enveloped.ctx)).success, true);
  assert.deepEqual(enveloped.calls.map((call) => call.method), ['GET', 'DELETE']);
  const accountEmpty = recording(async (req) => {
    if (req.method === 'GET') {
      assert.equal(req.endpoint, `/accounts/${ACCOUNT}/rulesets/${RS}`);
      return redirectRuleset('http_request_redirect', []);
    }
    assert.equal(req.method, 'DELETE');
    return { status: 204, data: null };
  });
  assert.equal((await modules.rulesets.delete({
    accounts_or_zones: 'accounts', account_or_zone_id: ACCOUNT, ruleset_id: RS,
  }, accountEmpty.ctx)).success, true);
  const refusedEnvelope = recording(async () => ({ data: { success: false, errors: [{ code: 1 }], result: null } }));
  assert.equal((await modules.rulesets.delete({ accounts_or_zones: 'zones', account_or_zone_id: ZONE, ruleset_id: RS }, refusedEnvelope.ctx)).status, 'vendor_error');
  assert.deepEqual(refusedEnvelope.calls.map((call) => call.method), ['GET']);
  const threw = recording(async () => { throw { object: { status: 'vendor_error', http_status: 404, endpoint: '/x', method: 'GET' } }; });
  await assert.rejects(modules.rulesets.delete({ accounts_or_zones: 'zones', account_or_zone_id: ZONE, ruleset_id: RS }, threw.ctx));
  assert.deepEqual(threw.calls.map((call) => call.method), ['GET']);
  assert.equal(manifest.modules.rulesets.actions.delete.execution.prefer, 'proxy');
  assert.equal(manifest.modules.rulesets.actions.delete.confirmation, 'always');

  const { calls, ctx } = recording(async () => { throw new Error('called'); });
  refused(await modules.rulesets.delete({ accounts_or_zones: 'zones', account_or_zone_id: ZONE, ruleset_id: '../x' }, ctx), 'ruleset_id');
  refused(await modules.rulesets.delete({ accounts_or_zones: 'both', account_or_zone_id: ZONE, ruleset_id: RS }, ctx), 'accounts_or_zones');
  refused(await modules.rulesets.delete({ accounts_or_zones: 'accounts', account_or_zone_id: 'nothex', ruleset_id: RS }, ctx), 'account_or_zone_id');
  assert.equal(calls.length, 0);
});
