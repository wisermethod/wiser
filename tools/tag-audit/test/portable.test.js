import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import cases from './fixtures/cases.json' with { type: 'json' };

test('audit and the shared address screen run with no Node imports or globals', () => {
  const out = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { fileURLToPath } from 'node:url';
    import { readFileSync } from 'node:fs';
    import { portableModule } from ${JSON.stringify(new URL('../../lib/tests/portable-module.js', import.meta.url).href)};
    import { fixtureNetwork } from ${JSON.stringify(new URL('./fixtures/network.mjs', import.meta.url).href)};
    const load = url => portableModule(fileURLToPath(url));
    const audit = await load(${JSON.stringify(new URL('../scripts/audit-core.js', import.meta.url).href)});
    const cases = JSON.parse(readFileSync(new URL(${JSON.stringify(new URL('./fixtures/cases.json', import.meta.url).href)})));
    for (const c of cases) {
      const network = fixtureNetwork(c);
      const expected = c.change ? c.error : c.main.stderr.trim();
      if (c.change || c.main.status) {
        await assert.rejects(audit.auditPage({ url: c.url }, network.fetch, network.lookup), { message: expected });
      } else {
        const result = await audit.auditPage({ url: c.url }, network.fetch, network.lookup);
        assert.equal(JSON.stringify(result) + '\\n', c.main.stdout);
        if (c.options) {
          const capped = await audit.auditPage({ url: c.url }, network.fetch, network.lookup, c.options);
          assert.equal(capped.body_truncated, true);
          assert.equal(capped.html_bytes, c.options.maxBytes);
        }
      }
      assert.equal(JSON.stringify(network.requests), JSON.stringify(c.options ? [...c.requests, ...c.requests] : c.requests));
    }
    const destination = await load(${JSON.stringify(new URL('../../lib/destination-core.js', import.meta.url).href)});
    assert.equal(destination.classifyLiteral('64:ff9b:1:abcd::1'), 'unroutable');
    assert.equal(await destination.destinationReason('host.test', async () => ['10.0.0.1']), 'private_range');
    assert.equal(await destination.destinationReason('host.test', async () => ['not-an-address', '10.0.0.1']), 'private_range');
    const controller = new AbortController();
    const pending = audit.auditPage({ url: 'https://page.test/' }, () => assert.fail('fetch'),
      () => new Promise(() => {}), { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, /no response within 20 seconds/);
    console.log('portable: ' + cases.length + ' audit cases and shared address screen');
  `], { encoding: 'utf8', timeout: 10000 });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), 'portable: ' + cases.length + ' audit cases and shared address screen');
});
