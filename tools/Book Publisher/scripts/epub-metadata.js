// EPUB identity and optional publication metadata; no external packages.
import { createHash } from 'node:crypto';

const oneLine = (value) => typeof value === 'string' && !/[\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(value);
const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

function ebookIsbn(value) {
  // An unquoted ISBN-13 reaches here as a YAML integer; an unquoted ISBN-10
  // beginning with 0 has lost that digit and stays refused.
  if (Number.isSafeInteger(value)) value = String(value);
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[- ]/g, '');
  if (/^\d{9}[\dXx]$/.test(digits)) {
    const sum = [...digits].reduce((n, c, i) => n + (c.toUpperCase() === 'X' ? 10 : Number(c)) * (10 - i), 0);
    if (sum % 11 !== 0) return null;
    const stem = '978' + digits.slice(0, 9);
    const check = (10 - [...stem].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) % 10) % 10;
    return stem + check;
  }
  if (/^97[89]\d{10}$/.test(digits) && [...digits].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0) return digits;
  return null;
}

export function epubMetadataErrors(config) {
  const errors = [];
  if (config.epub !== undefined && (!config.epub || typeof config.epub !== 'object' || Array.isArray(config.epub))) {
    errors.push('epub must be a mapping containing optional epub.identifier');
  }
  if (config.isbn?.ebook !== undefined && !ebookIsbn(config.isbn.ebook)) {
    errors.push('isbn.ebook must be an ISBN-10 or ISBN-13 with a valid check digit (hyphens and spaces allowed); quote an ISBN that begins with 0');
  }
  if (config.epub?.identifier !== undefined && (!oneLine(config.epub.identifier) || !config.epub.identifier.trim())) {
    errors.push('epub.identifier must be nonempty text on one line');
  }
  if (config.isbn?.ebook !== undefined && config.epub?.identifier !== undefined) {
    errors.push('isbn.ebook and epub.identifier cannot both be set');
  }
  if (config.publication_date !== undefined) {
    const date = config.publication_date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      errors.push('publication_date must be a real calendar date in YYYY-MM-DD form');
    }
  }
  if (config.rights !== undefined && !oneLine(config.rights)) errors.push('rights must be text on one line');
  return errors;
}

export function epubIdentifier(config) {
  if (config.isbn?.ebook !== undefined) return `urn:isbn:${ebookIsbn(config.isbn.ebook)}`;
  if (config.epub?.identifier !== undefined) return config.epub.identifier;
  // RFC 4122 URL namespace; name is the compact JSON array of title then names,
  // UTF-8, without Unicode normalization. This is independent of paths and time.
  const namespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
  const names = config.authors.map((author) => typeof author === 'object' ? author.name : author);
  const bytes = createHash('sha1').update(namespace).update(JSON.stringify([config.title, ...names]), 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function optionalEpubMetadata(config) {
  return Object.fromEntries(Object.entries({
    subtitle: config.subtitle, publisher: config.publisher?.name,
    description: config.description?.short, rights: config.rights, date: config.publication_date
  }).filter(([, value]) => hasValue(value)));
}

const xml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function publicationMetadata(text, config) {
  // Pandoc invents dc:date when no date was supplied. Remove only that element;
  // dcterms:modified is still Pandoc's build clock. Replace values as XML text
  // so Markdown interpretation cannot change a verbatim identifier or rights,
  // and through functions, so a $ in a value is never a replacement pattern.
  // Pandoc writes no subtitle into the package metadata; it is added here as a
  // second dc:title refined as the subtitle, the main title refined as main.
  text = text.replace(/<dc:identifier\b([^>]*)>[\s\S]*?<\/dc:identifier>/,
    (_, attrs) => `<dc:identifier${attrs}>${xml(epubIdentifier(config))}</dc:identifier>`);
  text = text.replace(/\s*<dc:date\b[^>]*>[\s\S]*?<\/dc:date>/g, '');
  text = text.replace(/\s*<dc:rights\b[^>]*>[\s\S]*?<\/dc:rights>/g, '');
  const fields = [config.publication_date === undefined ? '' : `    <dc:date id="epub-date">${xml(config.publication_date)}</dc:date>`,
    hasValue(config.rights) ? `    <dc:rights>${xml(config.rights)}</dc:rights>` : ''].filter(Boolean);
  if (fields.length) text = text.replace(/([ \t]*)<\/metadata>/, (_, indent) => fields.join('\n') + '\n' + indent + '</metadata>');
  if (hasValue(config.subtitle)) {
    text = text.replace(/([ \t]*)<dc:title\b([^>]*)>([\s\S]*?)<\/dc:title>/, (title, indent, attrs) => {
      const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
      return [title,
        id ? `${indent}<meta refines="#${id}" property="title-type">main</meta>` : '',
        `${indent}<dc:title id="epub-subtitle">${xml(config.subtitle)}</dc:title>`,
        `${indent}<meta refines="#epub-subtitle" property="title-type">subtitle</meta>`].filter(Boolean).join('\n');
    });
  }
  return text;
}

export function ncxIdentifier(text, config) {
  return text.replace(/<meta\b[^>]*name="dtb:uid"[^>]*\/>/,
    () => `<meta name="dtb:uid" content="${xml(epubIdentifier(config))}" />`);
}
