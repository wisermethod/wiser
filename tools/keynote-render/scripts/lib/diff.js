/**
 * Diff a markdown SSOT slide list against a live deck inspection.
 *
 * Match primarily by order; title is used as a secondary signal for insert /
 * delete detection when lengths differ. Default policy never deletes: extra
 * deck slides become `keep` ops unless allowDelete is true.
 *
 * Pure logic; no Keynote, no filesystem.
 */

import { normalizeBody, sameBody, sameText } from './markdown.js';

/**
 * @param {object[]} mdSlides slides from parseMarkdownDeck
 * @param {object[]} deckSlides slides from inspectDeck (1-based slideNumber, title, body, notes, layout, ...)
 * @param {{ allowDelete?: boolean }} [options]
 * @returns {{ ops: object[], summary: object }}
 */
export function diffDeck(mdSlides, deckSlides, options = {}) {
  const allowDelete = Boolean(options.allowDelete);
  const ops = [];
  const mdCount = mdSlides.length;
  const deckCount = deckSlides.length;
  const shared = Math.min(mdCount, deckCount);

  for (let i = 0; i < shared; i += 1) {
    const md = mdSlides[i];
    const live = deckSlides[i];
    const slideNumber = i + 1;
    const changes = contentChanges(md, live);
    if (Object.keys(changes).length === 0) {
      ops.push({
        op: 'keep',
        slide: slideNumber,
        title: md.title,
        reason: 'content matches'
      });
    } else {
      ops.push({
        op: 'update',
        slide: slideNumber,
        title: md.title,
        changes,
        // Fields the mutator will apply
        patch: buildPatch(md, changes)
      });
    }
  }

  // Markdown has extra slides → insert after the last shared position, in order.
  if (mdCount > deckCount) {
    for (let i = deckCount; i < mdCount; i += 1) {
      const md = mdSlides[i];
      ops.push({
        op: 'insert',
        after: i, // after slide i (0 = before first when inserting into empty, else after last existing at this point)
        // When applying left-to-right, after = current deck length at insert time.
        // We store the markdown index (0-based) and the intended final position.
        at: i + 1,
        title: md.title,
        layout: md.layout,
        slide: md
      });
    }
  }

  // Deck has extra slides → delete only with allowDelete; otherwise report keep-extra.
  if (deckCount > mdCount) {
    for (let i = mdCount; i < deckCount; i += 1) {
      const live = deckSlides[i];
      const slideNumber = i + 1;
      if (allowDelete) {
        ops.push({
          op: 'delete',
          slide: slideNumber,
          title: live.defaultTitle || live.title || null,
          reason: 'not present in markdown (--allow-delete)'
        });
      } else {
        ops.push({
          op: 'keep-extra',
          slide: slideNumber,
          title: live.defaultTitle || live.title || null,
          reason: 'deck has a slide not in markdown; pass --allow-delete to remove it'
        });
      }
    }
  }

  // Title-mismatch warning on shared positions (order match but different titles)
  for (let i = 0; i < shared; i += 1) {
    const md = mdSlides[i];
    const live = deckSlides[i];
    const liveTitle = live.defaultTitle || live.title || '';
    if (liveTitle && md.title && !sameText(md.title, liveTitle)) {
      const op = ops[i];
      if (op && (op.op === 'update' || op.op === 'keep')) {
        op.titleMismatch = {
          markdown: md.title,
          deck: liveTitle
        };
      }
    }
  }

  const summary = {
    markdownSlides: mdCount,
    deckSlides: deckCount,
    keep: ops.filter((o) => o.op === 'keep').length,
    update: ops.filter((o) => o.op === 'update').length,
    insert: ops.filter((o) => o.op === 'insert').length,
    delete: ops.filter((o) => o.op === 'delete').length,
    keepExtra: ops.filter((o) => o.op === 'keep-extra').length,
    allowDelete
  };

  return { ops, summary };
}

function contentChanges(md, live) {
  const changes = {};
  const liveTitle = live.defaultTitle ?? live.title ?? null;
  const liveBody = live.defaultBody ?? live.body ?? null;
  const liveNotes = live.presenterNotes ?? live.notes ?? null;

  if (md.title !== undefined && !sameText(md.title, liveTitle)) {
    changes.title = { from: liveTitle, to: md.title };
  }
  if (md.body !== undefined && !sameBody(md.body, liveBody)) {
    changes.body = { from: normalizeBody(liveBody), to: normalizeBody(md.body) };
  }
  // Only update notes when markdown supplies them (absent notes in md = leave alone)
  if (md.notes !== undefined && !sameText(md.notes, liveNotes)) {
    changes.notes = { from: liveNotes, to: md.notes };
  }
  if (md.texts) {
    // Semantic / index texts: always propose when present in markdown; the
    // mutator applies by index after brand resolve. Live comparison is best-effort.
    const textDiff = {};
    for (const [key, value] of Object.entries(md.texts)) {
      const liveItem = liveTextForKey(live, key);
      if (liveItem === undefined || !sameText(value, liveItem)) {
        textDiff[key] = { from: liveItem ?? null, to: value };
      }
    }
    if (Object.keys(textDiff).length > 0) changes.texts = textDiff;
  }
  if (md.images && md.images.length > 0) {
    const liveCount = live.imageCount ?? 0;
    changes.images = {
      fromCount: liveCount,
      to: md.images.map((im) => im.path),
      policy: liveCount > 0 ? 'replace-existing-then-add' : 'add'
    };
  }
  return changes;
}

function liveTextForKey(live, key) {
  if (!live) return undefined;
  if (key === 'subtitle' && Array.isArray(live.textItems)) {
    // Heuristic: brand often maps subtitle to index 1 on Title & Bullets.
    const item = live.textItems.find((t) => t.index === 1);
    return item?.text;
  }
  if (/^\d+$/.test(key) && Array.isArray(live.textItems)) {
    const item = live.textItems.find((t) => t.index === Number(key));
    return item?.text;
  }
  return undefined;
}

function buildPatch(md, changes) {
  const patch = {};
  if (changes.title) patch.title = md.title;
  if (changes.body) patch.body = md.body;
  if (changes.notes) patch.notes = md.notes;
  if (changes.texts) {
    patch.texts = {};
    for (const key of Object.keys(changes.texts)) {
      patch.texts[key] = md.texts[key];
    }
  }
  if (changes.images) patch.images = md.images;
  if (md.layout) patch.layout = md.layout;
  return patch;
}

/**
 * Plan insert after-indices for sequential application.
 * Inserts are applied from front to back; each insert shifts subsequent indices.
 * Deletes are applied from back to front so numbers stay stable.
 *
 * @param {object[]} ops from diffDeck
 * @returns {object[]} ops in application order with concrete slide numbers
 */
export function planApplication(ops) {
  const updates = ops.filter((o) => o.op === 'update');
  const inserts = ops.filter((o) => o.op === 'insert');
  const deletes = ops.filter((o) => o.op === 'delete').sort((a, b) => b.slide - a.slide);
  const keeps = ops.filter((o) => o.op === 'keep' || o.op === 'keep-extra');

  // Application order: updates on existing slides first (stable numbers), then
  // inserts from low at to high (each after the previous insert's new slide),
  // then deletes high to low.
  const ordered = [];
  for (const u of updates) ordered.push({ ...u });

  // Inserts: first insert goes after current deck's last shared slide.
  // diff stores `after` as the 0-based count of deck slides before this insert
  // in the original deck (deckCount for the first extra). As we insert, after
  // for the next is the previous insert's new position.
  let lastAfter = null;
  for (const ins of inserts) {
    const after = lastAfter === null ? ins.after : lastAfter;
    ordered.push({ ...ins, after });
    lastAfter = after + 1;
  }

  for (const d of deletes) ordered.push({ ...d });

  return { apply: ordered, report: [...keeps, ...updates, ...inserts, ...ops.filter((o) => o.op === 'delete')] };
}
