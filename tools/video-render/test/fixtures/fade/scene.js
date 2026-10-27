'use strict';
// Every frame from its time alone: the camera zooms in from frame 6 to 30 while two labels fade in over it, then all holds.
(function () {
  const FPS = 30;
  const clamp = (n) => Math.max(0, Math.min(1, n));
  const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
  const camera = document.getElementById('camera');
  const chip = document.getElementById('chip');
  const caption = document.getElementById('caption');
  function seek(time) {
    const f = Math.round(time * FPS);
    const t = ease(clamp((f - 6) / 24));
    const k = 1.5 + 1.2 * t;
    camera.style.transform = `translate(${-240 * t}px,${-150 * t}px) scale(${k})`;
    chip.style.opacity = String(clamp((f - 6 + 1) / 12));
    caption.style.opacity = String(clamp((f - 4 + 1) / 4));
  }
  window.addEventListener('video-render:seek', (e) => seek(e.detail.time));
  seek(0);
})();
