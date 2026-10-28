import '../../lib/tests/isolated-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {installQuestion} from '../../lib/consent.js';
import {browserInstallRefused,formInstallQuestion} from '../scripts/ask.js';

const purpose = 'open web pages in a window of its own, without touching your own browser';
const packages = installQuestion("the code that drives a browser (and a private copy of the Chromium browser, if you don't have it yet)",purpose,'19 MB, or about 600 MB with the browser');
const chromium = installQuestion('a private copy of the Chromium browser',purpose,'580 MB');

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
  for (const report of [undefined,null,'',packages.replace('your own browser.','your own browser'),
    'Error: another tool has not authorised a Wiser install.']) {
    assert.equal(browserInstallRefused(report),false);
  }
});

test('Form question preserves Browser Control what and size for missing runtime and browser-only', () => {
  for (const [what,size] of [["the code that drives a browser (and a private copy of the Chromium browser, if you don't have it yet)",'19 MB, or about 600 MB with the browser'],['a private copy of the Chromium browser','580 MB']]) {
    const report = installQuestion(what,purpose,size)+'\n\nDetails for the assistant: untouched';
    assert.equal(formInstallQuestion(report),installQuestion(what,'show your form in a window of its own',size));
  }
});
