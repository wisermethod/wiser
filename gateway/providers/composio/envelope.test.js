import { test } from 'node:test';
import assert from 'node:assert/strict';

import { providerExecuteFailed } from './catalog-provider.js';

test('GitHub-shaped catalog body is not a failure', () => {
  const r = providerExecuteFailed({
    successful: true,
    data: { full_name: 'wisermethod/wiser', id: 1 },
  });
  assert.equal(r.failed, false);
});

test('Composio successful:false stays a failure', () => {
  const r = providerExecuteFailed({ successful: false, error: 'nope' });
  assert.equal(r.failed, true);
  assert.equal(r.httpStatus, 400);
});

test('inner status 400 stays a failure', () => {
  const r = providerExecuteFailed({ status: 400, data: {} });
  assert.equal(r.failed, true);
  assert.equal(r.httpStatus, 400);
});

test('Cloudflare nested success:false stays a failure', () => {
  const r = providerExecuteFailed({
    successful: true,
    data: {
      success: false,
      errors: [{ code: 9106, message: 'Authentication failed (status: 400)' }],
      result: null,
    },
  });
  assert.equal(r.failed, true);
  assert.equal(r.httpStatus, 400);
});

test('top-level Cloudflare success:false stays a failure', () => {
  const r = providerExecuteFailed({
    success: false,
    errors: [{ code: 9106, message: 'Authentication failed (status: 400)' }],
    result: null,
  });
  assert.equal(r.failed, true);
});
