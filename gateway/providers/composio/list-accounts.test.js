import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuthProvider } from './auth-provider.js';

test('listAccounts returns only public fields and drops credential state', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-list-accounts-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envPath = join(dir, 'auth-provider.env');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n');
  t.mock.method(globalThis, 'fetch', async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/api/v3.1/connected_accounts');
    assert.equal(parsed.searchParams.get('user_ids'), 'wiser-user');
    assert.equal(parsed.searchParams.get('statuses'), 'ACTIVE');
    return {
      status: 200,
      text: async () => JSON.stringify({
        items: [{
          id: 'ca_1',
          toolkit: { slug: 'GITHUB' },
          status: 'ACTIVE',
          state: { val: { access_token: 'should-not-leave' } },
        }],
      }),
    };
  });
  const provider = createAuthProvider({ envPath });
  const accounts = await provider.listAccounts({ userId: 'wiser-user' });
  assert.deepEqual(accounts, [{ id: 'ca_1', toolkit: 'GITHUB', status: 'ACTIVE' }]);
  assert.equal(JSON.stringify(accounts).includes('access_token'), false);
});
