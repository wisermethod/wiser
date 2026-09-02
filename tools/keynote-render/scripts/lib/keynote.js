/**
 * Keynote operations, one JXA body each. Three behaviors of Keynote's
 * scripting interface shape the code here and are not obvious from the API:
 *
 * - Master slides cannot be read or assigned reliably through JXA (it answers
 *   -1700), so anything touching a master goes through NSAppleScript instead.
 * - Some masters hide the default title or body. A write into a hidden
 *   placeholder succeeds silently and shows nothing, so every write reports
 *   whether the placeholder took the text and whether it is visible; the
 *   visible boxes on such a master are anonymous text items reached by index.
 * - An image's position is ignored at insertion and must be assigned after the
 *   image is on the slide, as an object rather than as creation properties.
 */

import { runJXA } from './jxa.js';

/** Every installed theme name, built in and custom alike. */
export function listThemes() {
  return runJXA(`
    const app = Application("Keynote");
    return JSON.stringify(app.themes.name());
  `);
}

/** Master layout names for one theme, read from a temporary document. */
export function listLayouts(theme) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");

    const doc = app.Document({ documentTheme: app.themes[params.theme] });
    app.documents.push(doc);
    const docName = doc.name().replace(/"/g, '\\\\"');

    const script = $.NSAppleScript.alloc.initWithSource(
      'tell application "Keynote" to tell document "' + docName + '" to return name of every master slide'
    );
    const errDict = Ref();
    const result = script.executeAndReturnError(errDict);
    doc.close({ saving: "no" });
    if (!result) throw new Error("Could not read master slides of theme " + params.theme);

    const names = [];
    for (let i = 1; i <= result.numberOfItems; i++) {
      names.push(result.descriptorAtIndex(i).stringValue.js);
    }
    return JSON.stringify(names);
  `, { theme }, { timeout: 60_000 });
}

/**
 * Build one deck and save it. Slides arrive resolved: layout names are master
 * names, texts keys are indices, image paths are absolute.
 *
 * Each slide reports titleSet and bodySet as true (written and visible),
 * "hidden" (written into a placeholder this master hides), false (no such
 * placeholder), or null (nothing asked for), and textsSet as a map from each
 * requested index to whether an item existed there. The caller turns those
 * into warnings; nothing is dropped silently.
 */
export function buildDeck(theme, slides, outputPath) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");

    // Saving over a file Keynote still holds open fails, so release it first.
    for (let i = app.documents.length - 1; i >= 0; i--) {
      try {
        const f = app.documents[i].file();
        if (f && f.toString() === params.outputPath) app.documents[i].close({ saving: "no" });
      } catch (e) {}
    }

    const doc = app.Document({ documentTheme: app.themes[params.theme] });
    app.documents.push(doc);
    const docName = doc.name().replace(/"/g, '\\\\"');

    function addSlideWithLayout(layout, slideNumber) {
      const escaped = layout.replace(/"/g, '\\\\"');
      const script = $.NSAppleScript.alloc.initWithSource(
        'tell application "Keynote" to tell document "' + docName +
        '" to make new slide with properties {base slide:master slide "' + escaped + '"}'
      );
      const errDict = Ref();
      if (!script.executeAndReturnError(errDict)) {
        const info = ObjC.deepUnwrap(errDict[0]);
        throw new Error("Slide " + slideNumber + ", layout \\"" + layout + "\\": " +
          (info.NSAppleScriptErrorBriefMessage || "no master by that name in this theme"));
      }
    }

    const results = [];
    for (let i = 0; i < params.slides.length; i++) {
      const s = params.slides[i];

      // A new document opens with one slide already on the theme's default
      // master. The first spec slide reuses it, unless it names a layout, in
      // which case the layouted slide is created and the default removed.
      if (i === 0) {
        if (s.layout) {
          addSlideWithLayout(s.layout, 1);
          app.delete(doc.slides[0]);
        }
      } else if (s.layout) {
        addSlideWithLayout(s.layout, i + 1);
      } else {
        doc.slides.push(app.Slide({}));
      }

      const slide = doc.slides[doc.slides.length - 1];

      let titleSet = null;
      if (s.title !== undefined) {
        titleSet = false;
        try {
          slide.defaultTitleItem().objectText = s.title;
          titleSet = slide.titleShowing() ? true : "hidden";
        } catch (e) {}
      }

      let bodySet = null;
      if (s.body !== undefined) {
        bodySet = false;
        try {
          slide.defaultBodyItem().objectText = s.body;
          bodySet = slide.bodyShowing() ? true : "hidden";
        } catch (e) {}
      }

      let textsSet = null;
      if (s.texts !== undefined) {
        textsSet = {};
        for (const idx of Object.keys(s.texts)) {
          textsSet[idx] = false;
          try {
            slide.textItems[Number(idx)].objectText = s.texts[idx];
            textsSet[idx] = true;
          } catch (e) {}
        }
      }

      if (s.notes !== undefined) slide.presenterNotes = s.notes;

      for (const im of (s.images || [])) {
        const props = { file: Path(im.path) };
        if (im.width !== null) props.width = im.width;
        if (im.height !== null) props.height = im.height;
        const image = app.Image(props);
        slide.images.push(image);
        if (im.x !== null) image.position = { x: im.x, y: im.y || 0 };
      }

      results.push({ slideNumber: i + 1, layout: s.layout || null, titleSet, bodySet, textsSet });
    }

    // Save, then reopen from the saved path to read back what landed on disk,
    // and close again so no document is left open in the user's Keynote.
    doc.save({ in: Path(params.outputPath) });
    doc.close({ saving: "no" });
    const saved = app.open(Path(params.outputPath));
    const name = saved.name();
    const slideCount = saved.slides.length;
    saved.close({ saving: "no" });

    return JSON.stringify({ name, slideCount, slides: results });
  `, { theme, slides, outputPath }, { timeout: 180_000 });
}

/**
 * Everything addressable on one slide of a saved deck: its master, placeholder
 * visibility and content, presenter notes, and every text item with its index.
 * This is how a brand's text indices are discovered rather than guessed, and
 * the only way to verify presenter notes, which no slide image shows.
 */
export function inspectSlide(deckPath, slideNumber) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");

    const doc = app.open(Path(params.deckPath));
    if (params.slideNumber < 1 || params.slideNumber > doc.slides.length) {
      const count = doc.slides.length;
      doc.close({ saving: "no" });
      throw new Error("Slide " + params.slideNumber + " is out of range; this deck has " + count + " slides");
    }
    const slide = doc.slides[params.slideNumber - 1];

    const out = {
      slideNumber: params.slideNumber,
      slideCount: doc.slides.length,
      titleShowing: slide.titleShowing(),
      bodyShowing: slide.bodyShowing(),
      layout: null
    };

    const docName = doc.name().replace(/"/g, '\\\\"');
    const script = $.NSAppleScript.alloc.initWithSource(
      'tell application "Keynote" to tell document "' + docName +
      '" to return name of base slide of slide ' + params.slideNumber
    );
    const errDict = Ref();
    const result = script.executeAndReturnError(errDict);
    if (result) out.layout = result.stringValue.js;

    try { out.defaultTitle = slide.defaultTitleItem().objectText(); } catch (e) { out.defaultTitle = null; }
    try { out.defaultBody = slide.defaultBodyItem().objectText(); } catch (e) { out.defaultBody = null; }
    try { out.presenterNotes = slide.presenterNotes(); } catch (e) { out.presenterNotes = null; }

    out.textItems = [];
    const items = slide.textItems();
    for (let i = 0; i < items.length; i++) {
      const item = { index: i };
      try { item.text = items[i].objectText(); } catch (e) { item.text = null; }
      try { item.position = items[i].position(); } catch (e) {}
      try { item.width = items[i].width(); item.height = items[i].height(); } catch (e) {}
      out.textItems.push(item);
    }
    try { out.imageCount = slide.images.length; } catch (e) { out.imageCount = null; }
    try { out.shapeCount = slide.shapes.length; } catch (e) { out.shapeCount = null; }

    doc.close({ saving: "no" });
    return JSON.stringify(out);
  `, { deckPath, slideNumber }, { timeout: 60_000 });
}

/** Write one image per slide into outDir, which Keynote creates. */
export function snapshotDeck(deckPath, outDir) {
  return runJXA(`
    const app = Application("Keynote");
    const doc = app.open(Path(params.deckPath));
    app.export(doc, { to: Path(params.outDir), as: "slide images" });
    const slideCount = doc.slides.length;
    doc.close({ saving: "no" });
    return JSON.stringify({ slideCount, outDir: params.outDir });
  `, { deckPath, outDir }, { timeout: 180_000 });
}

/** Export a saved deck in one of Keynote's own export formats. */
export function exportDeck(deckPath, format, outPath) {
  return runJXA(`
    const app = Application("Keynote");
    const doc = app.open(Path(params.deckPath));
    app.export(doc, { to: Path(params.outPath), as: params.format });
    doc.close({ saving: "no" });
    return JSON.stringify({ exported: true, outPath: params.outPath });
  `, { deckPath, format, outPath }, { timeout: 300_000 });
}

/**
 * Shared JXA preamble: find a document already open at deckPath, or open it.
 * Returns whether the document was already open so the caller can leave it open.
 * (Closing a user's open deck without saving would discard their unsaved work;
 * closing one we opened ourselves keeps Keynote tidy.)
 */
const OPEN_DECK_HELPER = `
    function openDeck(app, deckPath) {
      for (let i = 0; i < app.documents.length; i++) {
        try {
          const f = app.documents[i].file();
          if (f && f.toString() === deckPath) {
            return { doc: app.documents[i], alreadyOpen: true };
          }
        } catch (e) {}
      }
      return { doc: app.open(Path(deckPath)), alreadyOpen: false };
    }

    function closeIfNeeded(doc, alreadyOpen) {
      if (!alreadyOpen) {
        try { doc.close({ saving: "no" }); } catch (e) {}
      }
    }

    function masterNameOf(doc, slideNumber) {
      const docName = doc.name().replace(/"/g, '\\\\"');
      const script = $.NSAppleScript.alloc.initWithSource(
        'tell application "Keynote" to tell document "' + docName +
        '" to return name of base slide of slide ' + slideNumber
      );
      const errDict = Ref();
      const result = script.executeAndReturnError(errDict);
      return result ? result.stringValue.js : null;
    }

    function setMaster(doc, slideNumber, layout) {
      const docName = doc.name().replace(/"/g, '\\\\"');
      const escaped = layout.replace(/"/g, '\\\\"');
      const script = $.NSAppleScript.alloc.initWithSource(
        'tell application "Keynote" to tell document "' + docName +
        '" to set base slide of slide ' + slideNumber + ' to master slide "' + escaped + '"'
      );
      const errDict = Ref();
      if (!script.executeAndReturnError(errDict)) {
        const info = ObjC.deepUnwrap(errDict[0]);
        throw new Error("layout \\"" + layout + "\\": " +
          (info.NSAppleScriptErrorBriefMessage || "no master by that name in this theme"));
      }
    }

    function writePlaceholders(slide, s) {
      let titleSet = null;
      if (s.title !== undefined && s.title !== null) {
        titleSet = false;
        try {
          slide.defaultTitleItem().objectText = s.title;
          titleSet = slide.titleShowing() ? true : "hidden";
        } catch (e) {}
      }

      let bodySet = null;
      if (s.body !== undefined && s.body !== null) {
        bodySet = false;
        try {
          slide.defaultBodyItem().objectText = s.body;
          bodySet = slide.bodyShowing() ? true : "hidden";
        } catch (e) {}
      }

      let textsSet = null;
      if (s.texts !== undefined && s.texts !== null) {
        textsSet = {};
        for (const idx of Object.keys(s.texts)) {
          textsSet[idx] = false;
          try {
            slide.textItems[Number(idx)].objectText = s.texts[idx];
            textsSet[idx] = true;
          } catch (e) {}
        }
      }

      if (s.notes !== undefined && s.notes !== null) {
        try { slide.presenterNotes = s.notes; } catch (e) {}
      }

      return { titleSet, bodySet, textsSet };
    }

    function addImages(app, slide, images, replaceExisting) {
      if (!images || images.length === 0) return { imageCount: null, replaced: false };
      if (replaceExisting) {
        try {
          const existing = slide.images();
          for (let i = existing.length - 1; i >= 0; i--) {
            try { app.delete(existing[i]); } catch (e) {}
          }
        } catch (e) {}
      }
      for (const im of images) {
        const props = { file: Path(im.path) };
        if (im.width !== null && im.width !== undefined) props.width = im.width;
        if (im.height !== null && im.height !== undefined) props.height = im.height;
        const image = app.Image(props);
        slide.images.push(image);
        if (im.x !== null && im.x !== undefined) image.position = { x: im.x, y: im.y || 0 };
      }
      let imageCount = null;
      try { imageCount = slide.images.length; } catch (e) {}
      return { imageCount, replaced: Boolean(replaceExisting) };
    }
`;

/**
 * Inspect every slide of a saved deck in one open/close cycle.
 * Each entry mirrors inspectSlide fields plus slideNumber.
 */
export function inspectDeck(deckPath) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");
    ${OPEN_DECK_HELPER}

    const opened = openDeck(app, params.deckPath);
    const doc = opened.doc;
    const count = doc.slides.length;
    const slides = [];

    for (let n = 1; n <= count; n++) {
      const slide = doc.slides[n - 1];
      const out = {
        slideNumber: n,
        titleShowing: null,
        bodyShowing: null,
        layout: null,
        defaultTitle: null,
        defaultBody: null,
        presenterNotes: null,
        textItems: [],
        imageCount: null,
        shapeCount: null
      };
      try { out.titleShowing = slide.titleShowing(); } catch (e) {}
      try { out.bodyShowing = slide.bodyShowing(); } catch (e) {}
      out.layout = masterNameOf(doc, n);
      try { out.defaultTitle = slide.defaultTitleItem().objectText(); } catch (e) { out.defaultTitle = null; }
      try { out.defaultBody = slide.defaultBodyItem().objectText(); } catch (e) { out.defaultBody = null; }
      try { out.presenterNotes = slide.presenterNotes(); } catch (e) { out.presenterNotes = null; }
      try {
        const items = slide.textItems();
        for (let i = 0; i < items.length; i++) {
          const item = { index: i };
          try { item.text = items[i].objectText(); } catch (e) { item.text = null; }
          try { item.position = items[i].position(); } catch (e) {}
          try { item.width = items[i].width(); item.height = items[i].height(); } catch (e) {}
          out.textItems.push(item);
        }
      } catch (e) {}
      try { out.imageCount = slide.images.length; } catch (e) {}
      try { out.shapeCount = slide.shapes.length; } catch (e) {}
      slides.push(out);
    }

    closeIfNeeded(doc, opened.alreadyOpen);
    return JSON.stringify({ slideCount: count, slides });
  `, { deckPath }, { timeout: 180_000 });
}

/**
 * Update one existing slide in place. Does not change the master unless
 * `layout` is supplied. Preserves custom shapes and manual placement of
 * everything not written.
 *
 * `slide` fields: title, body, notes, texts (index→string), images[],
 * replaceImages (bool), layout (optional master name).
 */
export function updateSlide(deckPath, slideNumber, slide) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");
    ${OPEN_DECK_HELPER}

    const opened = openDeck(app, params.deckPath);
    const doc = opened.doc;
    if (params.slideNumber < 1 || params.slideNumber > doc.slides.length) {
      const count = doc.slides.length;
      closeIfNeeded(doc, opened.alreadyOpen);
      throw new Error("Slide " + params.slideNumber + " is out of range; this deck has " + count + " slides");
    }

    if (params.slide.layout) {
      setMaster(doc, params.slideNumber, params.slide.layout);
    }

    const target = doc.slides[params.slideNumber - 1];
    const written = writePlaceholders(target, params.slide);
    const imageResult = addImages(
      app,
      target,
      params.slide.images || [],
      Boolean(params.slide.replaceImages)
    );

    doc.save();
    const slideCount = doc.slides.length;
    const layout = masterNameOf(doc, params.slideNumber);
    closeIfNeeded(doc, opened.alreadyOpen);

    return JSON.stringify({
      slideNumber: params.slideNumber,
      slideCount,
      layout,
      titleSet: written.titleSet,
      bodySet: written.bodySet,
      textsSet: written.textsSet,
      imageCount: imageResult.imageCount,
      imagesReplaced: imageResult.replaced
    });
  `, { deckPath, slideNumber, slide }, { timeout: 120_000 });
}

/**
 * Insert a slide after index `after` (0 = before the first slide; omit or
 * after >= count appends). Content fields match build/update.
 */
export function insertSlide(deckPath, after, slide) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");
    ${OPEN_DECK_HELPER}

    const opened = openDeck(app, params.deckPath);
    const doc = opened.doc;
    const beforeCount = doc.slides.length;
    const after = params.after;
    if (after < 0 || after > beforeCount) {
      closeIfNeeded(doc, opened.alreadyOpen);
      throw new Error("--after must be from 0 (before first) through " + beforeCount + " (append); got " + after);
    }

    const docName = doc.name().replace(/"/g, '\\\\"');
    let newIndex; // 1-based position of the new slide after insert

    if (params.slide.layout) {
      const escaped = params.slide.layout.replace(/"/g, '\\\\"');
      let source;
      if (after === 0) {
        source = 'tell application "Keynote" to tell document "' + docName +
          '" to make new slide at before slide 1 with properties {base slide:master slide "' + escaped + '"}';
        newIndex = 1;
      } else if (after >= beforeCount) {
        source = 'tell application "Keynote" to tell document "' + docName +
          '" to make new slide with properties {base slide:master slide "' + escaped + '"}';
        newIndex = beforeCount + 1;
      } else {
        source = 'tell application "Keynote" to tell document "' + docName +
          '" to make new slide at after slide ' + after +
          ' with properties {base slide:master slide "' + escaped + '"}';
        newIndex = after + 1;
      }
      const script = $.NSAppleScript.alloc.initWithSource(source);
      const errDict = Ref();
      if (!script.executeAndReturnError(errDict)) {
        const info = ObjC.deepUnwrap(errDict[0]);
        closeIfNeeded(doc, opened.alreadyOpen);
        throw new Error("insert layout \\"" + params.slide.layout + "\\": " +
          (info.NSAppleScriptErrorBriefMessage || "no master by that name in this theme"));
      }
    } else {
      // Default master: push a plain slide, then move it into place if needed.
      doc.slides.push(app.Slide({}));
      newIndex = doc.slides.length;
      if (after < beforeCount) {
        // Move the new last slide into place via AppleScript.
        const moveSource = 'tell application "Keynote" to tell document "' + docName +
          '" to move slide ' + newIndex + ' to after slide ' + Math.max(after, 1);
        // When after is 0, move to beginning:
        const moveToFront = after === 0
          ? 'tell application "Keynote" to tell document "' + docName +
            '" to move slide ' + newIndex + ' to before slide 1'
          : moveSource;
        const moveScript = $.NSAppleScript.alloc.initWithSource(after === 0 ? moveToFront : moveSource);
        const moveErr = Ref();
        if (!moveScript.executeAndReturnError(moveErr)) {
          // Leave at end rather than fail the whole insert; report the fallback.
          newIndex = doc.slides.length;
        } else {
          newIndex = after === 0 ? 1 : after + 1;
        }
      }
    }

    const target = doc.slides[newIndex - 1];
    const written = writePlaceholders(target, params.slide);
    const imageResult = addImages(app, target, params.slide.images || [], false);

    doc.save();
    const slideCount = doc.slides.length;
    const layout = masterNameOf(doc, newIndex);
    closeIfNeeded(doc, opened.alreadyOpen);

    return JSON.stringify({
      slideNumber: newIndex,
      slideCount,
      layout,
      titleSet: written.titleSet,
      bodySet: written.bodySet,
      textsSet: written.textsSet,
      imageCount: imageResult.imageCount,
      insertedAfter: after
    });
  `, { deckPath, after, slide }, { timeout: 120_000 });
}

/**
 * Delete slide N (1-based). Remaining slides renumber. Refuses to delete the
 * last remaining slide (Keynote documents need at least one).
 */
export function deleteSlide(deckPath, slideNumber) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");
    ${OPEN_DECK_HELPER}

    const opened = openDeck(app, params.deckPath);
    const doc = opened.doc;
    const beforeCount = doc.slides.length;
    if (params.slideNumber < 1 || params.slideNumber > beforeCount) {
      closeIfNeeded(doc, opened.alreadyOpen);
      throw new Error("Slide " + params.slideNumber + " is out of range; this deck has " + beforeCount + " slides");
    }
    if (beforeCount <= 1) {
      closeIfNeeded(doc, opened.alreadyOpen);
      throw new Error("Cannot delete the only slide in the deck; Keynote requires at least one slide");
    }

    app.delete(doc.slides[params.slideNumber - 1]);
    doc.save();
    const slideCount = doc.slides.length;
    closeIfNeeded(doc, opened.alreadyOpen);

    return JSON.stringify({
      deleted: params.slideNumber,
      slideCount,
      renumbered: true
    });
  `, { deckPath, slideNumber }, { timeout: 60_000 });
}

/**
 * Attempt to move slide `from` to after position `after` (0 = to front).
 * Returns { moved: true, ... } on success. On failure returns { moved: false,
 * reason } without mutating — callers that need reorder should fall back to
 * content-preserving delete+insert only when they accept that custom shapes
 * on that slide will not survive.
 */
export function moveSlide(deckPath, from, after) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");
    ${OPEN_DECK_HELPER}

    const opened = openDeck(app, params.deckPath);
    const doc = opened.doc;
    const count = doc.slides.length;
    if (params.from < 1 || params.from > count) {
      closeIfNeeded(doc, opened.alreadyOpen);
      throw new Error("Slide " + params.from + " is out of range; this deck has " + count + " slides");
    }
    if (params.after < 0 || params.after > count) {
      closeIfNeeded(doc, opened.alreadyOpen);
      throw new Error("--after must be from 0 through " + count);
    }
    // No-op when already in place
    if (params.after === params.from || params.after === params.from - 1) {
      closeIfNeeded(doc, opened.alreadyOpen);
      return JSON.stringify({ moved: true, from: params.from, after: params.after, slideCount: count, noop: true });
    }

    const docName = doc.name().replace(/"/g, '\\\\"');
    let source;
    if (params.after === 0) {
      source = 'tell application "Keynote" to tell document "' + docName +
        '" to move slide ' + params.from + ' to before slide 1';
    } else {
      source = 'tell application "Keynote" to tell document "' + docName +
        '" to move slide ' + params.from + ' to after slide ' + params.after;
    }
    const script = $.NSAppleScript.alloc.initWithSource(source);
    const errDict = Ref();
    if (!script.executeAndReturnError(errDict)) {
      const info = ObjC.deepUnwrap(errDict[0]);
      closeIfNeeded(doc, opened.alreadyOpen);
      return JSON.stringify({
        moved: false,
        from: params.from,
        after: params.after,
        reason: info.NSAppleScriptErrorBriefMessage || "Keynote refused the move",
        fallback: "delete+insert (custom shapes on that slide will not survive)"
      });
    }

    doc.save();
    const slideCount = doc.slides.length;
    closeIfNeeded(doc, opened.alreadyOpen);
    return JSON.stringify({
      moved: true,
      from: params.from,
      after: params.after,
      slideCount,
      noop: false
    });
  `, { deckPath, from, after }, { timeout: 60_000 });
}

/**
 * Apply a batch of mutator ops to one open document (one save at the end).
 * ops: array of
 *   { op: 'update', slide, slideData }
 *   { op: 'insert', after, slideData }
 *   { op: 'delete', slide }
 * Updates run first (stable numbers), then inserts low→high, then deletes high→low
 * when the caller has already ordered them; this function applies in array order.
 */
export function applyOps(deckPath, ops) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");
    ${OPEN_DECK_HELPER}

    const opened = openDeck(app, params.deckPath);
    const doc = opened.doc;
    const results = [];

    function insertAt(after, slideData) {
      const beforeCount = doc.slides.length;
      const docName = doc.name().replace(/"/g, '\\\\"');
      let newIndex;
      if (slideData.layout) {
        const escaped = slideData.layout.replace(/"/g, '\\\\"');
        let source;
        if (after === 0) {
          source = 'tell application "Keynote" to tell document "' + docName +
            '" to make new slide at before slide 1 with properties {base slide:master slide "' + escaped + '"}';
          newIndex = 1;
        } else if (after >= beforeCount) {
          source = 'tell application "Keynote" to tell document "' + docName +
            '" to make new slide with properties {base slide:master slide "' + escaped + '"}';
          newIndex = beforeCount + 1;
        } else {
          source = 'tell application "Keynote" to tell document "' + docName +
            '" to make new slide at after slide ' + after +
            ' with properties {base slide:master slide "' + escaped + '"}';
          newIndex = after + 1;
        }
        const script = $.NSAppleScript.alloc.initWithSource(source);
        const errDict = Ref();
        if (!script.executeAndReturnError(errDict)) {
          const info = ObjC.deepUnwrap(errDict[0]);
          throw new Error("insert layout \\"" + slideData.layout + "\\": " +
            (info.NSAppleScriptErrorBriefMessage || "no master by that name"));
        }
      } else {
        doc.slides.push(app.Slide({}));
        newIndex = doc.slides.length;
        if (after < beforeCount) {
          const moveSource = after === 0
            ? 'tell application "Keynote" to tell document "' + docName +
              '" to move slide ' + newIndex + ' to before slide 1'
            : 'tell application "Keynote" to tell document "' + docName +
              '" to move slide ' + newIndex + ' to after slide ' + after;
          const moveScript = $.NSAppleScript.alloc.initWithSource(moveSource);
          const moveErr = Ref();
          if (moveScript.executeAndReturnError(moveErr)) {
            newIndex = after === 0 ? 1 : after + 1;
          }
        }
      }
      const target = doc.slides[newIndex - 1];
      const written = writePlaceholders(target, slideData);
      const imageResult = addImages(app, target, slideData.images || [], false);
      return {
        op: "insert",
        slideNumber: newIndex,
        layout: masterNameOf(doc, newIndex),
        titleSet: written.titleSet,
        bodySet: written.bodySet,
        textsSet: written.textsSet,
        imageCount: imageResult.imageCount
      };
    }

    for (let i = 0; i < params.ops.length; i++) {
      const op = params.ops[i];
      if (op.op === "update") {
        if (op.slide < 1 || op.slide > doc.slides.length) {
          throw new Error("update slide " + op.slide + " out of range (" + doc.slides.length + " slides)");
        }
        if (op.slideData && op.slideData.layout) {
          setMaster(doc, op.slide, op.slideData.layout);
        }
        const target = doc.slides[op.slide - 1];
        const written = writePlaceholders(target, op.slideData || {});
        const imageResult = addImages(
          app, target,
          (op.slideData && op.slideData.images) || [],
          Boolean(op.slideData && op.slideData.replaceImages)
        );
        results.push({
          op: "update",
          slideNumber: op.slide,
          layout: masterNameOf(doc, op.slide),
          titleSet: written.titleSet,
          bodySet: written.bodySet,
          textsSet: written.textsSet,
          imageCount: imageResult.imageCount,
          imagesReplaced: imageResult.replaced
        });
      } else if (op.op === "insert") {
        results.push(insertAt(op.after, op.slideData || {}));
      } else if (op.op === "delete") {
        if (op.slide < 1 || op.slide > doc.slides.length) {
          throw new Error("delete slide " + op.slide + " out of range (" + doc.slides.length + " slides)");
        }
        if (doc.slides.length <= 1) {
          throw new Error("Cannot delete the only slide in the deck");
        }
        app.delete(doc.slides[op.slide - 1]);
        results.push({ op: "delete", deleted: op.slide, slideCount: doc.slides.length });
      } else {
        throw new Error("unknown op: " + op.op);
      }
    }

    doc.save();
    const slideCount = doc.slides.length;
    closeIfNeeded(doc, opened.alreadyOpen);
    return JSON.stringify({ slideCount, applied: results });
  `, { deckPath, ops }, { timeout: 300_000 });
}
