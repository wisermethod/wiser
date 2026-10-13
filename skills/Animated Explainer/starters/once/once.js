/* Animated Explainer, once starter 0.1.0: the engine for a figure that plays once when it is seen, then holds.
 *
 * The page's markup and stylesheet are the finished figure. This script hides a figure that has not yet
 * been seen, never showing it at zero; one already a quarter in view on its first arm keeps the still.
 * Otherwise it plays once when a quarter of it is in view, or on a reveal.js
 * slide when its slide is current and any fragment holding it is shown: a number counts up to the value
 * the markup gives, and its rule draws under it. Several on one page take turns, in document order, each
 * starting only when everything the one before it moves has finished; one no longer shown when its turn comes
 * waits until it is shown again, and one on a slide the presenter leaves mid-play goes back to waiting and
 * plays again when its slide returns. It never animates under reduced
 * motion, in print, in a reveal.js print view (?print-pdf), or when the address carries ?export.
 *
 * It starts every .ax-once on the page, once, however many times the file is included; a figure added to
 * the page later is started by calling window.AxOnce.scan(). It writes no style attribute.
 *
 * What it counts. The markup's .ax-num holds one number, with any words or symbols around it: 37, 1,250,
 * 2.4, $3.5M or 98%. It counts that number in its own format and ends on the markup's own text. Anything it
 * cannot read without guessing fades in instead of counting: a second number, a range or a date, a negative
 * number, an exponent, a comma or point it cannot tell apart (1.250,5, 12,34, or 1.250 with no grouping
 * comma), more than six decimal places, or a root marked data-count="off", which is how a year or any figure
 * that should not count is kept still.
 *
 * What it writes:
 *   data-state on the root    still, waiting, playing or done
 *   ax-armed, ax-go, ax-countable, ax-counting on the root; a temporary .ax-count while counting
 */
(function () {
  'use strict';
  if (window.AxOnce) {
    if (typeof window.AxOnce.scan === 'function') window.AxOnce.scan();
    return;
  }
  var api = window.AxOnce = { version: '0.1.0', roots: [] };

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var held = /[?&](print-pdf|export)(=|&|$)/.test(window.location.search);
  var printing = false;
  var states = [];
  var queue = [];
  var busy = null;
  var io = null;

  function still() {
    var html = document.documentElement.classList;
    return held || printing || !!(mq && mq.matches) || html.contains('print-pdf') || html.contains('reveal-print');
  }
  function setState(state, s) {
    if (state.root.getAttribute('data-state') !== s) state.root.setAttribute('data-state', s);
  }
  /* A timing property in milliseconds, written as CSS writes a time: 800ms or 0.8s. */
  function ms(root, name, fallback) {
    var raw = window.getComputedStyle(root).getPropertyValue(name).trim();
    var v = parseFloat(raw);
    if (!isFinite(v) || v < 0) return fallback;
    return /[^m]s$/i.test(raw) ? v * 1000 : v;
  }

  function parse(text, root) {
    if (root.getAttribute('data-count') === 'off') return null;
    var m = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/.exec(text);
    if (!m) return null;
    var raw = m[0];
    var prefix = text.slice(0, m.index);
    var suffix = text.slice(m.index + raw.length);
    if (/\d/.test(prefix) || /\d/.test(suffix)) return null;
    if (/[-−]\s*$/.test(prefix)) return null;
    if (/^\d{1,3}\.\d{3}$/.test(raw)) return null;
    var dot = raw.indexOf('.');
    var decimals = dot < 0 ? 0 : raw.length - dot - 1;
    var value = parseFloat(raw.replace(/,/g, ''));
    if (decimals > 6 || !isFinite(value)) return null;
    return { prefix: prefix, suffix: suffix, value: value, decimals: decimals, grouped: raw.indexOf(',') >= 0, text: text };
  }
  function format(p, v) {
    var s = v.toFixed(p.decimals);
    if (p.grouped) {
      var parts = s.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      s = parts.join('.');
    }
    return p.prefix + s + p.suffix;
  }

  function clearCount(state) {
    if (state.raf) cancelAnimationFrame(state.raf);
    if (state.timer) clearTimeout(state.timer);
    state.raf = 0;
    state.timer = 0;
    if (state.count && state.count.parentNode) state.count.parentNode.removeChild(state.count);
    state.count = null;
    state.root.classList.remove('ax-counting');
  }
  /* Done only once nothing in the figure still moves: the timer gives the planned length, then any animation
     still running is awaited, for at most two seconds, so the next figure never starts on this one's last frame. */
  function settle(state, token) {
    var running = state.root.getAnimations ? state.root.getAnimations({ subtree: true }).filter(function (a) {
      return a.playState === 'running';
    }) : [];
    if (!running.length || typeof Promise === 'undefined') { finish(state); return; }
    var go = function () { if (state.token === token) finish(state); };
    Promise.all(running.map(function (a) { return a.finished.catch(function () {}); })).then(go);
    state.timer = setTimeout(go, 2000);
  }
  function finish(state) {
    clearCount(state);
    state.token += 1;
    state.done = true;
    setState(state, 'done');
    if (busy === state) busy = null;
    next();
  }
  /* Give the armed entrance a frame before it plays, including on a slide already current at load.
     Reserving the turn now keeps the queue in order; a reset or a still cancels this frame as it does a count. */
  function play(state) {
    busy = state;
    var token = state.token;
    state.raf = requestAnimationFrame(function () {
      state.raf = requestAnimationFrame(function () {
        state.raf = 0;
        if (state.token !== token) return;
        if (!state.shown || still() || !state.root.classList.contains('ax-armed')) { reset(state); return; }
        enter(state);
      });
    });
  }
  /* The figure is done when the last thing it moves has finished: the count or the fade, and the rule's
     draw after its delay. */
  function enter(state) {
    var root = state.root;
    var token = state.token;
    try {
      /* Compute the hidden entrance before playing. */
      void window.getComputedStyle(state.num).opacity;
      var ruleEl = root.querySelector('.ax-rule');
      if (ruleEl) void window.getComputedStyle(ruleEl).transform;
      root.classList.add('ax-go');
      setState(state, 'playing');
      var rule = ms(root, '--ax-rule-delay', 200) + ms(root, '--ax-draw', 500);
      if (!state.parsed) {
        state.timer = setTimeout(function () { settle(state, token); }, Math.max(ms(root, '--ax-enter', 400), rule));
        return;
      }
      var total = ms(root, '--ax-count', 800);
      var span = document.createElement('span');
      span.className = 'ax-count';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = format(state.parsed, 0);
      (state.num.parentNode || root).appendChild(span);
      state.count = span;
      root.classList.add('ax-counting');
      var t0 = performance.now();
      var frame = function (now) {
        var p = Math.min(1, Math.max(0, (now - t0) / total));
        var eased = 1 - Math.pow(1 - p, 3); /* decelerates, never overshoots */
        if (p < 1) {
          span.textContent = format(state.parsed, state.parsed.value * eased);
          state.raf = requestAnimationFrame(frame);
          return;
        }
        clearCount(state);
        state.timer = setTimeout(function () { settle(state, token); }, Math.max(0, rule - total));
      };
      state.raf = requestAnimationFrame(frame);
    } catch (err) {
      finish(state);
    }
  }
  /* The next figure that is still shown when its turn comes; one that stopped being shown leaves the queue
     and joins it again when it is shown again. */
  function next() {
    if (busy || still()) return;
    var state;
    while ((state = queue.shift())) {
      state.queued = false;
      if (state.shown && !state.done) { play(state); return; }
    }
  }
  function enqueue(state) {
    if (state.queued || state.done || !state.shown) return;
    state.queued = true;
    queue.push(state);
    queue.sort(function (a, b) {
      return (a.root.compareDocumentPosition(b.root) & 4) ? -1 : 1;
    });
    next();
  }

  /* A figure on a slide the presenter left mid-play goes back to waiting, and plays again when its slide returns. */
  function reset(state) {
    clearCount(state);
    state.token += 1;
    state.queued = false;
    state.root.classList.remove('ax-go');
    if (state.root.getAnimations) state.root.getAnimations({ subtree: true }).forEach(function (anim) {
      try { anim.cancel(); } catch (err) { /* already gone */ }
    });
    setState(state, 'waiting');
    if (busy === state) { busy = null; next(); }
  }
  function unshown(state) {
    if (state.queued) {
      queue = queue.filter(function (s) { return s !== state; });
      state.queued = false;
    }
  }

  /* Stop everything at once: a figure that had not finished waits to be armed again; one that had stays done. */
  function stopAll() {
    states.forEach(function (state) {
      clearCount(state);
      state.token += 1;
      state.queued = false;
      state.root.classList.remove('ax-armed', 'ax-go');
      /* A running transition outlives the rule that declared it in Chrome; cancelling it shows the finished figure. */
      if (state.root.getAnimations) state.root.getAnimations({ subtree: true }).forEach(function (anim) {
        try { anim.cancel(); } catch (err) { /* already gone */ }
      });
      setState(state, state.done ? 'done' : 'still');
    });
    queue = [];
    busy = null;
  }
  /* A figure already a quarter in view on its first arm keeps the picture the reader has seen. Slides
     keep their own entrance; a figure first armed below the fold still plays when it comes into view. */
  function inView(root) {
    var r = root.getBoundingClientRect();
    var w = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
    var h = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
    return r.width > 0 && r.height > 0 && w * h >= r.width * r.height * 0.25;
  }
  function sync() {
    if (still() || !io) {
      stopAll();
      return;
    }
    states.forEach(function (state) {
      if (state.kept || (state.slide && !window.Reveal)) {
        unshown(state);
        if (busy === state) reset(state);
        state.root.classList.remove('ax-armed', 'ax-go');
        if (state.root.getAnimations) state.root.getAnimations({ subtree: true }).forEach(function (anim) {
          try { anim.cancel(); } catch (err) { /* already gone */ }
        });
        setState(state, 'still');
        return;
      }
      if (state.done) {
        setState(state, 'done');
        return;
      }
      if (!state.root.classList.contains('ax-armed')) {
        if (!state.checked) {
          state.checked = true;
          if (!state.slide && inView(state.root)) {
            state.kept = true;
            setState(state, 'still');
            return;
          }
        }
        state.root.classList.add('ax-armed');
        setState(state, 'waiting');
        if (state.current) state.current();
        else if (io) { io.unobserve(state.root); io.observe(state.root); }
      }
    });
    next();
  }

  function init() {
    var added = [];
    [].forEach.call(document.querySelectorAll('.ax-once'), function (root) {
      if (root.axOnce) return;
      var num = root.querySelector('.ax-num');
      if (!num) return;
      var state = { root: root, num: num, parsed: parse(num.textContent, root), done: false, queued: false, raf: 0, timer: 0, count: null, token: 0, shown: false };
      if (state.parsed) root.classList.add('ax-countable');
      root.axOnce = state;
      api.roots.push(root);
      states.push(state);
      added.push(state);
    });
    if (!io && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var state = entry.target.axOnce;
          if (!state || state.slide) return;
          state.shown = entry.isIntersecting && entry.intersectionRatio >= 0.25;
          if (!state.shown) { unshown(state); return; }
          if (!state.done && !still() && state.root.classList.contains('ax-armed')) enqueue(state);
        });
      }, { threshold: [0, 0.2, 0.25, 0.3, 0.5, 1] });
    }
    added.forEach(function (state) {
      /* In a reveal.js deck the slide decides: a figure plays when its slide is current and every fragment
         holding it is shown. */
      var slide = state.root.closest ? state.root.closest('.reveal .slides section') : null;
      if (slide) {
        var frags = [];
        for (var n = state.root; n && n !== slide; n = n.parentElement) {
          if (n.classList && n.classList.contains('fragment')) frags.push(n);
        }
        state.slide = slide;
        state.current = function () {
          state.shown = slide.classList.contains('present') &&
            frags.every(function (f) { return f.classList.contains('visible'); });
          if (!state.shown) {
            unshown(state);
            if (busy === state) reset(state);
            return;
          }
          if (!state.done && !still() && state.root.classList.contains('ax-armed')) enqueue(state);
        };
        var mo = new MutationObserver(state.current);
        mo.observe(slide, { attributes: true, attributeFilter: ['class'] });
        frags.forEach(function (f) { mo.observe(f, { attributes: true, attributeFilter: ['class'] }); });
      } else if (io) {
        io.observe(state.root);
      }
    });
    sync();
  }
  api.scan = init;
  function start() {
    var deck = document.querySelector('.reveal .slides');
    var R = window.Reveal;
    if (deck && R && typeof R.isReady === 'function' && !R.isReady() && typeof R.on === 'function') {
      R.on('ready', init);
      return;
    }
    init();
  }

  window.addEventListener('beforeprint', function () { printing = true; sync(); });
  window.addEventListener('afterprint', function () { printing = false; sync(); });
  window.addEventListener('load', sync);
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', sync);
    else if (mq.addListener) mq.addListener(sync);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
