// Read-only manuscript checks. The entry point checks for yaml before import; no typesetting runtimes.
import { readFileSync, realpathSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export function indexStrategy(config) {
  if (config.index?.enabled !== undefined && typeof config.index.enabled !== 'boolean') {
    throw new Error('index.enabled must be a boolean. Use true for makeindex or false for none/two-pass.');
  }
  if (config.index?.enabled !== false) return 'makeindex';
  return config.index?.extractor != null ? 'two-pass' : 'none';
}

// Only raw TeX treats percent as a comment; Markdown prose keeps it literal.
function withoutTexComments(text) {
  return text.replace(/(\\\\)|\\%|%[^\r\n]*/g, (token, escaped) => (escaped || token === '\\%') ? token : '');
}

// Fenced and inline code is illustrative text, not manuscript markup.
function withoutCode(text, keepRaw = false) {
  let raw = false;
  let fence;
  const containers = [];
  return text.split('\n').map((line) => {
    const body = line.replace(/^ {0,3}(?:>[ \t]?)+/, '').replace(/\t/g, '    ');
    const indent = /^ */.exec(body)[0].length;
    const list = /^ *(?:[-+*]|\d+[.)])[ \t]+/.exec(body);
    const footnote = /^ *\[\^[^\]]+\]:/.test(body);
    if (body.trim() && !fence) {
      while (containers.length && indent < containers.at(-1)) containers.pop();
      if (list) containers.push(list[0].length);
      else if (footnote) containers.push(indent + 4);
    }
    // Four spaces inside a list or footnote are often normal continuation
    // text. Code indentation is measured from that container's own margin.
    const margin = containers.at(-1) ?? 0;
    const content = list ? body.slice(list[0].length) : body.slice(Math.min(indent, margin));
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(content);
    if (fence) {
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) { fence = undefined; raw = false; return ''; }
      return raw ? (raw === 'html' ? line : withoutTexComments(line)) : '';
    }
    if (match) { fence = match[1]; raw = keepRaw && /^\s*\{=(html|latex|tex)\}\s*$/.exec(match[2])?.[1]; return ''; }
    if (!list && !footnote && indent >= margin + 4) return '';
    return line;
  }).join('\n').replace(/(`+)([\s\S]*?)\1(?!`)(\{=(?:html|latex|tex)\})?/g,
    (match, fence, body, raw) => keepRaw && raw ? (raw === '{=html}' ? body : withoutTexComments(body)) : '');
}

// The public directive accepts eight slots. Preserve raw-attribute blocks but
// leave illustrative fenced/inline/indented code out of manuscript validation.
export function thumbTabErrors(text, file) {
  const errors = [];
  const markup = withoutCode(text, true);
  for (const directive of markup.matchAll(/<!--\s*thumb-tab-start:\s*([\s\S]*?)-->/g)) {
    const slot = /\bslot\s*=\s*([^,\s]*)/.exec(directive[1]);
    if (slot && !/^0*[1-8]$/.test(slot[1])) {
      errors.push(`${file}: ${directive[0]}: thumb-tab slot must be an integer from 1 to 8; omit slot for 1.`);
    }
  }
  const latex = markup.replace(/\\\\/g, ' ');
  for (const directive of latex.matchAll(/\\thumbtabstart\s*\{([^}]*)\}(?:\s*\{[^}]*\})?/g)) {
    if (!/^\s*0*[1-8]\s*$/.test(directive[1])) {
      errors.push(`${file}: ${directive[0]}: thumb-tab slot must be an integer from 1 to 8.`);
    }
  }
  return errors;
}

function plainHeading(text) {
  return text.replace(/\s+\{[^}]*\}\s*$/, '').replace(/(\*\*|__)(.*?)\1/g, '$2').trim();
}

// Markdown destinations may use angle brackets, escaped punctuation, balanced
// parentheses, and a quoted title. Return only the path, never the title.
function destination(text) {
  text = text.trimStart();
  if (text.startsWith('<')) return text.slice(1, text.indexOf('>'));
  let depth = 0;
  let end = 0;
  for (; end < text.length; end += 1) {
    const c = text[end];
    if (c === '\\') { end += 1; continue; }
    if (c === '(') depth += 1;
    if (c === ')') { if (depth === 0) break; depth -= 1; }
    if (/\s/.test(c) && depth === 0) break;
  }
  return text.slice(0, end);
}

function referenceDefinitions(text) {
  const definitions = new Map();
  for (const match of text.matchAll(/^ {0,3}\[(?!\^)([^\]]+)\]:[ \t]*(.*)$/gm)) {
    const key = match[1].trim().replace(/\s+/g, ' ').toLowerCase();
    if (!definitions.has(key)) definitions.set(key, destination(match[2]));
  }
  return definitions;
}

function references(text, errors, file, definitions) {
  const result = [];
  const normalize = (key) => key.trim().replace(/\s+/g, ' ').toLowerCase();
  text = text.replace(/^ {0,3}\[(?!\^)([^\]]+)\]:[ \t]*(.*)$/gm, '');
  const links = /(!?)\[/g;
  let match;
  while ((match = links.exec(text))) {
    if (text[match.index - 1] === '\\') continue;
    const image = Boolean(match[1]);
    const start = links.lastIndex;
    let end = start;
    let depth = 1;
    for (; end < text.length; end += 1) {
      if (text[end] === '\\') { end += 1; continue; }
      if (text[end] === '[') depth += 1;
      if (text[end] === ']') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (end === text.length) continue;
    const label = text.slice(start, end);
    if (!image && label.startsWith('^')) continue;
    const tail = text.slice(end + 1).trimStart();
    if (tail.startsWith('(')) {
      result.push({ path: destination(tail.slice(1)), image });
    } else {
      const reference = /^\[([^\]]*)\]/.exec(tail)?.[1];
      const key = normalize(reference || label);
      if (definitions.has(key)) result.push({ path: definitions.get(key), image });
      else if (image || reference !== undefined) errors.push(`${file}: undefined asset/link reference [${reference || label}]. Define its destination.`);
    }
  }
  for (const tag of text.matchAll(/<(?:img|source|video|audio|object)\b[^>]*>/gi)) {
    for (const attr of tag[0].matchAll(/\b(?:src|poster|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      result.push({ path: attr[1] ?? attr[2] ?? attr[3], image: true });
    }
    for (const attr of tag[0].matchAll(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      for (const candidate of (attr[1] ?? attr[2]).split(',')) {
        result.push({ path: candidate.trim().split(/\s+/)[0], image: true });
      }
    }
  }
  return result;
}

function checkAssets(text, chapterPath, errors, definitions) {
  for (const reference of references(text, errors, chapterPath, definitions)) {
    let path = reference.path.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1').replace(/&amp;/g, '&');
    if (!path || path.startsWith('#')) continue;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path) && !path.startsWith('file:')) {
      if (reference.image) errors.push(`${chapterPath}: asset is not on disk: ${path}. Supply a local asset path.`);
      continue;
    }
    try {
      path = path.startsWith('file:') ? fileURLToPath(path) : decodeURIComponent(path.split(/[?#]/)[0]);
      const asset = resolve(dirname(chapterPath), path);
      if (!statSync(asset).isFile()) throw new Error('not a file');
    } catch {
      errors.push(`${chapterPath}: asset not found on disk: ${reference.path}. Correct the reference or supply the file.`);
    }
  }
}

function standing(projectRoot, errors) {
  const file = join(projectRoot, 'AGENTS.md');
  let raw;
  try { raw = readFileSync(file, 'utf8'); }
  catch { errors.push(`project AGENTS.md missing or unreadable: ${file}. Add the book's AGENTS.md.`); return false; }
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  const metadata = frontmatter ? parseYaml(frontmatter[1]) : null;
  const fromInit = metadata != null && typeof metadata === 'object' && Object.hasOwn(metadata, 'book');
  const body = frontmatter ? raw.slice(frontmatter[0].length) : raw;
  const text = withoutCode(body).replace(/<!--[\s\S]*?-->/g, '');
  const section = /^##[ \t]+Standing[ \t]*#*[ \t]*\r?\n([\s\S]*?)(?=^#{1,2}[ \t]+|(?![\s\S]))/mi.exec(text);
  const content = section?.[1].trim();
  if (fromInit && (!content || /\{\{[^}]+\}\}/.test(content) || /^(?:TODO|TBD|not yet (?:defined|decided))\.?$/i.test(content))) {
    errors.push(`${file}: Standing section is missing or empty. State this book's completion condition or record "Awaiting its owner.".`);
  }
  return Boolean(section);
}

// Exclude before checking the one chapter grammar. Retain leading-number then
// filename order, including the existing letter-suffix ordering of both books.
export function getChapterFiles(chaptersDir, exclude = []) {
  const skip = new Set(exclude);
  const files = readdirSync(chaptersDir).filter((file) => /\.md$/i.test(file) && !skip.has(file));
  const orders = new Set();
  const errors = [];
  const parsed = new Map();
  for (const file of files.sort((a, b) => a.localeCompare(b))) {
    const order = /^(\d+)([a-z]*)(?:[-_ ].+)?\.md$/i.exec(file);
    if (!order) errors.push(`chapter has no leading number: ${file}. Number chapter filenames to define their order.`);
    else {
      const key = `${Number(order[1])}${order[2].toLowerCase()}`;
      if (orders.has(key)) errors.push(`ambiguous chapter order ${key}: ${file}. Give each chapter a distinct leading number/suffix.`);
      orders.add(key);
      parsed.set(file, Number(order[1]));
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return files.sort((a, b) => parsed.get(a) - parsed.get(b) || a.localeCompare(b));
}

export function validateBook(config, files) {
  const errors = [];
  const strategy = indexStrategy(config);
  const chaptersDir = realpathSync(config.source._chaptersPath);
  // Configs may be stored below the project. The parent of source.chapters,
  // rather than the config's directory, owns the project's AGENTS.md.
  const projectRoot = dirname(chaptersDir);
  const standingFound = standing(projectRoot, errors);
  if (!files.length) errors.push(`no markdown chapter files found in ${chaptersDir}. Add a numbered .md chapter.`);
  const chapters = [];
  const chapterPaths = [];
  const ranges = new Map();
  for (const file of files) {
    const path = join(chaptersDir, file);
    let text;
    try {
      if (!statSync(path).isFile()) throw new Error('not a file');
      text = withoutCode(readFileSync(path, 'utf8'));
    } catch { errors.push(`chapter missing or unreadable: ${path}. Supply a readable Markdown file.`); continue; }
    const visible = text.replace(/<!--[\s\S]*?-->/g, '');
    // Absence of index markup is valid for none and makeindex. Any range that
    // is actually present still has to balance, including across chapters.
    for (const marker of visible.matchAll(/\{\{idx:([^{}]+?)\|([()])\}\}/g)) {
      const term = marker[1].trim().replace(/\s+/g, ' ');
      if (marker[2] === '(') {
        if (ranges.has(term)) errors.push(`${file}: unbalanced index range for "${term}": a second opening precedes its close.`);
        else ranges.set(term, file);
      } else if (!ranges.delete(term)) errors.push(`${file}: unbalanced index range for "${term}": closing marker has no opening marker.`);
    }
    chapters.push(text);
    chapterPaths.push(path);
  }
  // The build merges chapters into one Markdown document, so a definition in
  // one chapter may supply a reference in another.
  const definitions = referenceDefinitions(chapters.join('\n\n').replace(/<!--[\s\S]*?-->/g, ''));
  chapters.forEach((text, i) => checkAssets(text.replace(/<!--[\s\S]*?-->/g, ''), chapterPaths[i], errors, definitions));
  for (const [term, file] of ranges) errors.push(`${file}: unbalanced index range for "${term}": missing {{idx:${term}|)}}. Close the range.`);

  if (strategy === 'two-pass') {
    const extractor = { indexHeading: 'Appendix C: Index', glossaryHeading: 'Appendix D: Glossary', ...config.index.extractor };
    const text = chapters.join('\n\n');
    const headings = new Map();
    // Comments cannot supply a manuscript section. Preserve offsets so the
    // boundaries still slice the original text, including its term markers.
    const headingText = text.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '));
    for (const match of headingText.matchAll(/^(?:#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?|\*\*(.+?)\*\*)[ \t]*\r?$/gm)) {
      headings.set(plainHeading(match[1] ?? match[2]), match.index);
    }
    const boundaries = {};
    for (const key of ['indexHeading', 'glossaryHeading']) {
      const name = extractor[key];
      if (typeof name !== 'string' || !name.trim()) errors.push(`two-pass indexing requires index.extractor.${key}. Name the matching manuscript section.`);
      else if (!headings.has(name.trim())) errors.push(`index.extractor.${key} names a section that does not exist: "${name}". Match an actual section heading.`);
      else boundaries[key] = headings.get(name.trim());
    }
    if (boundaries.indexHeading !== undefined && boundaries.glossaryHeading !== undefined) {
      if (boundaries.indexHeading >= boundaries.glossaryHeading) errors.push('two-pass extractor boundaries are out of order. The index section must precede the glossary section.');
      else if (!/\S[^\n]*<!--\s*br\s*-->/.test(text.slice(boundaries.indexHeading, boundaries.glossaryHeading))) errors.push('two-pass index has no term markers (<!-- br -->). Mark the index terms for extraction.');
    }
    const toc = [...text.matchAll(/<!--\s*toc-entry:\s*([^,>]+?)(?:,\s*\d+)?\s*-->/g)].map((m) => m[1].trim());
    const name = extractor.indexHeading;
    if (typeof name === 'string' && !toc.includes(name.trim())) errors.push(`two-pass index is missing its <!-- toc-entry: ${name} --> marker. Add its table of contents entry.`);
  }
  return { errors, strategy, projectRoot, standingFound, chapters: files };
}
