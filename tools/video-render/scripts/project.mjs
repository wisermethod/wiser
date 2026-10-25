import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, join, relative, sep } from 'node:path';

const decoder = new TextDecoder('utf-8', { fatal: true });
const attributes = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

// Opening tags with source offsets, skipping comments and raw script/style/text contents.
// Keeping the original bytes avoids serializing or rewriting a piece's markup and CSS.
export function openingTags(html) {
  const pattern = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?([a-z][\w:-]*)\b((?:[^'"<>]|"[^"]*"|'[^']*')*)>/gi;
  const tags = [];
  let match;
  while ((match = pattern.exec(html))) {
    if (!match[1] || match[0].startsWith('</')) continue;
    const attrs = [...match[2].matchAll(attributes)].map((a) => ({
      name: a[1].toLowerCase(), value: a[2] ?? a[3] ?? a[4] ?? '',
      start: match.index + match[0].indexOf(match[2]) + a.index,
      end: match.index + match[0].indexOf(match[2]) + a.index + a[0].length,
    }));
    const tag = { name: match[1].toLowerCase(), attrs, start: match.index, end: pattern.lastIndex };
    tags.push(tag);
    if (['script', 'style', 'textarea', 'title'].includes(tag.name)) {
      const closing = new RegExp(`</${tag.name}\\s*>`, 'gi');
      closing.lastIndex = pattern.lastIndex;
      const end = closing.exec(html);
      tag.content = html.slice(pattern.lastIndex, end?.index ?? html.length);
      pattern.lastIndex = end ? closing.lastIndex : html.length;
    }
  }
  return tags;
}

function anotherOrigin(value) {
  const url = value.trim().replace(/[\t\r\n]/g, '');
  return /^\/\//.test(url) || (/^[a-z][a-z\d+.-]*:/i.test(url) && !/^(?:data|blob):/i.test(url));
}

function cssValue(value) {
  return value.replace(/\\(?:([\da-f]{1,6})\s?|([^\r\n\f])|\r\n|[\r\n\f])/gi, (_, hex, escaped) => {
    if (!hex) return escaped ?? '';
    const point = Number.parseInt(hex, 16);
    return point && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '\ufffd';
  });
}

function cssReference(text, imports = true) {
  // Preserve strings while removing comments, then skip ordinary strings such as
  // content: "url(https://example.invalid)". Only URL tokens and imports load assets.
  const css = text.replace(/("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')|\/\*[\s\S]*?(?:\*\/|$)/g, (_, string) => string ?? '');
  const tokens = /(?:(@import)\s*)?(?<![\w-])url\(\s*(?:"((?:\\[\s\S]|[^"\\])*)"|'((?:\\[\s\S]|[^'\\])*)'|((?:\\[\s\S]|[^)"'\\])*))\s*\)|(@import)\s*(?:"((?:\\[\s\S]|[^"\\])*)"|'((?:\\[\s\S]|[^'\\])*)')|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/gi;
  for (const match of css.matchAll(tokens)) {
    if (!imports && (match[1] || match[5])) continue;
    const value = match[2] ?? match[3] ?? match[4] ?? match[6] ?? match[7];
    if (value !== undefined && anotherOrigin(cssValue(value))) return { rule: match[1] || match[5] ? '@import' : 'url()', value: value.trim() };
  }
  return null;
}

function attributeValue(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', colon: ':', sol: '/', Tab: '\t', NewLine: '\n' };
  return value.replace(/&(?:#(x[\da-f]+|\d+);?|([a-z]+);)/gi, (entity, numeric, name) => {
    if (!numeric) return named[name] ?? entity;
    const point = /^x/i.test(numeric) ? Number.parseInt(numeric.slice(1), 16) : Number(numeric);
    return point && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '\ufffd';
  });
}

function* srcsetValues(value) {
  // A data URL can contain commas. Srcset's URL ends at whitespace, with any
  // trailing commas separating candidates; descriptors end at an unparenthesized comma.
  let offset = 0;
  while (offset < value.length) {
    while (/[\t\n\f\r ,]/.test(value[offset] ?? '') && offset < value.length) offset++;
    const start = offset;
    while (offset < value.length && !/[\t\n\f\r ]/.test(value[offset])) offset++;
    const url = value.slice(start, offset);
    yield url.replace(/,+$/, '');
    if (url.endsWith(',')) continue;
    let depth = 0;
    while (offset < value.length) {
      const char = value[offset++];
      if (char === '(') depth++;
      else if (char === ')') depth = Math.max(0, depth - 1);
      else if (char === ',' && depth === 0) break;
    }
  }
}

function loadingReference(text, extension) {
  const ext = extension.toLowerCase();
  if (ext === '.css') return cssReference(text);
  if (!['.html', '.htm', '.svg'].includes(ext)) return null;
  for (const tag of openingTags(text)) {
    for (const attr of tag.attrs) {
      const decoded = attributeValue(attr.value);
      if (['src', 'href', 'xlink:href', 'srcset', 'poster', 'data'].includes(attr.name)) {
        const values = attr.name === 'srcset' ? srcsetValues(decoded) : [decoded];
        for (const value of values) {
          if (anotherOrigin(value)) return { rule: attr.name, value: value.trim() };
        }
      }
      if (attr.name === 'style') {
        const ref = cssReference(decoded, false);
        if (ref) return { ...ref, rule: `style ${ref.rule}` };
      }
    }
    if (tag.name === 'style') {
      const ref = cssReference(tag.content);
      if (ref) return { ...ref, rule: `<style> ${ref.rule}` };
    }
  }
  return null;
}

export function remoteReference(text, extension) {
  return loadingReference(text, extension)?.value ?? null;
}

export function protectedPath(path) {
  return path.split(sep).some((part) => /^memory$/i.test(part) || /^\.env(?:\.|$)/i.test(part));
}

export async function inspectProject(project) {
  if (protectedPath(project)) throw new Error(`--project ${project} names a protected memory or .env path; use a local asset project.`);
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const name = relative(project, path);
      if (protectedPath(path)) throw new Error(`Project file ${name} is a protected memory or .env path; remove it from the project.`);
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) throw new Error(`Project file ${name} is a symbolic link; put its local asset bytes in the project instead.`);
      if (stat.isDirectory()) { await walk(path); continue; }
      if (!stat.isFile()) throw new Error(`Project file ${name} is not a regular file; remove it from the project.`);
      let text;
      const bytes = await readFile(await realpath(path));
      files.push({ path: name.split(sep).join('/'), sha256: createHash('sha256').update(bytes).digest('hex') });
      try { text = decoder.decode(bytes); } catch { continue; }
      const ref = loadingReference(text, extname(name));
      if (ref) throw new Error(`Project file ${name} references ${ref.value} in ${ref.rule}; use local assets before rendering.`);
    }
  }
  await walk(project);
  const html = await readFile(join(project, 'index.html'), 'utf8');
  const roots = openingTags(html).filter((tag) => tag.attrs.some((a) => a.name === 'data-video-root'));
  if (roots.length !== 1) throw new Error(`index.html has ${roots.length} data-video-root elements; provide exactly one at the frame's size.`);
  return { html, root: roots[0], files: files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) };
}

export function compositionHtml({ html, root }, { width, height, duration }, bridgeName) {
  const names = new Set(['data-composition-id', 'data-start', 'data-duration', 'data-width', 'data-height', 'data-no-timeline']);
  let tag = html.slice(root.start, root.end);
  for (const attr of root.attrs.filter((a) => names.has(a.name)).reverse()) {
    tag = tag.slice(0, attr.start - root.start) + tag.slice(attr.end - root.start);
  }
  const props = ` data-composition-id="video-render" data-start="0" data-duration="${duration}" data-width="${width}" data-height="${height}" data-no-timeline`;
  tag = tag.replace(/\s*\/?>$/, (end) => props + end);
  const output = html.slice(0, root.start) + tag + html.slice(root.end);
  // At EOF the HTML parser places this in the body, after all the project's scripts.
  return `${output}\n<script src="${bridgeName}"></script>\n`;
}

export const BRIDGE = `/* The renderer owns its event names; the explainer only knows the tool's seek. */
(function () {
  'use strict';
  function seek(time) {
    var t = Number(time);
    window.dispatchEvent(new CustomEvent('video-render:seek', { detail: { time: Number.isFinite(t) ? t : 0 } }));
  }
  /* HyperFrames 0.8.134's CSS and Web Animations adapters seek every animation document.getAnimations() returns by
     their own clock, counted from when they first met it, and pause it; pausing an animation the page has just
     cancelled brings it back, so a frame would depend on the seeks before it. The page owns its motion through
     this tool's seek, so those adapters are shown no animations, and the adapter's patch of Element.animate is
     undone before each seek. The page's own element.getAnimations() is untouched. */
  try { document.getAnimations = function () { return []; }; } catch (e) { /* a read-only document */ }
  function unpatchAnimate() {
    var proto = window.Element && Element.prototype;
    if (proto && typeof proto.__hfOriginalAnimate === 'function' && proto.animate !== proto.__hfOriginalAnimate) {
      try { proto.animate = proto.__hfOriginalAnimate; } catch (e) { /* left patched */ }
    }
  }
  window.addEventListener('hf-seek', function (event) { unpatchAnimate(); seek(event.detail && event.detail.time); });
  function first() { seek(window.__hfThreeTime || 0); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', first, { once: true });
  else first();
})();
`;
