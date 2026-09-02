/**
 * data-chart core: turn CSV, JSON, or TSV content into a self-contained HTML
 * document holding a simple SVG bar or line chart.
 *
 * buildChart reads the rows, checks the named columns, and returns either the
 * HTML string with the plot metadata, or a rejection naming what stopped it.
 * It never throws: content it cannot read and columns that are not there come
 * back as a rejection, so the caller decides what to do rather than catching
 * an exception.
 *
 * Reading lives here rather than being borrowed from a sibling tool: a tool
 * invokes no primitive (standards/primitives.md). This module is imported by
 * scripts/chart.js after the dependency check has run, and by the test suite
 * once dependencies are installed; it is never an entry point itself. The rules
 * every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import { parse as csvParse } from 'csv-parse/sync';

/** The chart types a caller may name. */
export const CHART_TYPES = ['bar', 'line'];

export const DEFAULT_WIDTH = 720;
export const DEFAULT_HEIGHT = 400;

function detectFormat(content, format) {
  if (format === 'json') return { format: 'json', delimiter: '' };
  if (format === 'tsv') return { format: 'csv', delimiter: '\t' };
  if (format === 'csv') return { format: 'csv', delimiter: ',' };

  const firstLine = content.split('\n')[0] || '';
  if (content.trimStart().startsWith('[') || content.trimStart().startsWith('{')) {
    return { format: 'json', delimiter: '' };
  }
  if (firstLine.includes('\t')) return { format: 'csv', delimiter: '\t' };
  if (firstLine.includes(';') && !firstLine.includes(',')) return { format: 'csv', delimiter: ';' };
  if (firstLine.includes('|') && !firstLine.includes(',') && !firstLine.includes('\t')) {
    return { format: 'csv', delimiter: '|' };
  }
  return { format: 'csv', delimiter: ',' };
}

function readRows(content, format, delimiter) {
  if (!content || content.trim() === '') {
    return { rows: [], notes: ['File content is empty'] };
  }

  const detected = detectFormat(content, format);
  const effectiveDelimiter = delimiter || detected.delimiter;

  if (detected.format === 'json') {
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        return { rows: [], notes: ['JSON content is not an array of objects'] };
      }
      const rows = parsed.filter(
        (item) => typeof item === 'object' && item !== null && !Array.isArray(item)
      );
      if (rows.length < parsed.length) {
        return {
          rows,
          notes: [
            `${parsed.length - rows.length} of ${parsed.length} array entries were not objects and were skipped`,
          ],
        };
      }
      return { rows, notes: [] };
    } catch {
      return { rows: [], notes: ['The content could not be parsed as JSON'] };
    }
  }

  try {
    const records = csvParse(content, {
      delimiter: effectiveDelimiter,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
    return { rows: records, notes: [] };
  } catch {
    return {
      rows: [],
      notes: [
        `The content could not be parsed as delimited text with delimiter ${JSON.stringify(effectiveDelimiter)}`,
      ],
    };
  }
}

function columnNames(rows) {
  const names = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) names.add(key);
  }
  return [...names];
}

/** Same numeric reading the other data tools use: strip $, commas, and spaces. */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).trim().replace(/[$,\s]/g, '');
  if (str === '') return null;
  const num = Number(str);
  return Number.isNaN(num) || !Number.isFinite(num) ? null : num;
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function niceMax(max) {
  if (!(max > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  let nice;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return nice * magnitude;
}

function formatTick(value) {
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

/**
 * Collect plottable points from rows. A row whose y value does not parse as a
 * number is skipped; x is always taken as text.
 */
export function collectPoints(rows, xColumn, yColumn) {
  const points = [];
  let skipped = 0;
  for (const row of rows) {
    const y = toNumber(row[yColumn]);
    if (y === null) {
      skipped += 1;
      continue;
    }
    const rawX = row[xColumn];
    const x =
      rawX === null || rawX === undefined || rawX === ''
        ? ''
        : String(rawX).trim();
    points.push({ x, y });
  }
  return { points, skipped };
}

function buildSvg(points, type, title, width, height) {
  const margin = { top: title ? 48 : 24, right: 24, bottom: 56, left: 56 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const maxY = niceMax(Math.max(...points.map((p) => p.y), 0));
  const minY = 0;
  const yScale = (v) => margin.top + plotH - ((v - minY) / (maxY - minY || 1)) * plotH;

  const tickCount = 5;
  const ticks = [];
  for (let i = 0; i <= tickCount; i += 1) {
    const value = (maxY / tickCount) * i;
    ticks.push(value);
  }

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title || type + ' chart')}">`
  );
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);

  if (title) {
    parts.push(
      `<text x="${width / 2}" y="28" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(title)}</text>`
    );
  }

  // Grid and y ticks.
  for (const tick of ticks) {
    const y = yScale(tick);
    parts.push(
      `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`
    );
    parts.push(
      `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-family="system-ui,sans-serif" font-size="11" fill="#6b7280">${escapeXml(formatTick(tick))}</text>`
    );
  }

  // Axes.
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="#9ca3af" stroke-width="1"/>`
  );
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#9ca3af" stroke-width="1"/>`
  );

  if (type === 'bar') {
    const gap = 0.2;
    const band = plotW / points.length;
    const barW = band * (1 - gap);
    points.forEach((point, index) => {
      const x = margin.left + band * index + (band - barW) / 2;
      const y = yScale(point.y);
      const h = margin.top + plotH - y;
      parts.push(
        `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(h, 0).toFixed(2)}" fill="#2563eb"/>`
      );
      const labelX = margin.left + band * index + band / 2;
      const label = point.x.length > 12 ? `${point.x.slice(0, 11)}...` : point.x;
      parts.push(
        `<text x="${labelX.toFixed(2)}" y="${margin.top + plotH + 18}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#374151">${escapeXml(label)}</text>`
      );
    });
  } else {
    // line
    const n = points.length;
    const xAt = (index) =>
      n === 1
        ? margin.left + plotW / 2
        : margin.left + (plotW * index) / (n - 1);

    const coords = points.map((point, index) => ({
      x: xAt(index),
      y: yScale(point.y),
      label: point.x,
    }));

    if (coords.length > 1) {
      const d = coords
        .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
        .join(' ');
      parts.push(`<path d="${d}" fill="none" stroke="#2563eb" stroke-width="2"/>`);
    }

    for (const c of coords) {
      parts.push(
        `<circle cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="3.5" fill="#2563eb"/>`
      );
      const label = c.label.length > 12 ? `${c.label.slice(0, 11)}...` : c.label;
      parts.push(
        `<text x="${c.x.toFixed(2)}" y="${margin.top + plotH + 18}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#374151">${escapeXml(label)}</text>`
      );
    }
  }

  parts.push('</svg>');
  return parts.join('');
}

/**
 * Build a self-contained HTML document. No external scripts, stylesheets, or
 * network resources: the chart is SVG inline, and the page opens offline.
 */
export function renderHtml({ points, type, title, width, height }) {
  const safeTitle = title || `${type} chart`;
  const svg = buildSvg(points, type, title, width, height);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(safeTitle)}</title>
<style>
  body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; color: #111827; background: #f9fafb; }
  .frame { max-width: ${width + 32}px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; }
  svg { display: block; max-width: 100%; height: auto; }
</style>
</head>
<body>
<div class="frame">
${svg}
</div>
</body>
</html>
`;
}

/**
 * @param {{
 *   content: string,
 *   x: string,
 *   y: string,
 *   type?: 'bar'|'line',
 *   title?: string,
 *   format?: 'csv'|'json'|'tsv',
 *   delimiter?: string,
 *   width?: number,
 *   height?: number,
 * }} input
 * @returns {{
 *   ok: true,
 *   html: string,
 *   type: string,
 *   points: number,
 *   width: number,
 *   height: number,
 *   skipped: number,
 *   notes: string[],
 * } | {
 *   ok: false,
 *   errors: string[],
 * }}
 */
export function buildChart(input) {
  const {
    content,
    x,
    y,
    type = 'bar',
    title = '',
    format,
    delimiter,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
  } = input;

  if (!x || String(x).trim() === '') {
    return { ok: false, errors: ['x is required and must name the category column'] };
  }
  if (!y || String(y).trim() === '') {
    return { ok: false, errors: ['y is required and must name the numeric column'] };
  }
  if (!CHART_TYPES.includes(type)) {
    return { ok: false, errors: [`type "${type}" is not one of ${CHART_TYPES.join(', ')}`] };
  }

  const { rows, notes } = readRows(content, format, delimiter);
  if (rows.length === 0) {
    return {
      ok: false,
      errors: notes.length > 0 ? notes : ['No data rows found'],
    };
  }

  const available = columnNames(rows);
  const rejections = [];
  if (!available.includes(x)) {
    rejections.push(`x column "${x}" not found. Available: ${available.join(', ')}`);
  }
  if (!available.includes(y)) {
    rejections.push(`y column "${y}" not found. Available: ${available.join(', ')}`);
  }
  if (rejections.length > 0) {
    return { ok: false, errors: [...notes, ...rejections] };
  }

  const { points, skipped } = collectPoints(rows, x, y);
  if (points.length === 0) {
    return {
      ok: false,
      errors: [
        ...notes,
        `No numeric values found in y column "${y}". Every row was empty or non-numeric after stripping $, commas, and spaces.`,
      ],
    };
  }

  const html = renderHtml({ points, type, title, width, height });
  return {
    ok: true,
    html,
    type,
    points: points.length,
    width,
    height,
    skipped,
    notes,
  };
}
