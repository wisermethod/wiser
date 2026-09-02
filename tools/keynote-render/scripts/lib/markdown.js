/**
 * Markdown deck SSOT parser for keynote-render.
 *
 * Canonical form is documented in deck-markdown.md / TOOL.md. This module also
 * accepts the numbered-slide course shape (`## Slide N. Title`, `On slide:`,
 * `Presenter notes:`) so a course deck works without a permanent one-off parser.
 *
 * Node built-ins only. Returns slide objects ready for resolveDeck / mutators:
 * { title, body, notes, layout, texts, images, sourceIndex }.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * Parse a markdown deck file into ordered slide records.
 *
 * @param {string} file absolute path to the markdown file
 * @returns {{ slides: object[], meta: { title: string|null, path: string } }}
 */
export function parseMarkdownDeck(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`cannot read markdown at ${file}: ${error.message}`);
  }

  const baseDir = dirname(file);
  const lines = text.split(/\r?\n/);
  const deckTitle = extractDeckTitle(lines);
  const sections = splitSlideSections(lines);

  if (sections.length === 0) {
    throw new Error(
      `${file} has no slides. Expected sections headed "## Slide N. Title" or "## Title" with a following "On slide:" block. See TOOL.md § Markdown deck format.`
    );
  }

  const slides = sections.map((section, i) => parseSection(section, i + 1, baseDir, file));
  return { slides, meta: { title: deckTitle, path: file } };
}

function extractDeckTitle(lines) {
  for (const line of lines) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m && !/^#\s*Slide\b/i.test(line)) {
      // Drop a trailing ":" subtitle pattern like "# Course Name: ..."
      return m[1].replace(/\s*:.*/, '').trim() || m[1].trim();
    }
    // Stop once we hit a slide heading so a late H1 is not the deck title.
    if (/^##\s+/.test(line)) break;
  }
  return null;
}

/**
 * Split the file into per-slide blocks starting at each ## heading that looks
 * like a slide. Accepts:
 *   ## Slide 1. Title
 *   ## Slide 1: Title
 *   ## Title   (when followed by On slide: / Presenter notes: / layout:)
 */
function splitSlideSections(lines) {
  const starts = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (isSlideHeading(lines[i])) starts.push(i);
  }
  if (starts.length === 0) return [];

  const sections = [];
  for (let s = 0; s < starts.length; s += 1) {
    const from = starts[s];
    const to = s + 1 < starts.length ? starts[s + 1] : lines.length;
    sections.push({ heading: lines[from], lines: lines.slice(from + 1, to), sourceLine: from + 1 });
  }
  return sections;
}

function isSlideHeading(line) {
  if (!/^##\s+/.test(line)) return false;
  // Explicit "Slide N" form
  if (/^##\s+Slide\s+\d+/i.test(line)) return true;
  // Bare ## Title is a slide only when it is not a sub-document heading we
  // already treat specially; sub-headings inside a slide use ### or bold labels.
  // Reject known non-slide H2 patterns from front matter docs.
  if (/^##\s+(Context|Inputs|Usage|Dependencies|Success|Troubleshooting|Output|Quick Start|Deck spec|Brand file|Script Contract|Markdown|Archive|Diff|Workstream)\b/i.test(line)) {
    return false;
  }
  return true;
}

function parseSection(section, fallbackNumber, baseDir, file) {
  const headingTitle = titleFromHeading(section.heading);
  const body = section.lines;

  // Optional front-matter-like keys at the top of the section:
  // layout: bullets
  // image: path.png
  // texts.subtitle: ...
  const meta = {};
  const texts = {};
  let contentStart = 0;
  for (let i = 0; i < body.length; i += 1) {
    const line = body[i];
    const layoutMatch = line.match(/^layout:\s*(.+?)\s*$/i);
    if (layoutMatch) { meta.layout = layoutMatch[1].trim(); contentStart = i + 1; continue; }
    const imageMatch = line.match(/^image:\s*(.+?)\s*$/i);
    if (imageMatch) {
      meta.images = meta.images || [];
      meta.images.push(imageMatch[1].trim());
      contentStart = i + 1;
      continue;
    }
    const textKeyMatch = line.match(/^texts\.(\w+):\s*(.+?)\s*$/i);
    if (textKeyMatch) {
      texts[textKeyMatch[1]] = textKeyMatch[2];
      contentStart = i + 1;
      continue;
    }
    // Stop meta scan at the first non-blank, non-meta line.
    if (line.trim() === '') { contentStart = i + 1; continue; }
    if (/^\*\*Purpose:/i.test(line)) { contentStart = i + 1; continue; }
    break;
  }

  const rest = body.slice(contentStart);
  const blocks = splitNamedBlocks(rest);

  // Course shape and canonical alike: "On slide:" (or "On-slide:") body, "Presenter notes:" notes.
  let onSlideLines = blocks.onSlide;
  let notesLines = blocks.notes;
  let visualPaths = blocks.visuals;

  // If no named "On slide:" block, treat remaining non-meta prose as on-slide
  // until "Presenter notes:" (already split) or end.
  if (onSlideLines === null) {
    onSlideLines = blocks.default;
  }
  if (notesLines === null) notesLines = [];

  // Visual full-slide lines like **Visual (full slide):** `path`
  if (visualPaths.length > 0) {
    meta.images = [...(meta.images || []), ...visualPaths];
  }

  // Also pick up **Layout:** bullets style
  for (const line of rest) {
    const layoutBold = line.match(/^\*\*Layout:\*\*\s*(.+?)\s*$/i);
    if (layoutBold) meta.layout = layoutBold[1].trim();
  }

  const parsed = bodyFromOnSlide(onSlideLines, headingTitle);
  const notes = notesLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Resolve images against the markdown file directory; missing paths are kept
  // as declared so the mutator / resolve step can refuse with a clear error.
  const images = (meta.images || []).map((p) => {
    const cleaned = p.replace(/^`|`$/g, '').trim();
    const abs = isAbsolute(cleaned) ? cleaned : resolve(join(baseDir, cleaned));
    return { path: abs, declared: cleaned };
  });

  // Lead-in ending in colon → subtitle semantic when present and no explicit texts.subtitle
  if (parsed.subtitle && texts.subtitle === undefined) {
    texts.subtitle = parsed.subtitle;
  }

  const slide = {
    title: parsed.title || headingTitle || `Slide ${fallbackNumber}`,
    body: parsed.body,
    notes: notes || undefined,
    layout: meta.layout,
    texts: Object.keys(texts).length > 0 ? texts : undefined,
    images: images.length > 0 ? images.map(({ path }) => ({ path })) : [],
    sourceIndex: fallbackNumber,
    sourceLine: section.sourceLine,
    sourceFile: file
  };

  // Drop empty body rather than forcing ""
  if (slide.body === '' || slide.body === undefined) delete slide.body;
  if (!slide.notes) delete slide.notes;
  if (!slide.layout) delete slide.layout;
  if (!slide.texts) delete slide.texts;

  return slide;
}

function titleFromHeading(heading) {
  // ## Slide 1. Title  |  ## Slide 1: Title  |  ## Title
  const slideForm = heading.match(/^##\s+Slide\s+\d+\s*[.:]\s*(.+?)\s*$/i);
  if (slideForm) return slideForm[1].trim();
  const bare = heading.match(/^##\s+(.+?)\s*$/);
  return bare ? bare[1].trim() : '';
}

/**
 * Partition section lines into named blocks.
 * Recognizes:
 *   On slide: / On-slide:
 *   Presenter notes: / Notes:
 *   **Visual ...:** path  (inline, not a block)
 */
function splitNamedBlocks(lines) {
  let mode = 'default';
  const defaultLines = [];
  const onSlide = [];
  const notes = [];
  const visuals = [];
  let sawOnSlide = false;
  let sawNotes = false;

  for (const raw of lines) {
    const line = raw;

    // Visual as a labeled line, as the course shape writes it
    const visualMatch = line.match(
      /^\*\*Visual(?:\s*\([^)]*\))?:\*\*\s*(.+?)\s*$/i
    ) || line.match(/^visual:\s*(.+?)\s*$/i);
    if (visualMatch) {
      visuals.push(visualMatch[1].trim());
      continue;
    }

    // On-slide label lines that are not body content
    if (/^\*\*On-slide label/i.test(line)) {
      mode = 'onSlide';
      sawOnSlide = true;
      continue;
    }

    if (/^On[\s-]?slide:\s*$/i.test(line) || /^On[\s-]?slide:\s+/i.test(line)) {
      mode = 'onSlide';
      sawOnSlide = true;
      const after = line.replace(/^On[\s-]?slide:\s*/i, '');
      if (after.trim()) onSlide.push(after);
      continue;
    }

    if (/^Presenter notes:\s*$/i.test(line) || /^Notes:\s*$/i.test(line)) {
      mode = 'notes';
      sawNotes = true;
      continue;
    }

    // Purpose / other meta prose: skip when still in default before On slide
    if (mode === 'default' && /^\*\*Purpose:/i.test(line)) continue;

    if (mode === 'onSlide') onSlide.push(line);
    else if (mode === 'notes') notes.push(line);
    else defaultLines.push(line);
  }

  return {
    default: defaultLines,
    onSlide: sawOnSlide ? onSlide : null,
    notes: sawNotes ? notes : null,
    visuals
  };
}

/**
 * Turn on-slide lines into title / subtitle / body.
 *
 * Rules (aligned with the course shape's rendering conventions):
 * - If the first non-empty line equals the heading title (or is a short single
 *   line before a list), treat it as the title already captured from the heading.
 * - A lead-in line ending in ":" that is not a list item becomes texts.subtitle.
 * - Bullet / numbered lines become body lines (array joined by newline for Keynote).
 * - Non-list prose lines join the body as plain paragraphs.
 * - Closing rule lines (last non-list statement after bullets) stay in body.
 */
function bodyFromOnSlide(lines, headingTitle) {
  const cleaned = [];
  for (const line of lines) {
    // Skip fenced code blocks entirely inside on-slide (rare); keep markers out.
    cleaned.push(line);
  }

  // Trim leading/trailing blank lines
  while (cleaned.length && cleaned[0].trim() === '') cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1].trim() === '') cleaned.pop();

  let title = headingTitle || '';
  let subtitle;
  const bodyLines = [];
  let i = 0;

  // If first line duplicates the heading title, skip it as on-slide title restatement.
  if (cleaned.length && normalizeTitle(cleaned[0]) === normalizeTitle(headingTitle)) {
    title = cleaned[0].trim();
    i = 1;
    while (i < cleaned.length && cleaned[i].trim() === '') i += 1;
  }

  // Optional lead-in ending in colon (subtitle), only before any list item.
  if (i < cleaned.length) {
    const lead = cleaned[i].trim();
    if (
      lead.endsWith(':') &&
      !isListItem(lead) &&
      !lead.startsWith('**') &&
      lead.length < 120
    ) {
      subtitle = lead;
      i += 1;
      while (i < cleaned.length && cleaned[i].trim() === '') i += 1;
    }
  }

  // Remainder → body. Preserve list markers Keynote understands as bullets when
  // we pass newline-joined text into the body placeholder.
  for (; i < cleaned.length; i += 1) {
    const line = cleaned[i];
    if (line.trim() === '') {
      // Collapse blank lines inside body to a single blank for paragraph breaks.
      if (bodyLines.length && bodyLines[bodyLines.length - 1] !== '') bodyLines.push('');
      continue;
    }
    // Strip markdown bold wrappers for on-slide body text (Keynote is plain).
    bodyLines.push(stripMdInline(line));
  }

  // Drop trailing blanks
  while (bodyLines.length && bodyLines[bodyLines.length - 1] === '') bodyLines.pop();

  // Normalize list markers to Keynote-friendly lines without forcing bullets on
  // prose. Keep "- " / "* " / "1. " as the line content Keynote body expects
  // when the master is a bullet master: Keynote treats each newline as a bullet
  // when the placeholder is a bullet placeholder, so strip the marker.
  const normalized = bodyLines.map((line) => {
    const m = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (m) return m[1];
    return line;
  });

  const body = normalized.length ? normalized.join('\n') : undefined;
  return { title, subtitle, body };
}

function isListItem(line) {
  return /^\s*(?:[-*]|\d+\.)\s+/.test(line);
}

function stripMdInline(line) {
  // **bold** and *italic* → plain; leave `code` backticks content.
  return line
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

function normalizeTitle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.。]+$/g, '');
}

/**
 * Compare two body values (string or array) for equality after normalization.
 */
export function sameBody(a, b) {
  return normalizeBody(a) === normalizeBody(b);
}

export function normalizeBody(value) {
  if (value == null) return '';
  const text = Array.isArray(value) ? value.join('\n') : String(value);
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();
}

export function sameText(a, b) {
  return String(a ?? '').trim() === String(b ?? '').trim();
}
