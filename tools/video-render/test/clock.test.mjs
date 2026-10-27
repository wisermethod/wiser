import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BRIDGE } from '../scripts/project.mjs';
import { browserPath, checkRuntime, childEnvironment } from '../scripts/sequence.mjs';

const fixture = fileURLToPath(new URL('./fixtures/steps/index.html', import.meta.url));
const engine = fileURLToPath(new URL('../../../skills/Animated Explainer/starters/loop/loop.js', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('render clock in pinned Chromium', { timeout: 60_000 }, async (t) => {
  await checkRuntime();
  const { default: puppeteer } = await import('puppeteer-core');
  const home = await mkdtemp(join(tmpdir(), 'wiser-clock-test-'));
  let browser;
  t.after(async () => {
    try { await browser?.close(); }
    finally { await rm(home, { recursive: true, force: true }); }
  });
  browser = await puppeteer.launch({ executablePath: await browserPath(), headless: true,
    userDataDir: join(home, 'profile'), env: childEnvironment(home, await browserPath()),
    defaultViewport: { width: 640, height: 360 }, args: ['--disable-background-networking'] });
  const page = await browser.newPage();
  const warnings = [];
  page.on('console', (message) => { if (message.type() === 'warn') warnings.push(message.text()); });
  await page.evaluateOnNewDocument(() => {
    window.clockCalls = { raf: 0, observer: 0 };
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = function (callback) { window.clockCalls.raf++; return raf.call(window, callback); };
    const IO = window.IntersectionObserver;
    window.IntersectionObserver = class extends IO { constructor(...args) { super(...args); window.clockCalls.observer++; } };
  });
  await page.goto(pathToFileURL(fixture).href);
  async function seek(time) {
    return page.evaluate((time) => {
      window.dispatchEvent(new CustomEvent('video-render:seek', { detail: { time } }));
      const root = document.querySelector('.ax-loop'), stage = root.querySelector('.ax-stage');
      const first = stage.querySelector('.ax-s1');
      return { cover: stage.classList.contains('ax-cover'), fading: stage.classList.contains('ax-fading'),
        first: Number(getComputedStyle(first).opacity), child: Number(getComputedStyle(first.firstElementChild).opacity),
        line: stage.querySelector('path').getAttribute('d'),
        fly: { opacity: Number(getComputedStyle(stage.querySelector('.ax-fly')).opacity), transform: getComputedStyle(stage.querySelector('.ax-fly')).transform },
        animations: stage.getAnimations({ subtree: true }).map((a) => ({ target: a.effect.target.getAttribute('class'),
          time: a.currentTime, state: a.playState, pseudo: a.effect.pseudoElement })) };
    }, time);
  }

  await t.test('fixture is a current copy of the starter and opens on the finished still without a browser clock', async () => {
    assert.equal(await readFile(new URL('./fixtures/steps/loop.js', import.meta.url), 'utf8'), await readFile(engine, 'utf8'));
    const result = await page.evaluate(() => {
      const root = document.querySelector('.ax-loop');
      return { version: window.AxLoop.version, state: root.dataset.state, js: root.classList.contains('ax-js'),
        armed: root.querySelector('.ax-stage').classList.contains('ax-armed'), button: getComputedStyle(root.querySelector('.ax-btn')).display,
        calls: window.clockCalls };
    });
    assert.deepEqual(result, { version: '0.2.0', state: 'still', js: false, armed: false, button: 'none', calls: { raf: 0, observer: 0 } });
  });

  await t.test('seeks are synchronous and cover, timed transitions and child transitions use the same time', async () => {
    assert.equal((await seek(0.2)).cover, true);
    const result = await seek(0.5);
    assert.equal(result.cover, false);
    assert.equal(result.fading, false);
    assert.ok(Math.abs(result.first - 0.5) < 0.001, JSON.stringify(result));
    assert.ok(Math.abs(result.child - 0.5) < 0.001, JSON.stringify(result));
    // Only the cover's lift is still an animation, paused at its own time; every other motion is frozen into its
    // element's style at the seek's time, so nothing else is animating when a frame is captured.
    assert.deepEqual(result.animations.map((a) => [a.pseudo, a.state]), [['::after', 'paused']], JSON.stringify(result));
    assert.ok(Math.abs(result.animations[0].time - 200) < 0.001, JSON.stringify(result));
  });

  await t.test('flight uses its timed ancestor, and repeated out-of-order seeks give identical frames', async () => {
    const result = await seek(0.9);
    // 0.2 s into its 0.8 s travel from its own moment at 0.7 s: past the fade-in, short of the arrival. Timed from 0 it
    // would be past its end and hidden.
    assert.equal(result.fly.opacity, 1, JSON.stringify(result));
    assert.notEqual(result.fly.transform, 'none', JSON.stringify(result));
    assert.deepEqual(result.animations, [], JSON.stringify(result));
    const first = hash(await page.screenshot());
    await seek(1.8);
    await seek(0.2);
    assert.equal((await seek(0.9)).line, result.line);
    assert.equal(hash(await page.screenshot()), first);
    await seek(1.8);
    const hold = hash(await page.screenshot());
    assert.equal((await seek(20)).fading, false);
    assert.equal(hash(await page.screenshot()), hold);
  });

  await t.test('data-off finishes on-state animations on children before the leaving transition', async () => {
    await page.evaluate(() => document.querySelector('.ax-s1').setAttribute('data-off', '1.1'));
    const result = await seek(1.2);
    assert.ok(Math.abs(result.first - 0.5) < 0.001, JSON.stringify(result));
    assert.ok(Math.abs(result.child - 0.5) < 0.001, JSON.stringify(result));
    await seek(0.5);
    const again = await seek(1.2);
    assert.equal(again.first, result.first);
    assert.equal(again.child, result.child);
  });

  await t.test('animations without a timed ancestor are reported once by target class', async () => {
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = '.ax-armed .ax-untimed { animation: zibble 2s linear infinite; } @keyframes zibble { to { opacity: .5; } }';
      document.head.append(style);
      const el = document.createElement('i');
      el.className = 'ax-untimed';
      document.querySelector('.ax-stage').append(el);
    });
    await seek(0.6);
    await seek(0.7);
    assert.equal(warnings.filter((line) => /unserved.*ax-untimed/.test(line)).length, 1);
  });

  await t.test('render duration needs no closing-fade allowance; invalid durations keep the still', async () => {
    const results = await page.evaluate(() => {
      const result = [];
      for (const len of ['1.31', '', 'zibble', '2zibble', '1.3']) {
        const root = document.querySelector('.ax-loop').cloneNode(true);
        root.setAttribute('data-len', len);
        root.querySelector('.ax-stage').classList.remove('ax-armed', 'ax-cover');
        document.body.append(root);
        window.AxLoop.scan();
        window.dispatchEvent(new CustomEvent('video-render:seek', { detail: { time: 0.8 } }));
        result.push({ len, valid: root.axLoop.valid, armed: root.axLoop.armed, js: root.classList.contains('ax-js') });
        root.remove();
      }
      return result;
    });
    assert.equal(results[0].valid, true);
    assert.equal(results[0].armed, true);
    assert.ok(results.slice(1).every((r) => !r.valid && !r.armed && !r.js));
  });

  await t.test('reduced motion restores the still and cancels rendered animations', async () => {
    await seek(0.8);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.waitForFunction(() => document.querySelector('.ax-loop').dataset.state === 'still');
    const result = await page.evaluate(() => {
      const stage = document.querySelector('.ax-stage');
      return { armed: stage.classList.contains('ax-armed'), animations: stage.getAnimations({ subtree: true }).length };
    });
    assert.deepEqual(result, { armed: false, animations: 0 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  });

  await t.test('bridge uses the first-frame runtime time and forwards hf-seek before returning', async () => {
    const times = await page.evaluate((bridge) => {
      const times = [];
      window.addEventListener('video-render:seek', (event) => times.push(event.detail.time));
      window.__hfThreeTime = 0.85;
      (0, eval)(bridge);
      window.dispatchEvent(new CustomEvent('hf-seek', { detail: { time: 1.25 } }));
      return times;
    }, BRIDGE);
    assert.deepEqual(times, [0.85, 1.25]);
  });

  await t.test('a browser-clock root still starts, pauses and resumes through the page path', async () => {
    const result = await page.evaluate(() => {
      const root = document.querySelector('.ax-loop').cloneNode(true);
      root.removeAttribute('data-clock');
      root.setAttribute('data-len', '4');
      root.querySelector('.ax-stage').classList.remove('ax-armed', 'ax-cover');
      document.querySelector('main').replaceChildren(root);
      window.AxLoop.scan();
      return { observers: window.clockCalls.observer, raf: window.clockCalls.raf };
    });
    assert.equal(result.observers, 1);
    assert.ok(result.raf > 0);
    await page.waitForFunction(() => document.querySelector('.ax-loop').dataset.state === 'running');
    await page.click('.ax-btn');
    assert.equal(await page.$eval('.ax-loop', (root) => root.dataset.state), 'paused');
    await page.click('.ax-btn');
    assert.equal(await page.$eval('.ax-loop', (root) => root.dataset.state), 'running');
  });
});
