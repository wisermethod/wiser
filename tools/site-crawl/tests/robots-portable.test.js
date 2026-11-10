import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDisallowed } from '../scripts/lib/robots.js';

test('hosted iterative robots matching agrees with the existing CLI matcher', () => {
  const paths = ['/', '/a', '/a/b', '/abc', '/private', '/private/x', '/%70rivate', '/a?b=1', '/dollar$'];
  const rules = ['', '/', '/*', '/*$', '/a', '/a$', '/*a*b', '/*a*b$', '/*?*', '/private', '/%70rivate', '/dollar$$'];
  for (const rule of rules) for (const path of paths) {
    const text = `User-agent: *\nDisallow: ${rule}\n`;
    const args = [text, 'https://example.com' + path, 'wiser-site-crawl'];
    assert.equal(isDisallowed(...args, () => {}), isDisallowed(...args), `${rule} against ${path}`);
  }
});
