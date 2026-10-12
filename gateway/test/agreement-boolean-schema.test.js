// The agreement checker reads a boolean subschema the way JSON Schema does: `false`
// forbids the property and `true` allows anything. `cloudflare zones.update_setting`
// publishes `false` in each `oneOf` branch for the value fields that branch does not
// take, so a call naming one setting with another setting's field is invalid against
// the schema, as the module already refuses it.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { schemaViolation } from './agreement-harness.js';

const manifest = JSON.parse(readFileSync(new URL('../../connectors/cloudflare/manifest.json', import.meta.url), 'utf8'));
const schema = manifest.modules.zones.actions.update_setting.input;
const ZONE = '0123456789abcdef0123456789abcdef';
const HSTS = { enabled: false, max_age: 0, include_subdomains: false, preload: false, nosniff: false };

const LEGIT = {
  ssl: { value: 'full' },
  always_use_https: { value: 'on' },
  security_header: { strict_transport_security: HSTS },
  min_tls_version: { value: '1.2' },
  automatic_https_rewrites: { value: 'off' },
  email_obfuscation: { value: 'off' },
  browser_cache_ttl: { browser_cache_ttl: 3600 },
};
const FIELD_SAMPLE = { value: 'on', strict_transport_security: HSTS, browser_cache_ttl: 0 };

test('a boolean subschema: false forbids the property, null included, and true allows it', () => {
  assert.equal(schemaViolation({ properties: { a: false } }, { a: 1 }), 'forbidden:a');
  assert.equal(schemaViolation({ properties: { a: false } }, { a: null }), 'forbidden:a');
  assert.equal(schemaViolation({ properties: { a: false } }, {}), null);
  assert.equal(schemaViolation({ properties: { a: true } }, { a: 1 }), null);
  const branches = { oneOf: [{ required: ['a'], properties: { a: { type: 'string' }, b: false } }, { required: ['b'], properties: { a: false, b: { type: 'string' } } }] };
  assert.equal(schemaViolation(branches, { a: 'x' }), null);
  assert.equal(schemaViolation(branches, { a: 'x', b: 'y' }), 'oneOf:0');
});

test('update_setting: each setting with its own field is valid, and with any other value field is not', () => {
  for (const [setting_id, fields] of Object.entries(LEGIT)) {
    assert.equal(schemaViolation(schema, { zone_id: ZONE, setting_id, ...fields }), null, setting_id);
    const own = Object.keys(fields)[0];
    for (const [other, sample] of Object.entries(FIELD_SAMPLE)) {
      if (other === own) continue;
      for (const value of [sample, null]) {
        const instance = { zone_id: ZONE, setting_id, ...fields, [other]: value };
        assert.notEqual(schemaViolation(schema, instance), null, `${setting_id} with ${other}=${JSON.stringify(value)}`);
      }
    }
  }
});
