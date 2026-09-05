import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyLiteral, destinationReason, destinationReasonText } from '../lib/destination.js';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tag-audit.js');

// The address boundary, the same screen sitemap-fetch applies. The resolver is
// injected so no test depends on DNS, and the CLI runs below use literal
// addresses, which the screen classifies without a lookup.
describe('the address screen', () => {
  it('names a loopback literal', () => {
    assert.equal(classifyLiteral('127.0.0.1'), 'loopback');
    assert.equal(classifyLiteral('[::1]'), 'loopback');
  });

  it('names the private ranges', () => {
    assert.equal(classifyLiteral('10.1.2.3'), 'private_range');
    assert.equal(classifyLiteral('172.16.0.1'), 'private_range');
    assert.equal(classifyLiteral('192.168.1.1'), 'private_range');
  });

  it('names link-local and cloud metadata', () => {
    assert.equal(classifyLiteral('169.254.169.254'), 'cloud_metadata');
    assert.equal(classifyLiteral('169.254.1.1'), 'link_local');
  });

  it('leaves a public literal alone', () => {
    assert.equal(classifyLiteral('93.184.216.34'), null);
  });

  it('refuses a hostname that resolves inward, using the injected resolver', async () => {
    const lookup = async () => [{ address: '127.0.0.1', family: 4 }];
    assert.equal(await destinationReason('intranet.example', lookup), 'loopback');
  });

  it('passes a hostname that resolves outward', async () => {
    const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
    assert.equal(await destinationReason('host.example', lookup), null);
  });

  it('reports an unresolvable hostname as such, so the fetch can say so', async () => {
    const lookup = async () => { throw new Error('ENOTFOUND'); };
    assert.equal(await destinationReason('nowhere.invalid', lookup), 'unresolvable');
  });

  it('has a sentence for every reason', () => {
    for (const reason of ['loopback', 'private_range', 'link_local', 'unique_local', 'cloud_metadata']) {
      assert.match(destinationReasonText(reason), /address/);
    }
  });
});

describe('audit --url against an address inside the machine', () => {
  const run = (url) => spawnSync(process.execPath, [SCRIPT, 'audit', '--url', url], { encoding: 'utf8', timeout: 20000 });

  it('refuses a loopback address by name, before any fetch, with stdout empty', () => {
    const result = run('http://127.0.0.1:1/');
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^Error: --url http:\/\/127\.0\.0\.1:1\/ points at a loopback address, which this tool does not fetch\./m);
    assert.doesNotMatch(result.stderr, /could not fetch/);
  });

  it('refuses a private-range address by name', () => {
    const result = run('http://10.0.0.1/');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /points at a private-range address, which this tool does not fetch/);
  });

  it('refuses the cloud metadata address by name', () => {
    const result = run('http://169.254.169.254/latest/');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /points at a cloud instance metadata address/);
  });

  it('refuses localhost by name without a resolver', () => {
    const result = run('http://localhost:1/');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /points at a loopback address/);
  });
});
