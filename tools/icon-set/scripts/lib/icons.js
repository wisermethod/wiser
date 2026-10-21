// The pinned catalogs and their path-only SVG formats; Node built-ins only.
export const PACKAGE = '@phosphor-icons/core';
export const VERSION = '2.1.1';
export const WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'];
export const SETS = {
  phosphor: { package: PACKAGE, version: VERSION, weights: WEIGHTS, catalog: 'dist/index.mjs' },
  health: { package: 'healthicons', version: '2.0.0', weights: ['filled', 'outline'], catalog: 'public/icons/meta-data.json' }
};

export function searchIcons(icons, query, limit = 20, set = 'phosphor') {
  const words = query.toLowerCase().trim().split(/\s+/);
  return icons.map(icon => {
    const { name, tags, categories, title, category } = icon;
    const fields = [name, ...tags, ...(set === 'health' ? [title, category] : categories)].map(s => s.toLowerCase());
    const scores = words.map(word => {
      if (fields[0] === word) return 100;
      if (fields[0].split(set === 'health' ? /[-_]/ : '-').includes(word)) return 60;
      if (fields[0].includes(word)) return 40;
      if (fields.slice(1).some(field => field === word)) return 20;
      return fields.slice(1).some(field => field.includes(word)) ? 10 : 0;
    });
    return { ...icon, score: scores.every(Boolean) ? scores.reduce((a, b) => a + b, 0) : 0 };
  }).filter(icon => icon.score > 0)
    .sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, limit).map(({ name, tags, categories, title, category }) => set === 'health'
      ? { name, path: `${category}/${name}`, title, category, tags, weights: SETS.health.weights }
      : { name, tags, categories });
}

function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

export function nearestNames(icons, name) {
  return icons.map(icon => ({ name: icon.name, distance: distance(name.toLowerCase(), icon.name) }))
    .sort((a, b) => a.distance - b.distance || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, 3).map(icon => icon.name);
}

export function assetPath(name, weight, set = 'phosphor') {
  // Health 2.0.0 metadata paths map literally, including underscores and case.
  if (set === 'health') return `public/icons/svg/${weight}/${name}.svg`;
  return `assets/${weight}/${name}${weight === 'regular' ? '' : `-${weight}`}.svg`;
}

export function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');
}

// A closed parser for the formats inspected in both pinned sets. Re-emitting
// only these tags and attributes prevents source scripts, references, ids and
// transforms from reaching either output form. Unexpected source is refused.
function attributes(raw, allowed) {
  const result = {};
  const pattern = /\s+([A-Za-z][A-Za-z0-9:-]*)\s*=\s*(["'])([^"'<>]*)\2/g;
  let end = 0;
  for (const match of raw.matchAll(pattern)) {
    if (raw.slice(end, match.index).trim() || !allowed.includes(match[1]) || Object.hasOwn(result, match[1])) {
      throw new Error('unexpected SVG attribute; restore the pinned package with check --install');
    }
    result[match[1]] = match[3];
    end = match.index + match[0].length;
  }
  if (raw.slice(end).trim()) throw new Error('unreadable SVG attributes; restore the pinned package with check --install');
  return result;
}

function serialize(attrs) {
  return Object.entries(attrs).map(([key, value]) => `${key}="${escapeXml(value)}"`).join(' ');
}

export function buildSvg(source, { set = 'phosphor', name, weight, size, color = 'currentColor', accent, fragment = false, x, y, className }) {
  const root = /^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/.exec(source);
  if (!root) throw new Error('unreadable SVG source; restore the pinned package with check --install');
  const original = attributes(root[1], ['xmlns', 'viewBox', 'fill', 'stroke', ...(set === 'health' ? ['width', 'height'] : [])]);
  const box = original.viewBox?.trim().split(/[\s,]+/).map(Number);
  if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) {
    throw new Error('source has no usable viewBox; restore the pinned package with check --install');
  }
  const outer = {
    xmlns: 'http://www.w3.org/2000/svg',
    ...(fragment ? { x, y } : {}), width: size, height: size,
    viewBox: original.viewBox,
    ...(fragment ? { 'aria-hidden': 'true' } : { role: 'img' }),
    'data-icon': `${set}:${name}:${weight}:${SETS[set].version}`,
    ...(className === undefined ? {} : { class: className })
  };
  for (const paint of ['fill', 'stroke']) {
    if (original[paint] !== undefined) outer[paint] = original[paint] === 'none' ? 'none' : color;
  }
  const paths = [];
  const sourceOpacities = [];
  let end = 0;
  for (const match of root[2].matchAll(/<path\b([^>]*)\/>/g)) {
    if (root[2].slice(end, match.index).trim()) throw new Error('unexpected SVG element; restore the pinned package with check --install');
    const attrs = attributes(match[1], ['d', 'fill', 'stroke', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule',
      ...(set === 'health' ? ['clip-rule'] : [])]);
    if (!attrs.d || !/^[MmZzLlHhVvCcSsQqTtAaEe\d.,+\-\s]+$/.test(attrs.d)) {
      throw new Error('unreadable SVG path; restore the pinned package with check --install');
    }
    for (const paint of ['fill', 'stroke']) {
      if (attrs[paint] !== undefined && attrs[paint] !== 'none') attrs[paint] = color;
    }
    let background = false;
    for (const opacity of ['opacity', 'fill-opacity', 'stroke-opacity']) {
      if (attrs[opacity] === undefined) continue;
      const value = Number(attrs[opacity]);
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('invalid source opacity; restore the pinned package with check --install');
      if (weight === 'duotone' && value < 1) {
        background = true;
        sourceOpacities.push(value);
        if (accent !== undefined) delete attrs[opacity];
      }
    }
    if (background && accent !== undefined) {
      attrs.fill = accent;
      if (attrs.stroke && attrs.stroke !== 'none') attrs.stroke = accent;
    }
    paths.push(`<path ${serialize(attrs)}/>`);
    end = match.index + match[0].length;
  }
  if (root[2].slice(end).trim() || paths.length === 0) {
    throw new Error('unexpected SVG content; restore the pinned package with check --install');
  }
  const title = fragment ? '' : `<title>${escapeXml(name)}</title>`;
  return {
    svg: `<svg ${serialize(outer)}>${title}${paths.join('')}</svg>\n`,
    background: weight === 'duotone' ? {
      color: accent ?? color,
      opacity: accent === undefined ? 'source' : 1,
      sourceOpacities: [...new Set(sourceOpacities)],
      note: accent === undefined ? '--accent omitted: --color at its source opacity' : '--accent applied with source opacity removed'
    } : null
  };
}
