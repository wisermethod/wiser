/* Animated Explainer, loop starter 0.2.0: the engine for an explainer that plays a timeline over and over.
 *
 * The page's markup and stylesheet are the finished picture. This script only ever takes that picture
 * apart and puts it back together on a timeline, and only where motion is wanted: never under reduced
 * motion, in print, in a reveal.js print view (?print-pdf), or when the address carries ?export.
 *
 * It starts every .ax-loop on the page, once, however many times the file is included; a piece added to the
 * page later is started by calling window.AxLoop.scan(). Each root runs on its own clock: it starts when a
 * quarter of its stage is in view, or when its reveal.js slide is current and any fragment holding it is
 * shown, and waits off-screen, on a hidden tab, and while its pause control is pressed. Every word it shows
 * comes from the markup, the pause control's two names included. It writes no style attribute, so a page
 * whose policy is style-src 'self' runs it.
 *
 * What it reads from the markup:
 *   data-len on the root            the cycle in seconds; the last moment is at least 0.3 s;
 *                                   a cycle shorter than its last moment plus 0.9 s,
 *                                   or no number at all, keeps the still and warns in the console
 *   data-clock="render" on a root  plays once from video-render:seek on window, whose detail.time is seconds;
 *                                   waits on the finished still until a seek, with no browser-clock start;
 *                                   data-len is the duration and must exceed the last moment, with no closing fade
 *   data-at, data-off on an element the moment, in seconds, it turns on, and the moment it turns off
 *   data-keep on a stage child      stays above the cover, with no data-at or data-off
 *   path[data-from][data-to]        a line measured from one element's anchor to another's, in CSS pixels;
 *                                   data-fx, data-fy, data-tx, data-ty are the anchors as fractions of each
 *                                   element's box, data-head the arrowhead in percent of the stage's width
 *   .ax-fly[data-from][data-to]     a flight from one element's anchor to another's, same anchors
 * An anchor is an HTML element laid out inside the stage. An SVG shape works as an anchor only while it
 * carries no transform of its own: animate a shape inside it instead.
 * What it writes:
 *   data-state on the root          still, waiting, running or paused
 *   ax-js on the root               while it can animate, which shows the pause control
 *   ax-armed, ax-fading, ax-cover   on the stage; on, on each timed element
 */
(function () {
  'use strict';
  if (window.AxLoop) {
    if (typeof window.AxLoop.scan === 'function') window.AxLoop.scan();
    return;
  }
  var api = window.AxLoop = { version: '0.2.0', roots: [] };

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var held = /[?&](print-pdf|export)(=|&|$)/.test(window.location.search);
  var printing = false;
  var states = [];
  var looping = false;
  var rafId = 0;
  var last = 0;

  function still() {
    var html = document.documentElement.classList;
    return held || printing || !!(mq && mq.matches) || html.contains('print-pdf') || html.contains('reveal-print');
  }
  function num(v) { return Math.round(v * 100) / 100; }
  /* A timing property in milliseconds, written as CSS writes a time: 300ms or 0.3s. */
  function ms(root, name, fallback) {
    var raw = window.getComputedStyle(root).getPropertyValue(name).trim();
    var v = parseFloat(raw);
    if (!isFinite(v) || v < 0) return fallback;
    return /[^m]s$/i.test(raw) ? v * 1000 : v;
  }

  /* The one curve every line uses, here and in the markup's default path, so the two agree. */
  function wirePath(a, b, head) {
    var dx = b.x - a.x, dy = b.y - a.y, c1, c2;
    if (Math.abs(dx) >= Math.abs(dy)) {
      var x = a.x + dx * 0.55;
      c1 = { x: x, y: a.y }; c2 = { x: x, y: b.y };
    } else {
      var y = a.y + dy * 0.55;
      c1 = { x: a.x, y: y }; c2 = { x: b.x, y: y };
    }
    var d = 'M' + num(a.x) + ' ' + num(a.y) + ' C' + num(c1.x) + ' ' + num(c1.y) + ' ' +
      num(c2.x) + ' ' + num(c2.y) + ' ' + num(b.x) + ' ' + num(b.y);
    if (head > 0) {
      var ang = (c2.x === b.x && c2.y === b.y) ? Math.atan2(dy, dx) : Math.atan2(b.y - c2.y, b.x - c2.x);
      d += ' M' + num(b.x - head * Math.cos(ang - 0.45)) + ' ' + num(b.y - head * Math.sin(ang - 0.45)) +
        ' L' + num(b.x) + ' ' + num(b.y) +
        ' L' + num(b.x - head * Math.cos(ang + 0.45)) + ' ' + num(b.y - head * Math.sin(ang + 0.45));
    }
    return d;
  }
  api.wirePath = wirePath;

  /* The stage's padding box, which absolutely placed children and the line overlay are laid out in, in its
     own CSS pixels. k is the scale an ancestor applies, such as a reveal.js slide's. */
  function frameOf(stage) {
    var r = stage.getBoundingClientRect();
    var k = stage.offsetWidth ? r.width / stage.offsetWidth : 1;
    if (!(k > 0)) k = 1;
    return { left: r.left + stage.clientLeft * k, top: r.top + stage.clientTop * k, w: stage.clientWidth, h: stage.clientHeight, k: k };
  }
  /* An element's finished box in the stage's own CSS pixels, read from layout, which no transform touches:
     not the element's own entrance and not an ancestor's scale, so a measurement taken mid-motion, or inside
     a scaled reveal.js slide, is still the finished position. An absolutely placed element gives its exact
     computed position and size; any other gives its whole-pixel offsets. An anchor layout does not reach,
     such as an SVG shape, falls back to its on-screen box divided by the stage's scale. */
  function px(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function boxIn(stage, el) {
    if (el.offsetParent) {
      var cs0 = window.getComputedStyle(el);
      var w = el.offsetWidth, h = el.offsetHeight;
      if (cs0.position === 'absolute' && isFinite(parseFloat(cs0.width)) && isFinite(parseFloat(cs0.height))) {
        w = px(cs0.width); h = px(cs0.height);
        if (cs0.boxSizing !== 'border-box') {
          w += px(cs0.paddingLeft) + px(cs0.paddingRight) + px(cs0.borderLeftWidth) + px(cs0.borderRightWidth);
          h += px(cs0.paddingTop) + px(cs0.paddingBottom) + px(cs0.borderTopWidth) + px(cs0.borderBottomWidth);
        }
      }
      var x = 0, y = 0, n = el;
      while (n && n !== stage) {
        var cs = n === el ? cs0 : window.getComputedStyle(n);
        if (cs.position === 'absolute' && isFinite(parseFloat(cs.left)) && isFinite(parseFloat(cs.top))) {
          x += px(cs.left) + px(cs.marginLeft);
          y += px(cs.top) + px(cs.marginTop);
        } else {
          x += n.offsetLeft;
          y += n.offsetTop;
        }
        var p = n.offsetParent;
        if (p && p !== stage) { x += p.clientLeft; y += p.clientTop; }
        n = p;
      }
      if (n === stage) return { x: x, y: y, w: w, h: h };
    }
    var f = frameOf(stage), r = el.getBoundingClientRect();
    return { x: (r.left - f.left) / f.k, y: (r.top - f.top) / f.k, w: r.width / f.k, h: r.height / f.k };
  }
  function anchor(stage, sel, fx, fy) {
    var el = sel ? stage.querySelector(sel) : null;
    if (!el) return null;
    var b = boxIn(stage, el);
    return { x: b.x + b.w * fx, y: b.y + b.h * fy };
  }
  function attr(el, name, fallback) {
    var v = parseFloat(el.getAttribute(name));
    return isFinite(v) ? v : fallback;
  }

  function place(state) {
    var stage = state.stage;
    var f = frameOf(stage);
    if (f.w < 2 || f.h < 2) return;
    [].forEach.call(stage.querySelectorAll('.ax-wires'), function (svg) {
      if (!svg.getClientRects().length) return; /* the other layout's lines wait until it is shown */
      svg.setAttribute('viewBox', '0 0 ' + num(f.w) + ' ' + num(f.h));
      [].forEach.call(svg.querySelectorAll('path[data-from][data-to]'), function (path) {
        var a = anchor(stage, path.getAttribute('data-from'), attr(path, 'data-fx', 1), attr(path, 'data-fy', 0.5));
        var b = anchor(stage, path.getAttribute('data-to'), attr(path, 'data-tx', 0), attr(path, 'data-ty', 0.5));
        if (a && b) path.setAttribute('d', wirePath(a, b, attr(path, 'data-head', 0) * f.w / 100));
      });
    });
    [].forEach.call(stage.querySelectorAll('.ax-fly[data-from][data-to]'), function (fly) {
      var a = anchor(stage, fly.getAttribute('data-from'), attr(fly, 'data-fx', 0.5), attr(fly, 'data-fy', 0.5));
      var b = anchor(stage, fly.getAttribute('data-to'), attr(fly, 'data-tx', 0.5), attr(fly, 'data-ty', 0.5));
      if (!a || !b) return;
      fly.style.left = num((a.x - fly.offsetWidth / 2) / f.w * 100) + '%';
      fly.style.top = num((a.y - fly.offsetHeight / 2) / f.h * 100) + '%';
      fly.style.setProperty('--ax-fly-x', num(b.x - a.x) + 'px');
      fly.style.setProperty('--ax-fly-y', num(b.y - a.y) + 'px');
    });
  }

  /* The timeline's moments, and whether the cycle has room for them: the last moment, at least the cover's
     lift at 0.3 s, then the hold, then the closing fade of 0.6 s, with 0.3 s to spare. The fade must fit
     inside that closing window so the cover hides the reset. */
  function moments(state) {
    var set = {}, lastMoment = 0.3;
    set[0.3] = 1;
    [].forEach.call(state.stage.querySelectorAll('[data-at]'), function (el) {
      var at = attr(el, 'data-at', NaN);
      if (isFinite(at)) { set[at] = 1; lastMoment = Math.max(lastMoment, at); }
      if (el.hasAttribute('data-off')) {
        var off = attr(el, 'data-off', NaN);
        if (isFinite(off)) { set[off] = 1; lastMoment = Math.max(lastMoment, off); }
      }
    });
    var room = isFinite(state.len) && state.len >= lastMoment + 0.9;
    var fade = ms(state.stage, '--ax-fade', 300);
    state.valid = room && fade <= 600;
    set[state.len - 0.6] = 1;
    state.marks = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    if (!room && window.console) {
      window.console.warn('Animated Explainer: data-len ' + state.root.getAttribute('data-len') +
        ' leaves no room after the last moment at ' + lastMoment + ' s; the piece shows its still.');
    }
    if (fade > 600 && window.console) {
      window.console.warn('Animated Explainer: --ax-fade ' + window.getComputedStyle(state.stage).getPropertyValue('--ax-fade').trim() +
        ' exceeds the closing window of 0.6 s; the piece shows its still.');
    }
  }
  function step(state, t) {
    var i = 0;
    while (i < state.marks.length && state.marks[i] <= t) i++;
    return i;
  }
  function apply(state, t) {
    var stage = state.stage;
    stage.classList.add('ax-armed');
    [].forEach.call(stage.querySelectorAll('[data-at]'), function (el) {
      var at = attr(el, 'data-at', 0);
      var off = el.hasAttribute('data-off') ? attr(el, 'data-off', Infinity) : Infinity;
      el.classList.toggle('on', t >= at && t < off);
    });
    stage.classList.toggle('ax-fading', t < 0.3 || t > state.len - 0.6);
  }
  function freeze(stage, paused) {
    if (!stage.getAnimations) return;
    stage.getAnimations({ subtree: true }).forEach(function (anim) {
      try {
        if (paused && anim.playState === 'running') anim.pause();
        else if (!paused && anim.playState === 'paused') anim.play();
      } catch (err) { /* an animation that already ended */ }
    });
  }
  /* A pause in either fade goes to the finished hold, with the cover clear. Elsewhere it keeps the frame.
     Cancelling the transitions after applying the hold exposes their finished styles at once. */
  function hold(state) {
    state.t = state.len - 0.601;
    state.key = step(state, state.t);
    apply(state, state.t);
    void state.stage.offsetWidth;
    cancelAll(state.stage);
  }
  /* Back to the still at once. A transition already running keeps running in Chrome after the rule that
     declared it stops applying, as when reduced motion is switched on mid-play, so each one is cancelled,
     which shows the finished style the base rules give. */
  function cancelAll(el) {
    if (!el.getAnimations) return;
    el.getAnimations({ subtree: true }).forEach(function (anim) {
      try { anim.cancel(); } catch (err) { /* already gone */ }
    });
  }
  function setState(state, s) {
    if (state.root.getAttribute('data-state') !== s) state.root.setAttribute('data-state', s);
  }

  function renderClock(state) { return state.root.getAttribute('data-clock') === 'render'; }
  function initRender(state) {
    var raw = state.root.getAttribute('data-len');
    state.len = raw && raw.trim() ? Number(raw) : NaN;
    var lastMoment = 0.3;
    [].forEach.call(state.stage.querySelectorAll('[data-at]'), function (el) {
      lastMoment = Math.max(lastMoment, attr(el, 'data-at', 0), attr(el, 'data-off', 0));
    });
    state.valid = isFinite(state.len) && state.len > lastMoment;
    state.unserved = new Set();
    state.committed = [];
    if (!state.valid && window.console) {
      window.console.warn('Animated Explainer: render data-len ' + raw +
        ' must be numeric and greater than the last moment at ' + lastMoment + ' s; the piece shows its still.');
    }
    state.root.axLoop = state;
    api.roots.push(state.root);
    states.push(state);
    setState(state, 'still');
  }
  function syncRender(state) {
    if (still() || !state.valid) {
      if (state.armed) disarm(state);
      setState(state, 'still');
    }
  }
  function flushRender(stage) {
    void stage.offsetWidth;
    window.getComputedStyle(stage).opacity;
  }
  function renderAnimations(stage) {
    return stage.getAnimations ? stage.getAnimations({ subtree: true }) : [];
  }
  /* The nearest timed ancestor owns a child's transitions too, including its leaving transition. */
  function timedOwner(stage, target) {
    for (var el = target; el && el !== stage; el = el.parentElement) {
      if (el.hasAttribute && el.hasAttribute('data-at')) return el;
    }
    return stage.hasAttribute('data-at') ? stage : null;
  }
  function reportUnserved(state, anim) {
    var effect = anim.effect, target = effect && effect.target;
    if ((target === state.stage && effect.pseudoElement === '::after') || timedOwner(state.stage, target)) return;
    if (!state.unserved.has(target) && window.console) {
      state.unserved.add(target);
      window.console.warn('Animated Explainer: unserved render animation on .' +
        (target && target.getAttribute ? target.getAttribute('class') : '(unknown)') + '; no timed ancestor.');
    }
  }
  function seekRender(state, t) {
    if (!state.valid || still()) { syncRender(state); return; }
    place(state);
    var stage = state.stage;
    var timed = [].slice.call(stage.querySelectorAll('[data-at]'));
    stage.classList.add('ax-armed', 'ax-cover');
    stage.classList.remove('ax-fading');
    timed.forEach(function (el) { el.classList.remove('on'); });
    uncommit(state);
    flushRender(stage);
    renderAnimations(stage).forEach(function (anim) { reportUnserved(state, anim); });
    cancelAll(stage);
    flushRender(stage);
    state.armed = true;
    state.t = t;
    /* A moment that has only just come shows nothing yet, so it waits until its time has passed: no animation
       exists at zero progress, where its layer alone would change how the frame is drawn. */
    setState(state, t <= 0.3 ? 'waiting' : 'paused');
    if (t <= 0.3) return;

    stage.classList.remove('ax-cover');
    timed.filter(function (el) { return attr(el, 'data-at', Infinity) < t; })
      .forEach(function (el) { el.classList.add('on'); });
    flushRender(stage);
    var left = timed.filter(function (el) { return attr(el, 'data-off', Infinity) < t; });
    if (left.length) {
      renderAnimations(stage).forEach(function (anim) {
        var target = anim.effect && anim.effect.target;
        if (left.indexOf(timedOwner(stage, target)) !== -1) {
          try { anim.finish(); } catch (err) { /* an infinite animation cannot finish */ }
        }
      });
      flushRender(stage);
      left.forEach(function (el) { el.classList.remove('on'); });
      flushRender(stage);
    }
    var frozen = [];
    renderAnimations(stage).forEach(function (anim) {
      var effect = anim.effect, target = effect && effect.target;
      var owner = timedOwner(stage, target);
      var from;
      if (target === stage && effect.pseudoElement === '::after') from = 0.3;
      else if (owner) {
        var off = attr(owner, 'data-off', Infinity);
        from = off < t ? off : attr(owner, 'data-at', 0);
      } else {
        reportUnserved(state, anim);
        return;
      }
      var local = Math.max(0, (t - from) * 1000);
      var end = effect && effect.getComputedTiming ? effect.getComputedTiming().endTime : Infinity;
      try {
        /* The cover is a pseudo-element, whose value cannot be written to a style: it stays a paused animation for
           its 0.3 s lift, and is finished once past its end. */
        if (target === stage && effect.pseudoElement) {
          if (local >= end) anim.finish();
          else { anim.pause(); anim.currentTime = local; }
          return;
        }
        anim.pause();
        anim.currentTime = Math.min(local, end);
        frozen.push(anim);
      } catch (err) { /* an animation that already ended */ }
    });
    /* Every other motion is frozen into its element's own style and removed, so nothing is animating when the frame
       is captured: a renderer that meets live animations, or a compositor not yet caught up with a paused one,
       would otherwise draw a frame that depends on the seeks before it. Each value is read from the computed style
       at this time, all of them before any is written, since commitStyles() writes a transition's end value. The
       next seek removes what was written before it turns anything on. */
    flushRender(stage);
    var values = frozen.map(function (anim) {
      var target = anim.effect.target, cs = window.getComputedStyle(target);
      return { anim: anim, target: target, props: keyframeProperties(anim.effect).map(function (name) {
        return [name, name.indexOf('--') === 0 ? cs.getPropertyValue(name) : cs[name]];
      }) };
    });
    values.forEach(function (v) {
      v.props.forEach(function (pair) {
        if (pair[0].indexOf('--') === 0) v.target.style.setProperty(pair[0], pair[1]);
        else v.target.style[pair[0]] = pair[1];
        state.committed.push([v.target, pair[0]]);
      });
    });
    /* Writing a value can itself start a transition toward it, so once written, every animation but the cover's is
       cancelled, which leaves the written value in force. */
    flushRender(stage);
    renderAnimations(stage).forEach(function (anim) {
      var effect = anim.effect;
      if (effect && effect.target === stage && effect.pseudoElement) return;
      try { anim.cancel(); } catch (err) { /* already gone */ }
    });
    flushRender(stage);
  }
  function keyframeProperties(effect) {
    var names = {};
    (effect.getKeyframes ? effect.getKeyframes() : []).forEach(function (frame) {
      Object.keys(frame).forEach(function (key) {
        if (key !== 'offset' && key !== 'computedOffset' && key !== 'easing' && key !== 'composite') names[key] = 1;
      });
    });
    return Object.keys(names);
  }
  function uncommit(state) {
    (state.committed || []).forEach(function (pair) {
      var el = pair[0], name = pair[1];
      if (name.indexOf('--') === 0) el.style.removeProperty(name);
      else el.style[name] = '';
    });
    state.committed = [];
  }
  window.addEventListener('video-render:seek', function (event) {
    var t = Number(event.detail && event.detail.time);
    if (!isFinite(t)) return;
    states.forEach(function (state) { if (renderClock(state)) seekRender(state, t); });
  });

  function arm(state) {
    place(state);
    state.armed = true;
    state.t = 0;
    var stage = state.stage;
    stage.classList.add('ax-cover');
    apply(state, 0);
    state.key = step(state, 0);
    void stage.offsetWidth;
    stage.classList.remove('ax-cover');
  }
  function disarm(state) {
    var stage = state.stage;
    stage.classList.remove('ax-armed', 'ax-fading', 'ax-cover');
    [].forEach.call(stage.querySelectorAll('.on'), function (el) { el.classList.remove('on'); });
    cancelAll(stage);
    state.armed = false;
    state.running = false;
    state.t = 0;
    state.key = -1;
  }
  function render(state) {
    if (!state.armed) return;
    var key = step(state, state.t);
    if (key === state.key) return;
    state.key = key;
    apply(state, state.t);
  }

  /* One frame loop for every root. It stops when nothing runs, and a root that resumes takes no time from the
     gap it was away for, so a hidden tab or a long pause never jumps the timeline. */
  function kick() {
    if (looping) return;
    looping = true;
    last = performance.now();
    rafId = requestAnimationFrame(tick);
  }
  function halt() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    looping = false;
  }
  function tick(now) {
    var dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    var any = false;
    states.forEach(function (state) {
      if (!state.running) return;
      any = true;
      if (state.fresh) { state.fresh = false; return; }
      state.t += dt;
      if (state.t >= state.len) { state.t = 0; state.key = -1; }
      render(state);
    });
    if (any) rafId = requestAnimationFrame(tick);
    else { rafId = 0; looping = false; }
  }

  function sync(state) {
    if (renderClock(state)) { syncRender(state); return; }
    var can = !still() && state.valid && typeof window.IntersectionObserver === 'function' &&
      (!state.slide || !!window.Reveal);
    state.root.classList.toggle('ax-js', can);
    if (!can) {
      if (state.armed) disarm(state);
      setState(state, 'still');
    } else {
      if (!state.armed) {
        arm(state);
        if (state.paused) hold(state);
      }
      var run = state.visible && !document.hidden && !state.paused;
      if (run !== state.running) {
        state.running = run;
        if (run) state.fresh = true;
        freeze(state.stage, !run);
      }
      setState(state, state.paused ? 'paused' : (run ? 'running' : 'waiting'));
      if (run) kick();
    }
    if (!states.some(function (s) { return s.running; })) halt();
  }
  function syncAll() { states.forEach(sync); }

  function paint(btn, paused) {
    var label = btn.getAttribute(paused ? 'data-play' : 'data-pause');
    if (label) {
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    }
  }

  function watch(state) {
    var root = state.root;
    var btn = root.querySelector('.ax-btn');
    if (btn) btn.addEventListener('click', function () {
      state.paused = !state.paused;
      if (state.paused && state.armed && (state.t < 0.3 + ms(state.stage, '--ax-fade', 300) / 1000 || state.t >= state.len - 0.6)) hold(state);
      paint(btn, state.paused);
      sync(state);
    });

    if ('ResizeObserver' in window) {
      var queued = false;
      new ResizeObserver(function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () {
          queued = false;
          if (state.armed) place(state);
        });
      }).observe(root.querySelector('.ax-frame') || state.stage);
    }

    /* In a reveal.js deck the slide decides: it plays while its slide is current and every fragment holding
       it is shown. */
    var slide = root.closest ? root.closest('.reveal .slides section') : null;
    if (slide) {
      state.slide = slide;
      var frags = [];
      for (var n = root; n && n !== slide; n = n.parentElement) {
        if (n.classList && n.classList.contains('fragment')) frags.push(n);
      }
      var shown = function () {
        return slide.classList.contains('present') &&
          frags.every(function (f) { return f.classList.contains('visible'); });
      };
      var mo = new MutationObserver(function () {
        state.visible = shown();
        sync(state);
      });
      mo.observe(slide, { attributes: true, attributeFilter: ['class'] });
      frags.forEach(function (f) { mo.observe(f, { attributes: true, attributeFilter: ['class'] }); });
      state.visible = shown();
      return;
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          state.visible = entry.isIntersecting && entry.intersectionRatio >= 0.25;
          sync(state);
        });
      }, { threshold: [0, 0.2, 0.25, 0.3, 0.5, 1] }).observe(state.stage);
    }
  }

  function init() {
    [].forEach.call(document.querySelectorAll('.ax-loop'), function (root) {
      if (root.axLoop) return;
      var stage = root.querySelector('.ax-stage');
      if (!stage) return;
      var state = {
        root: root, stage: stage, len: attr(root, 'data-len', NaN), t: 0, key: -1, marks: [], valid: false,
        paused: false, visible: false, armed: false, running: false, fresh: false
      };
      if (renderClock(state)) { initRender(state); return; }
      moments(state);
      root.axLoop = state;
      api.roots.push(root);
      states.push(state);
      watch(state);
      requestAnimationFrame(function () { sync(state); });
    });
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

  document.addEventListener('visibilitychange', syncAll);
  window.addEventListener('beforeprint', function () { printing = true; syncAll(); });
  window.addEventListener('afterprint', function () { printing = false; syncAll(); });
  window.addEventListener('load', syncAll);
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', syncAll);
    else if (mq.addListener) mq.addListener(syncAll);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
