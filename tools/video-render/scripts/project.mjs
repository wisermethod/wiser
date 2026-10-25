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

function cssReference(text, imports = true, depth = 0) {
  // Preserve strings while removing comments, then skip ordinary strings such as
  // content: "url(https://example.invalid)". URL tokens, image-set strings and imports load assets.
  const css = text.replace(/("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')|\/\*[\s\S]*?(?:\*\/|$)/g, (_, string) => string ?? '');
  const tokens = /(?:(@import)\s*)?(?<![\w-])url\(\s*(?:"((?:\\[\s\S]|[^"\\])*)"|'((?:\\[\s\S]|[^'\\])*)'|((?:\\[\s\S]|[^)"'\\])*))\s*\)|(@import)\s*(?:"((?:\\[\s\S]|[^"\\])*)"|'((?:\\[\s\S]|[^'\\])*)')|([\w-]+)\(|([()])|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')/gi;
  const functions = [];
  for (const match of css.matchAll(tokens)) {
    if (match[8]) { functions.push(match[8].toLowerCase()); continue; }
    if (match[9]) {
      if (match[9] === '(') functions.push(null);
      else functions.pop();
      continue;
    }
    if (!imports && (match[1] || match[5])) continue;
    const imageSet = match[10] && ['image-set', '-webkit-image-set'].includes(functions.at(-1));
    const value = match[2] ?? match[3] ?? match[4] ?? match[6] ?? match[7] ?? (imageSet ? match[10].slice(1, -1) : undefined);
    if (value === undefined) continue;
    const rule = match[1] || match[5] ? '@import' : imageSet ? `${functions.at(-1)}()` : 'url()';
    const ref = urlReference(cssValue(value), depth);
    if (ref) return { ...ref, rule: `${rule}${ref.rule ? ` ${ref.rule}` : ''}`,
      value: ref.rule ? ref.value : value.trim() };
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

function urlReference(value, depth) {
  if (anotherOrigin(value)) return { value: value.trim() };
  const url = value.trim().replace(/[\t\r\n]/g, '');
  if (!/^data:/i.test(url)) return null;
  const comma = url.indexOf(',');
  const header = url.slice(5, comma < 0 ? undefined : comma).trim();
  const type = header.split(';')[0].trim().toLowerCase();
  const extension = { 'text/css': '.css', 'text/html': '.html', 'application/xhtml+xml': '.html', 'image/svg+xml': '.svg' }[type];
  if (!extension) return null;
  if (depth >= 3) return { rule: 'data URL nesting exceeds depth 3', value: 'data:' + type };
  let content;
  try {
    if (comma < 0) throw new Error('missing comma');
    // Decode URL bytes before base64 and the declared text encoding. Treating
    // UTF-16 bytes as UTF-8 would hide the markup between NUL characters.
    let bytes = Buffer.concat(url.slice(comma + 1).split(/(%[\da-f]{2})/gi).map((part) =>
      /^%[\da-f]{2}$/i.test(part) ? Buffer.from([Number.parseInt(part.slice(1), 16)]) : Buffer.from(part)));
    if (/;\s*base64$/i.test(header)) bytes = Buffer.from(bytes.toString('utf8'), 'base64');
    const charset = /;\s*charset\s*=\s*(?:"([^"]*)"|([^;]*))/i.exec(header);
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : charset?.[1] ?? charset?.[2]?.trim() ?? 'utf-8';
    content = new TextDecoder(encoding).decode(bytes);
  } catch {
    return { rule: 'invalid data URL', value: 'data:' + type };
  }
  const ref = loadingReference(content, extension, depth + 1);
  return ref ? { ...ref, rule: `data:${type} ${ref.rule}` } : null;
}

function loadingReference(text, extension, depth = 0) {
  const ext = extension.toLowerCase();
  if (ext === '.css') return cssReference(text, true, depth);
  if (!['.html', '.htm', '.svg'].includes(ext)) return null;
  for (const tag of openingTags(text)) {
    for (const attr of tag.attrs) {
      const decoded = attributeValue(attr.value);
      if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) continue;
      if (tag.name === 'iframe' && attr.name === 'srcdoc') {
        const ref = depth >= 3 ? { rule: 'nesting exceeds depth 3', value: 'srcdoc' } : loadingReference(decoded, '.html', depth + 1);
        if (ref) return { ...ref, rule: `srcdoc ${ref.rule}` };
      }
      if (['src', 'href', 'xlink:href', 'srcset', 'poster', 'data', 'action', 'formaction', 'background', 'ping'].includes(attr.name)) {
        const values = attr.name === 'srcset' ? srcsetValues(decoded) : attr.name === 'ping' ? decoded.split(/\s+/) : [decoded];
        for (const value of values) {
          const ref = urlReference(value, depth);
          if (ref) return { ...ref, rule: `${attr.name}${ref.rule ? ` ${ref.rule}` : ''}` };
        }
      }
      if (attr.name === 'style' || /url\(/i.test(decoded)) {
        const ref = cssReference(decoded, false, depth);
        if (ref) return { ...ref, rule: `${attr.name} ${ref.rule}` };
      }
    }
    if (tag.name === 'meta' && tag.attrs.some((a) => a.name === 'http-equiv' && attributeValue(a.value).trim().toLowerCase() === 'refresh')) {
      const content = attributeValue(tag.attrs.find((a) => a.name === 'content')?.value ?? '');
      const match = /^\s*[\d.]+(?:\s*[;,]\s*|\s+)(?:url\s*=\s*)?([\s\S]*)$/i.exec(content);
      if (match) {
        const ref = urlReference(match[1].trim().replace(/^(['"])([\s\S]*)\1$/, '$2'), depth);
        if (ref) return { ...ref, rule: `meta refresh content${ref.rule ? ` ${ref.rule}` : ''}` };
      }
    }
    if (tag.name === 'style') {
      const ref = cssReference(tag.content, true, depth);
      if (ref) return { ...ref, rule: `<style> ${ref.rule}` };
    }
  }
  return null;
}

export function remoteReference(text, extension) {
  return loadingReference(text, extension)?.value ?? null;
}

export function protectedPath(path) {
  return path.split(sep).some((part) => /^(?:memory|\.env(?:\..*)?|.+\.env|credentials(?:\.json)?)$/i.test(part));
}

export async function inspectProject(project) {
  if (protectedPath(project)) throw new Error(`--project ${project} names a protected memory or credential path; use a local asset project.`);
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const name = relative(project, path);
      if (protectedPath(path)) throw new Error(`Project file ${name} is a protected memory or credential path; remove it from the project.`);
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
  window.addEventListener('hf-seek', function (event) { seek(event.detail && event.detail.time); });
  function first() { seek(window.__hfThreeTime || 0); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', first, { once: true });
  else first();
})();
`;
