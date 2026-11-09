// Shared, browser-only layout. No I/O, caller text, or external assets.
export function fitBoardThumbnails(root = document) {
  for (const surface of root.querySelectorAll('.thumbnail-surface')) {
    if (!surface.getClientRects().length || !surface.clientWidth) continue;
    const board = surface.querySelector('.brand-board');
    const columns = [...board.querySelectorAll(':scope > .thumbnail-column')];
    const rows = columns.flatMap(c => [...c.children]);
    if (columns.length !== 2 || rows.length < 2) continue;
    // Measure at natural size on every fit, including after fonts, mode or width
    // change. Only the drawing shrinks; its box and real-size overlays do not.
    board.style.zoom = '1';
    const natural = board.getBoundingClientRect();
    const box = surface.getBoundingClientRect();
    board.style.zoom = String(Math.min(box.width / natural.width, box.height / natural.height));
    // Zoom can round descendant line boxes differently from the natural layout.
    // Check the painted size and correct downward rather than crop that rounding.
    for (let pass = 0; pass < 3; pass++) {
      const drawn = board.getBoundingClientRect();
      if (drawn.width <= box.width && drawn.height <= box.height) break;
      board.style.zoom = String(parseFloat(board.style.zoom) * Math.min(box.width / drawn.width, (box.height - .1) / drawn.height));
    }
    surface.style.backgroundColor = getComputedStyle(board).backgroundColor;
    // Both renderers use BOARD_LAYOUT.thumbnail.splitAfter, after the type row.
    // The left column is shorter across the reference boards in either mode.
    const ends = columns.map(c => c.lastElementChild.getBoundingClientRect().bottom);
    const shorter = 0;
    const origin = surface.getBoundingClientRect(), col = columns[shorter].getBoundingClientRect();
    const patch = surface.querySelector('.thumbnail-patch');
    // Four real CSS pixels of clearance on every edge, outside the zoomed art.
    const width = Math.max(0, col.width - 8), height = Math.max(0, ends[1] - ends[0] - 8);
    Object.assign(patch.style, { left: `${col.left - origin.left + 4}px`, top: `${ends[shorter] - origin.top + 4}px`, width: `${width}px`, height: `${height}px` });
    const option = surface.closest('.board-option');
    const badge = option?.querySelector('.thumbnail-badge');
    // The badge is independent of the drawing's zoom and the swatch fit.
    if (badge) surface.append(badge);
    const strip = patch.querySelector('.thumbnail-swatches');
    const swatches = [...strip.children];
    // A visible chip is always at least 24 by 20 CSS px, never a scaled sliver.
    const count = height >= 20 ? Math.min(swatches.length, Math.floor((width + 4) / 28)) : 0;
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
