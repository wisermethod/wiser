'use strict';
// Every frame from its time alone: the camera zooms in from frame 15 to 55 and holds, by inline transform.
(function () {
  const FPS = 30;
  const camera = document.getElementById('camera');
  const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
  function seek(time) {
    const f = Math.round(time * FPS);
    const t = ease(Math.max(0, Math.min(1, (f - 15) / 40)));
    const k = 1 + 1.6 * t;
    camera.style.transform = `translate(${-30 * t}px,${-25 * t}px) scale(${k})`;
  }
  window.addEventListener('video-render:seek', (e) => seek(e.detail.time));
  seek(0);
})();
