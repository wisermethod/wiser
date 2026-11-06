// Shared, browser-only layout. No I/O, caller text, or external assets.
export function fitBoardThumbnails(root = document) {
  for (const surface of root.querySelectorAll('.thumbnail-surface')) {
    if (!surface.getClientRects().length || !surface.clientWidth) continue;
    const board = surface.querySelector('.brand-board');
    const columns = [...board.querySelectorAll(':scope > .thumbnail-column')];
    const rows = columns.flatMap(c => [...c.children]);
    if (columns.length !== 2 || rows.length < 2) continue;
    const scale = board.getBoundingClientRect().width / board.offsetWidth;
    const gap = parseFloat(getComputedStyle(columns[0]).gap) * scale;
    const heights = rows.map(row => row.getBoundingClientRect().height);
    const total = heights.reduce((sum, h) => sum + h, 0);
    let left = 0, split = 1, difference = Infinity;
    // Every intact drawing row is a candidate. Ties keep the earlier boundary.
    for (let i = 1; i < rows.length; i++) {
      left += heights[i - 1];
      const delta = Math.abs(left + gap * (i - 1) - (total - left + gap * (rows.length - i - 1)));
      if (delta < difference) { split = i; difference = delta; }
    }
    if (columns[0].children.length !== split) {
      columns[0].replaceChildren(...rows.slice(0, split));
      columns[1].replaceChildren(...rows.slice(split));
    }
    const ends = columns.map(c => c.lastElementChild.getBoundingClientRect().bottom);
    const shorter = ends[0] <= ends[1] ? 0 : 1;
    const origin = surface.getBoundingClientRect(), col = columns[shorter].getBoundingClientRect();
    const patch = surface.querySelector('.thumbnail-patch');
    // Four real CSS pixels of clearance on every edge, outside the zoomed art.
    const width = Math.max(0, col.width - 8), height = Math.max(0, Math.abs(ends[0] - ends[1]) - 8);
    Object.assign(patch.style, { left: `${col.left - origin.left + 4}px`, top: `${ends[shorter] - origin.top + 4}px`, width: `${width}px`, height: `${height}px` });
    const option = surface.closest('.board-option');
    const caption = option?.querySelector('.board-recommendation, .board-meta .recommendation');
    const badge = option?.querySelector('.thumbnail-badge');
    let remaining = height;
    if (badge && caption) {
      // Move the one existing badge, preserving its accessible caption fallback.
      patch.prepend(badge);
      const box = badge.getBoundingClientRect();
      if (box.width <= width && box.height <= height) remaining -= box.height + 6;
      else caption.prepend(badge);
    }
    const strip = patch.querySelector('.thumbnail-swatches');
    const swatches = [...strip.children];
    // A visible chip is always at least 24 by 20 CSS px, never a scaled sliver.
    const count = remaining >= 20 ? Math.min(swatches.length, Math.floor((width + 4) / 28)) : 0;
    swatches.forEach((swatch, i) => { swatch.hidden = i >= count; });
    strip.hidden = count === 0;
  }
}

export function watchBoardThumbnails() {
  const fit = () => fitBoardThumbnails();
  const start = () => {
    fit();
    document.fonts.ready.then(fit);
    document.fonts.addEventListener('loadingdone', fit);
    window.addEventListener('resize', fit);
    window.addEventListener('hashchange', fit);
    let width;
    new ResizeObserver(entries => {
      const next = entries[0].contentRect.width;
      if (next !== width) { width = next; fit(); }
    }).observe(document.documentElement);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
