// SVG remains an image data URI, never inline markup. Refuse active or external
// content as well, rather than silently stripping any part of the supplied art.
import { fail } from './paths.js';

const TAGS = new Set(('svg g path rect circle ellipse line polyline polygon defs symbol use title desc text tspan '
  + 'linearGradient radialGradient stop clipPath mask pattern marker filter feBlend feColorMatrix '
  + 'feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight '
  + 'feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode '
  + 'feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence').split(' '));

function entity(value) {
  return value.replace(/&([^;\s]+);/g, (_, token) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(named, token)) return named[token];
    if (/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(token)) {
      const point = token[1].toLowerCase() === 'x' ? parseInt(token.slice(2), 16) : Number(token.slice(1));
      if (point > 0 && point <= 0x10ffff) return String.fromCodePoint(point);
    }
    fail('SVG contains an unsupported entity. Use a standalone SVG without entity declarations.');
  });
}

export function checkSvg(buffer) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch {
    fail('SVG is not UTF-8. Supply a UTF-8 standalone SVG.');
  }
  text = text.replace(/^\s*<\?xml\s+[^?]*\?>/i, '').replace(/<!--[\s\S]*?-->/g, '');
  const reject = () => fail('SVG contains active, external, or unsupported markup. Supply a standalone SVG with presentation attributes and local fragment references only.');
  if (/<[!?]/.test(text) || !/^\s*<svg(?:\s|\/?>)/.test(text)) reject();
  const tags = /<\/?([A-Za-z][A-Za-z0-9]*)(\s[^<>]*?)?\s*\/?>/g;
  let end = 0;
  const stack = [];
  const ids = new Set(), references = [];
  let roots = 0;
  for (const match of text.matchAll(tags)) {
    const gap = text.slice(end, match.index);
    if (gap.includes('<') || (stack.length === 0 && gap.trim())) reject();
    end = match.index + match[0].length;
    const tag = match[1];
    if (!TAGS.has(tag)) reject();
    const closing = match[0].startsWith('</');
    if (closing) {
      if (match[2]?.trim() || stack.pop() !== tag) reject();
      continue;
    }
    if (stack.length === 0 && (tag !== 'svg' || roots++ > 0)) reject();
    let attrs = match[2] || '';
    attrs = attrs.replace(/\/\s*$/, '');
    const attribute = /\s+([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*("[^"]*"|'[^']*')/g;
    let attrEnd = 0;
    const seen = new Set();
    for (const attr of attrs.matchAll(attribute)) {
      if (attrs.slice(attrEnd, attr.index).trim()) reject();
      attrEnd = attr.index + attr[0].length;
      const name = attr[1];
      const value = entity(attr[2].slice(1, -1));
      if (seen.has(name)) reject();
      seen.add(name);
      if (name === 'id') {
        if (!/^[A-Za-z_][\w.-]*$/.test(value) || ids.has(value)) reject();
        ids.add(value);
      }
      if (/^on/i.test(name) || /^(style|src|base|xml:base)$/i.test(name)) reject();
      if (name === 'xmlns' && value === 'http://www.w3.org/2000/svg') continue;
      if (name === 'xmlns:xlink' && value === 'http://www.w3.org/1999/xlink') continue;
      if (/xmlns|\\|\/\*|@import|[<>]/i.test(value) || /xmlns/.test(name)) reject();
      if (/^(?:xlink:)?href$/i.test(name) && !/^#[A-Za-z_][\w.-]*$/.test(value)) reject();
      if (/^(?:xlink:)?href$/i.test(name)) references.push(value.slice(1));
      const noLocalUrls = value.replace(/url\(\s*(['"]?)#([A-Za-z_][\w.-]*)\1\s*\)/gi, (_, quote, id) => { references.push(id); return ''; });
      if (/url\s*\(|(?:https?|file|data|ftp):|\/\//i.test(noLocalUrls)) reject();
    }
    if (attrs.slice(attrEnd).trim()) reject();
    if (!/\/\s*>$/.test(match[0])) stack.push(tag);
  }
  if (stack.length || text.slice(end).trim() || roots !== 1) reject();
  if (references.some((id) => !ids.has(id))) reject();
}
