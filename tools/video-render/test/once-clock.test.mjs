import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { browserPath, checkRuntime, childEnvironment } from '../scripts/sequence.mjs';

const fixture = fileURLToPath(new URL('./fixtures/once/index.html', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('once render clock in pinned Chromium', { timeout: 60_000 }, async (t) => {
  await checkRuntime();
  const { default: puppeteer } = await import('puppeteer-core');
  const home = await mkdtemp(join(tmpdir(), 'wiser-once-clock-test-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const executablePath = await browserPath();
  const browser = await puppeteer.launch({ executablePath, headless: true,
    userDataDir: join(home, 'profile'), env: childEnvironment(home, executablePath),
    defaultViewport: { width: 640, height: 360 }, args: ['--disable-background-networking'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    window.clockCalls = { raf: 0, timer: 0, observer: 0 };
    window.countSamples = [];
    const now = performance.now.bind(performance);
    performance.now = function () {
      const time = now();
      if (!window.countEpoch && document.querySelector('#pluvo.ax-counting')) window.countEpoch = time;
      return time;
    };
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = function (callback) {
      window.clockCalls.raf++;
      return raf.call(window, (time) => {
        const root = document.querySelector('#pluvo'), count = root && root.axOnce && root.axOnce.count;
        const previous = count && count.textContent;
        callback(time);
        if (count && root.axOnce.count === count && count.textContent !== previous) {
          window.countSamples.push({ elapsed: time - window.countEpoch, text: count.textContent });
        }
      });
    };
    const timer = window.setTimeout;
    window.setTimeout = function (...args) { window.clockCalls.timer++; return timer.apply(window, args); };
    const IO = window.IntersectionObserver;
    window.IntersectionObserver = class extends IO { constructor(...args) { super(...args); window.clockCalls.observer++; } };
  });
  await page.goto(pathToFileURL(fixture).href);
  async function seek(time, id = 'zavvo') {
    return page.evaluate(({ time, id }) => {
      window.dispatchEvent(new CustomEvent('video-render:seek', { detail: { time } }));
      const root = document.getElementById(id), num = root.querySelector('.ax-num');
      const rule = root.querySelector('.ax-rule'), count = root.querySelector('.ax-count');
      const nembi = root.querySelector('.ax-nembi');
      return { state: root.dataset.state, classes: [...root.classList].sort(), text: num.textContent,
        opacity: Number(getComputedStyle(num).opacity), count: count && count.textContent,
        rule: getComputedStyle(rule).transform,
        nembi: nembi && { opacity: Number(getComputedStyle(nembi).opacity), transform: getComputedStyle(nembi).transform },
        animations: root.getAnimations({ subtree: true }).length, raf: root.axOnce.raf, timer: root.axOnce.timer };
    }, { time, id });
  }

  await t.test('opens on its finished still and starts no browser clock', async () => {
    const result = await page.evaluate(() => ({ version: window.AxOnce.version, calls: window.clockCalls,
      roots: window.AxOnce.roots.map((root) => ({ state: root.dataset.state, armed: root.classList.contains('ax-armed'),
        opacity: getComputedStyle(root.querySelector('.ax-num')).opacity, queued: root.axOnce.queued })) }));
    assert.deepEqual(result, { version: '0.2.0', calls: { raf: 0, timer: 0, observer: 0 },
      roots: Array.from({ length: 3 }, () => ({ state: 'still', armed: false, opacity: '1', queued: false })) });
  });

  await t.test('before and exactly at data-at it waits hidden, including the default and zero', async () => {
    for (const time of [-1, 0, 0.3, 0.6]) {
      const result = await seek(time);
      assert.equal(result.state, 'waiting');
      assert.ok(result.classes.includes('ax-armed'));
      assert.ok(!result.classes.includes('ax-go'));
      assert.equal(result.opacity, 0);
      assert.equal(result.count, null);
      assert.equal(result.animations, 0);
    }
    assert.equal((await seek(0.3, 'troff')).state, 'waiting');
    assert.equal((await seek(0.4, 'troff')).state, 'playing');
    assert.equal((await seek(0, 'vimmo')).state, 'waiting');
    assert.equal((await seek(0.1, 'vimmo')).state, 'playing');
  });

  await t.test('count, delayed rule transition and child keyframes seek synchronously', async () => {
    const result = await seek(1.1);
    assert.equal(result.state, 'playing');
    assert.equal(result.count, '$1,094.19M');
    assert.equal(result.opacity, 0);
    for (const name of ['ax-armed', 'ax-go', 'ax-countable', 'ax-counting']) assert.ok(result.classes.includes(name));
    assert.ok(Math.abs(Number(result.rule.match(/matrix\(([^,]+)/)[1]) - 0.6) < 0.001, JSON.stringify(result));
    assert.ok(Math.abs(result.nembi.opacity - 0.3125) < 0.001, JSON.stringify(result));
    assert.equal(result.animations, 0);
    assert.equal(result.raf, 0);
    assert.equal(result.timer, 0);
    assert.deepEqual(await page.evaluate(() => window.clockCalls), { raf: 0, timer: 0, observer: 0 });
  });

  await t.test('out-of-order seeks produce identical screenshots and survive load synchronization', async () => {
    const first = await seek(1.1);
    const pixels = hash(await page.screenshot());
    for (const time of [20, 0.6, 1.9, -1, 0.61]) await seek(time);
    assert.deepEqual(await seek(1.1), first);
    assert.equal(hash(await page.screenshot()), pixels);
    await page.evaluate(() => window.dispatchEvent(new Event('load')));
    assert.deepEqual(await seek(1.1), first);
    assert.equal(hash(await page.screenshot()), pixels);
  });

  await t.test('markup text returns at the count end; done waits for every motion and holds', async () => {
    const afterCount = await seek(1.6);
    assert.equal(afterCount.count, null);
    assert.equal(afterCount.text, '$1,250.50M');
    assert.equal(afterCount.opacity, 1);
    assert.equal(afterCount.state, 'playing');
    assert.ok(!afterCount.classes.includes('ax-counting'));
    assert.equal((await seek(2.4)).state, 'done');
    const finished = hash(await page.screenshot());
    assert.equal((await seek(200)).state, 'done');
    assert.equal(hash(await page.screenshot()), finished);
    const fade = await seek(0.5, 'troff');
    assert.equal(fade.count, null);
    assert.ok(Math.abs(fade.opacity - 0.5) < 0.001, JSON.stringify(fade));
  });

  await t.test('each seek removes frozen values and retains authored inline styles', async () => {
    await seek(1.1);
    await seek(0.6);
    const result = await page.$eval('#zavvo', (root) => ({ opacity: root.querySelector('.ax-nembi').style.opacity,
      transform: root.querySelector('.ax-nembi').style.transform, rule: root.querySelector('.ax-rule').style.transform }));
    assert.deepEqual(result, { opacity: '0.8', transform: '', rule: '' });
  });

  await t.test('reduced motion and print discard frozen values and restore the finished still', async () => {
    await seek(1.1);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.waitForFunction(() => document.getElementById('zavvo').dataset.state === 'still');
    let result = await seek(1.1);
    assert.equal(result.state, 'still');
    assert.equal(result.opacity, 1);
    assert.equal(result.count, null);
    assert.equal(result.animations, 0);
    assert.equal(result.rule, 'none');
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await seek(1.1);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    result = await seek(1.1);
    assert.equal(result.state, 'still');
    assert.equal(result.rule, 'none');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  });

  await t.test('scan remains idempotent and render roots do not depend on IntersectionObserver', async () => {
    const result = await page.evaluate(() => {
      const before = { ...window.clockCalls };
      const IO = window.IntersectionObserver;
      delete window.IntersectionObserver;
      window.AxOnce.scan();
      window.dispatchEvent(new CustomEvent('video-render:seek', { detail: { time: 1.1 } }));
      window.IntersectionObserver = IO;
      return { roots: window.AxOnce.roots.length, count: document.querySelector('#zavvo .ax-count').textContent,
        calls: Object.fromEntries(Object.entries(window.clockCalls).map(([name, value]) => [name, value - before[name]])) };
    });
    assert.deepEqual(result, { roots: 3, count: '$1,094.19M', calls: { raf: 0, timer: 0, observer: 0 } });
  });

  await t.test('a browser root on the same page plays itself and provides the reference count digits', async () => {
    await page.evaluate(() => {
      document.body.append(document.getElementById('pluvo-template').content.cloneNode(true));
      window.AxOnce.scan();
    });
    assert.equal(await page.$eval('#pluvo', (root) => root.dataset.state), 'waiting');
    await page.$eval('#pluvo', (root) => root.scrollIntoView());
    await page.waitForFunction(() => document.getElementById('pluvo').dataset.state === 'done');
    const result = await page.evaluate(() => ({ samples: window.countSamples, calls: window.clockCalls,
      text: document.querySelector('#pluvo .ax-num').textContent, count: document.querySelector('#pluvo .ax-count') }));
    assert.ok(result.calls.raf > 0);
    assert.ok(result.calls.timer > 0);
    assert.equal(result.calls.observer, 1);
    assert.equal(result.text, '$1,250.50M');
    assert.equal(result.count, null);
    const samples = result.samples.filter((sample) => sample.elapsed > 100 && sample.elapsed < 900);
    assert.ok(samples.length > 3, JSON.stringify(result));
    for (const sample of [samples[0], samples[Math.floor(samples.length / 2)], samples.at(-1)]) {
      assert.equal((await seek(0.6 + sample.elapsed / 1000)).count, sample.text);
    }
    assert.deepEqual(errors, []);
  });

  await t.test('completion does not wait for a rule or entrance that is absent', async () => {
    const result = await page.evaluate(() => {
      const root = document.createElement('figure');
      root.className = 'ax-once';
      root.dataset.clock = 'render';
      root.dataset.at = '0';
      root.style.setProperty('--ax-count', '200ms');
      root.innerHTML = '<span class="ax-num">Zibble 37</span>';
      document.body.append(root);
      window.AxOnce.scan();
      window.dispatchEvent(new CustomEvent('video-render:seek', { detail: { time: 0.2 } }));
      const result = { state: root.dataset.state, text: root.textContent, count: root.querySelector('.ax-count'),
        animations: root.getAnimations({ subtree: true }).length };
      root.remove();
      return result;
    });
    assert.deepEqual(result, { state: 'done', text: 'Zibble 37', count: null, animations: 0 });
  });
});
