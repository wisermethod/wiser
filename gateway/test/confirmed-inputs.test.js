import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from './fake-provider.js';

/**
 * A confirmed action can only run if the gateway can show every field it was given.
 * `src/disclosure.js` withholds a field whose value does not match its declared
 * `type`, and a field with no `type` matches nothing, so such an action answers
 * `invalid_arguments` before the stop is offered and can never run. The connector's
 * own tests call the module directly and cannot see this. Found by adversarial review
 * of the Cloudflare expansion on 2026-10-09: `zones.update_setting` `value` declared
 * only `anyOf`, and `rulesets.put_phase_entrypoint` `expected_version` declared nothing.
 */

const DISCLOSABLE = new Set(['string', 'integer', 'number', 'boolean', 'array', 'object']);

test('every field of every confirmed connector action declares one disclosable type', async () => {
  const { connectors } = await createTestGateway();
  const offenders = [];
  const seen = new Set();
  let checked = 0;
  for (const connector of connectors.values ? connectors.values() : Object.values(connectors)) {
    const modules = connector.manifest ? connector.manifest.modules : connector.modules;
    for (const [moduleName, mod] of Object.entries(modules || {})) {
      for (const [actionName, action] of Object.entries(mod.actions || {})) {
        if ((action.confirmation || 'none') === 'none') continue;
        for (const [field, declaration] of Object.entries(action.input?.properties || {})) {
          checked += 1;
          const id = `${connector.manifest?.service ?? connector.service}.${moduleName}.${actionName} ${field}`;
          seen.add(id);
          if (typeof declaration.type !== 'string' || !DISCLOSABLE.has(declaration.type)) {
            offenders.push(id);
          }
        }
      }
    }
  }
  assert.ok(checked > 100, `control: only ${checked} confirmed fields were checked`);
  assert.deepEqual(offenders, []);
  assert.equal(seen.has('cloudflare.zones.update_setting browser_cache_ttl'), true);
});

const ZONE = '0123456789abcdef0123456789abcdef';

function envelope(result) {
  return { status: 200, data: { success: true, errors: [], messages: [], result } };
}

async function gatewayWith(module, responder) {
  const env = await createTestGateway();
  await putActive(env.store, env.fake, { service: 'cloudflare', module });
  const calls = [];
  env.fake.auth.proxy = async (req) => { calls.push(req); return responder(req, calls.length); };
  return { ...env, calls };
}

test('zones.update_setting reaches its stop and runs once confirmed, for a string setting, for HSTS, for email obfuscation and for browser cache ttl', async () => {
  let value = 'full';
  const { gw, calls } = await gatewayWith('zones', (req) => {
    if (req.method === 'PATCH') { value = req.body.value; return envelope({ id: 'ssl', value }); }
    return envelope({ id: 'ssl', value });
  });
  const call = { action: 'cloudflare.zones.update_setting', input: { zone_id: ZONE, setting_id: 'ssl', value: 'strict' } };
  const stop = await gw.execute(call);
  assert.equal(stop.status, 'needs_confirmation', JSON.stringify(stop));
  assert.equal(calls.length, 0);
  const done = await gw.execute({ ...call, confirm: true });
  assert.equal(done.success, true, JSON.stringify(done));
  assert.equal(done.applied, true);
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'PATCH', 'GET']);

  const hsts = { enabled: true, max_age: 300, include_subdomains: false, preload: false, nosniff: true };
  let header = { strict_transport_security: { enabled: false, max_age: 0, include_subdomains: false, preload: false, nosniff: false } };
  const second = await gatewayWith('zones', (req) => {
    if (req.method === 'PATCH') { header = req.body.value; }
    return envelope({ id: 'security_header', value: header });
  });
  const hstsCall = { action: 'cloudflare.zones.update_setting', input: { zone_id: ZONE, setting_id: 'security_header', strict_transport_security: hsts } };
  const hstsStop = await second.gw.execute(hstsCall);
  assert.equal(hstsStop.status, 'needs_confirmation', JSON.stringify(hstsStop));
  const hstsDone = await second.gw.execute({ ...hstsCall, confirm: true });
  assert.equal(hstsDone.applied, true, JSON.stringify(hstsDone));
  assert.deepEqual(second.calls[1].body, { value: { strict_transport_security: hsts } });

  let obfuscated = 'on';
  const email = await gatewayWith('zones', (req) => {
    if (req.method === 'PATCH') { obfuscated = req.body.value; }
    return envelope({ id: 'email_obfuscation', value: obfuscated });
  });
  const emailCall = { action: 'cloudflare.zones.update_setting', input: { zone_id: ZONE, setting_id: 'email_obfuscation', value: 'off' } };
  const emailStop = await email.gw.execute(emailCall);
  assert.equal(emailStop.status, 'needs_confirmation', JSON.stringify(emailStop));
  assert.equal(email.calls.length, 0);
  assert.ok(emailStop.input_values.some((field) => field.name === 'value' && field.value === '"off"'));
  const emailDone = await email.gw.execute({ ...emailCall, confirm: true });
  assert.equal(emailDone.applied, true, JSON.stringify(emailDone));
  assert.deepEqual(email.calls[1].body, { value: 'off' });

  let ttl = 14400;
  const cache = await gatewayWith('zones', (req) => {
    if (req.method === 'PATCH') { ttl = req.body.value; }
    return envelope({ id: 'browser_cache_ttl', value: ttl });
  });
  const ttlCall = { action: 'cloudflare.zones.update_setting', input: { zone_id: ZONE, setting_id: 'browser_cache_ttl', browser_cache_ttl: 3600 } };
  const ttlStop = await cache.gw.execute(ttlCall);
  assert.equal(ttlStop.status, 'needs_confirmation', JSON.stringify(ttlStop));
  assert.equal(cache.calls.length, 0);
  assert.ok(ttlStop.input_values.some((field) => field.name === 'browser_cache_ttl' && field.value === '3600'));
  const ttlDone = await cache.gw.execute({ ...ttlCall, confirm: true });
  assert.equal(ttlDone.applied, true, JSON.stringify(ttlDone));
  assert.equal(typeof cache.calls[1].body.value, 'number');
  assert.deepEqual(cache.calls[1].body, { value: 3600 });
});

test('rulesets.put_phase_entrypoint reaches its stop and runs once confirmed, creating and replacing', async () => {
  const rule = { ref: 'r', expression: '(http.host eq "www.example.com")', action: 'redirect', action_parameters: { from_value: { target_url: { value: 'https://example.com/' }, status_code: 301 } } };
  const absent = await gatewayWith('rulesets', (req) => {
    if (req.method === 'GET') return { status: 404, error: { code: 'vendor_error', endpoint: req.endpoint, method: 'GET' } };
    return envelope({ id: 'rs1', version: '1', rules: [{ ...rule, id: 'r1' }] });
  });
  const create = { action: 'cloudflare.rulesets.put_phase_entrypoint', input: { accounts_or_zones: 'zones', account_or_zone_id: ZONE, phase: 'http_request_dynamic_redirect', expected_version: 'none', rules: [rule] } };
  const stop = await absent.gw.execute(create);
  assert.equal(stop.status, 'needs_confirmation', JSON.stringify(stop));
  const created = await absent.gw.execute({ ...create, confirm: true });
  assert.equal(created.created_with, 'put', JSON.stringify(created));
  assert.deepEqual(absent.calls.map((c) => c.method), ['GET', 'PUT']);

  const present = await gatewayWith('rulesets', (req) => envelope({ id: 'rs1', version: '4', rules: [{ ...rule, id: 'r1' }] }));
  const replace = { ...create, input: { ...create.input, expected_version: '4' } };
  assert.equal((await present.gw.execute(replace)).status, 'needs_confirmation');
  const replaced = await present.gw.execute({ ...replace, confirm: true });
  assert.equal(replaced.created_with, 'put', JSON.stringify(replaced));
  const mismatch = { ...create, input: { ...create.input, expected_version: '3' } };
  assert.equal((await present.gw.execute(mismatch)).status, 'needs_confirmation');
  const refused = await present.gw.execute({ ...mismatch, confirm: true });
  assert.equal(refused.reason, 'version mismatch', JSON.stringify(refused));
});
