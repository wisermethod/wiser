import '../../lib/tests/isolated-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {browserInstallRefused} from '../scripts/ask.js';

const packages = 'Error: this tool is not installed yet and this person has not authorised a Wiser install.';
const chromium = "Error: this tool's packages are installed but the Chromium build they drive is not, and this person has not authorised a Wiser install.";

test('Browser install refusal: both first-line reports match, ignoring case', () => {
  for (const report of [packages,chromium]) {
    assert.equal(browserInstallRefused(report),true);
    assert.equal(browserInstallRefused(report.toUpperCase()+'\r\nInstall details follow.'),true);
  }
});

test('Browser install refusal: another error mentioning install or a later refusal does not match', () => {
  for (const report of ['Error: Chromium failed; retry with --install.',
    'Error: unrelated failure\n'+packages,'Error: unrelated failure\r\n'+chromium]) {
    assert.equal(browserInstallRefused(report),false);
  }
});

test('Browser install refusal: absent reports and incomplete refusal tokens do not match', () => {
  for (const report of [undefined,null,'',packages.replace(' a Wiser install.',' a Wiser install'),
    'Error: another tool has not authorised a Wiser install.']) {
    assert.equal(browserInstallRefused(report),false);
  }
});
