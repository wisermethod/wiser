const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const VML = 'urn:schemas-microsoft-com:vml';
const XML = 'http://www.w3.org/XML/1998/namespace';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';
const MAIN = 'word/document.xml';
const MAIN_RELS = 'word/_rels/document.xml.rels';
const ROOT_RELS = '_rels/.rels';
const CONTENT_TYPES = '[Content_Types].xml';
const MAIN_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const COMMENTS = 'word/comments.xml';
const COMMENTS_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml';
const STORY_NAMES = new Map([
  ['document', 'secondary document'], ['hdr', 'header'], ['ftr', 'footer'],
  ['footnotes', 'footnotes'], ['endnotes', 'endnotes'], ['comments', 'comments'], ['glossaryDocument', 'glossary'],
]);
const STORY_TYPES = /wordprocessingml\.(?:header|footer|footnotes|endnotes|comments|document\.glossary)\+xml$/i;
const STORY_RELATIONSHIPS = new Map([
  ['header', 'hdr'], ['footer', 'ftr'], ['footnotes', 'footnotes'], ['endnotes', 'endnotes'],
  ['comments', 'comments'], ['glossaryDocument', 'glossaryDocument'],
]);
const TRACKED_RANGE = /^(?:(?:moveFrom|moveTo)Range|customXml(?:Ins|Del|MoveFrom|MoveTo)Range)(?:Start|End)$/;
const COMMENT_ANCHORS = new Set(['comment', 'commentRangeStart', 'commentRangeEnd', 'commentReference']);
const INLINE_WHITESPACE = new Set(['tab', 'ptab', 'br', 'cr', 'noBreakHyphen']);
const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export const MAX_PACKAGE_BYTES = 256 * 1024 * 1024;

const REVISION_TYPES = new Map([
  ['ins', 'insertion'], ['del', 'deletion'],
  ['rPrChange', 'formatting-run'], ['pPrChange', 'formatting-paragraph'],
  ['moveFrom', 'move-from'], ['moveTo', 'move-to'],
  ['tblPrChange', 'formatting-table'], ['tblGridChange', 'formatting-grid'],
  ['trPrChange', 'formatting-row'], ['tcPrChange', 'formatting-cell'],
  ['sectPrChange', 'formatting-section'], ['numberingChange', 'formatting-numbering'],
  ['cellIns', 'cell-insertion'], ['cellDel', 'cell-deletion'], ['cellMerge', 'cell-merge'],
]);

export const FILTER_TYPES = ['formatting', ...REVISION_TYPES.values()];
const RUN_CONTAINERS = new Set(['p', 'hyperlink', 'smartTag', 'sdtContent', 'customXml', 'ins', 'del',
  'moveFrom', 'moveTo', 'fldSimple', 'dir', 'bdo']);
const XML_CHARACTERS = /^[\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]*$/u;
const textLength = (text) => [...text].length;
const word = (node, name) => node?.namespaceURI === W && node.localName === name;
const children = (node) => Array.from(node?.childNodes ?? []);
const elements = (node) => children(node).filter((child) => child.nodeType === 1);
const descendants = (node, name) => Array.from(node.getElementsByTagNameNS(W, name));
const attr = (node, name) => node.getAttributeNS(W, name);
const authorOf = (node) => node.hasAttributeNS(W, 'author') ? attr(node, 'author') : 'Unknown';
const set = (node, name, value) => node.setAttributeNS(W, `w:${name}`, value);
const add = (parent, name) => parent.appendChild(element(parent.ownerDocument, name));
const element = (document, name) => document.createElementNS(W, `w:${name}`);
const direct = (node, name) => elements(node).find((child) => word(child, name));
const nearestParagraph = (node) => {
  for (let parent = node.parentNode; parent; parent = parent.parentNode) {
    if (word(parent, 'p')) return parent;
  }
  return null;
};

function requireText(value, label) {
  if (typeof value !== 'string' || !XML_CHARACTERS.test(value)) {
    throw new Error(`${label} must be text containing only XML 1.0 characters. Correct the supplied text.`);
  }
  return value;
}

function requireAuthor(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('--author is required. Supply a nonblank author name.');
  return requireText(value, '--author');
}

function validXml(SaxesParser, text, name) {
  const invalid = () => {
    throw new Error(`Invalid XML in ${name}. Open or repair the document in Word and save a fresh .docx.`);
  };
  const strict = new SaxesParser({ xmlns: true, defaultXMLVersion: '1.0', forceXMLVersion: true });
  strict.on('error', invalid);
  strict.on('doctype', invalid);
  strict.write(text).close();
  return invalid;
}

function parseXml(codec, text, name, namespace, rootName) {
  const invalid = validXml(codec.SaxesParser, text, name);
  const { DOMParser } = codec;
  const parser = new DOMParser({ errorHandler: { warning: invalid, error: invalid, fatalError: invalid } });
  const document = parser.parseFromString(text, 'application/xml');
  const root = document.documentElement;
  if (!root || (namespace && root.namespaceURI !== namespace) || (rootName && root.localName !== rootName) ||
      elements(document).length !== 1 ||
      children(document).some((node) => node.nodeType === 3 && node.data.trim())) invalid();
  return root;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[index]) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

async function readPackage(codec, bytes) {
  const duplicates = new Set();
  const parts = Object.create(null);
  let inflatedSize = 0;
  try {
    if (bytes.length < 22 || bytes.length > MAX_PACKAGE_BYTES) throw new Error();
    for await (const entry of codec.zipEntries(bytes)) {
      const { name, size, crc, encrypted } = entry;
      inflatedSize += size;
      const segments = name.replace(/\/$/, '').split('/');
      if (encrypted || inflatedSize > MAX_PACKAGE_BYTES || /[\\\x00-\x1f]/.test(name) ||
          segments.some((segment) => !segment || segment === '.' || segment === '..' || segment === '__proto__')) {
        throw new Error();
      }
      if (Object.hasOwn(parts, name)) {
        if (![MAIN, MAIN_RELS, COMMENTS, CONTENT_TYPES].includes(name)) throw new Error();
        duplicates.add(name);
      }
      const data = await entry.read();
      if (data.length !== size || crc32(data) !== crc) throw new Error();
      parts[name] = data;
    }
  } catch {
    throw new Error('The DOCX ZIP is unreadable, corrupt, ambiguous, encrypted, or larger than 256 MiB packed or unpacked. Use a fresh Word copy within the size limit.');
  }
  return { parts, duplicateParts: [...duplicates].sort() };
}

function readXml(codec, parts, name, namespace, rootName) {
  if (!Object.hasOwn(parts, name)) throw new Error(`DOCX is missing ${name}. Use a valid Word document.`);
  let text;
  try {
    const bytes = parts[name];
    const utf16le = bytes[0] === 0xff && bytes[1] === 0xfe;
    const utf16be = bytes[0] === 0xfe && bytes[1] === 0xff;
    text = new TextDecoder(utf16le ? 'utf-16le' : utf16be ? 'utf-16be' : 'utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Invalid XML encoding in ${name}. Save the document again in Word.`);
  }
  return parseXml(codec, text, name, namespace, rootName);
}

function writeXml(codec, parts, name, root) {
  const xml = DECLARATION + new codec.XMLSerializer().serializeToString(root);
  validXml(codec.SaxesParser, xml, name);
  parts[name] = new TextEncoder().encode(xml);
}

function packageTarget(base, target, label) {
  if (!target || /[\\:#?%]/.test(target)) {
    throw new Error(`The ${label} relationship does not name a supported local package part. Save a fresh copy in Word.`);
  }
  const segments = target.startsWith('/') ? [] : [...base];
  for (const segment of target.split('/')) {
    if (segment === '..') {
      if (!segments.length) throw new Error(`The ${label} relationship leaves the package. Repair the document in Word.`);
      segments.pop();
    } else if (segment && segment !== '.') segments.push(segment);
  }
  return segments.join('/');
}

function checkMainPackage(codec, parts) {
  const rootRels = readXml(codec, parts, ROOT_RELS, REL, 'Relationships');
  const mainRels = elements(rootRels).filter((node) =>
    node.namespaceURI === REL && node.localName === 'Relationship' &&
    node.getAttribute('Type') === `${OFFICE_REL}officeDocument`);
  if (mainRels.length !== 1 || mainRels[0].getAttribute('TargetMode') === 'External' ||
      packageTarget([], mainRels[0].getAttribute('Target'), 'main document') !== MAIN) {
    throw new Error('DOCX must contain one local main relationship to word/document.xml. Save a fresh Word document.');
  }
  const types = readXml(codec, parts, CONTENT_TYPES, TYPES, 'Types');
  const mainType = elements(types).filter((node) =>
    node.namespaceURI === TYPES && node.localName === 'Override' && node.getAttribute('PartName') === `/${MAIN}`);
  if (mainType.length !== 1 || mainType[0].getAttribute('ContentType') !== MAIN_TYPE) {
    throw new Error('DOCX is missing its main Word content type. Save a fresh Word document.');
  }
  return types;
}

function writeText(run, text) {
  for (const piece of text.split(/(\r\n|\n|\r|\t)/)) {
    if (piece === '\t') add(run, 'tab');
    else if (piece === '\n' || piece === '\r' || piece === '\r\n') add(run, 'br');
    else if (piece) {
      const node = add(run, 't');
      node.setAttributeNS(XML, 'xml:space', 'preserve');
      node.appendChild(run.ownerDocument.createTextNode(piece));
    }
  }
}

function creationSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec) ||
      Object.keys(spec).some((key) => key !== 'title' && key !== 'paragraphs') ||
      (Object.hasOwn(spec, 'paragraphs') && !Array.isArray(spec.paragraphs))) {
    throw new Error('Creation input must be a JSON object with optional title and paragraphs. Pass a title string and an array of paragraph strings.');
  }
  const title = Object.hasOwn(spec, 'title') ? requireText(spec.title, 'title') : '';
  const paragraphs = (spec.paragraphs ?? []).map((text, index) => requireText(text, `paragraphs[${index}]`));
  return { title, paragraphs };
}

function createPackage(codec, spec, date) {
  const { title, paragraphs } = creationSpec(spec);
  const main = parseXml(codec, `<w:document xmlns:w="${W}"><w:body/></w:document>`, MAIN, W, 'document');
  const body = direct(main, 'body');
  if (title) {
    const paragraph = add(body, 'p');
    set(add(add(paragraph, 'pPr'), 'pStyle'), 'val', 'Title');
    writeText(add(paragraph, 'r'), title);
  }
  for (const text of paragraphs) writeText(add(add(body, 'p'), 'r'), text);
  if (!title && !paragraphs.length) add(body, 'p');
  const section = add(body, 'sectPr');
  const size = add(section, 'pgSz');
  set(size, 'w', '12240');
  set(size, 'h', '15840');
  const margin = add(section, 'pgMar');
  for (const side of ['top', 'right', 'bottom', 'left']) set(margin, side, '1440');
  for (const edge of ['header', 'footer']) set(margin, edge, '720');
  set(margin, 'gutter', '0');
  const types = parseXml(codec, `<Types xmlns="${TYPES}">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/${MAIN}" ContentType="${MAIN_TYPE}"/>
    <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
    <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  </Types>`, CONTENT_TYPES, TYPES, 'Types');
  const coreNs = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties';
  const dc = 'http://purl.org/dc/elements/1.1/';
  const core = parseXml(codec, `<cp:coreProperties xmlns:cp="${coreNs}" xmlns:dc="${dc}"
    xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <dc:creator>Wiser</dc:creator>
    <dcterms:created xsi:type="dcterms:W3CDTF">${date}</dcterms:created>
    <dcterms:modified xsi:type="dcterms:W3CDTF">${date}</dcterms:modified>
  </cp:coreProperties>`, 'docProps/core.xml', coreNs, 'coreProperties');
  if (title) {
    const item = core.ownerDocument.createElementNS(dc, 'dc:title');
    item.appendChild(core.ownerDocument.createTextNode(title));
    core.insertBefore(item, core.firstChild);
  }
  const parts = {};
  writeXml(codec, parts, MAIN, main);
  writeXml(codec, parts, CONTENT_TYPES, types);
  writeXml(codec, parts, 'docProps/core.xml', core);
  const encoder = new TextEncoder();
  parts[ROOT_RELS] = encoder.encode(DECLARATION + `<Relationships xmlns="${REL}">
    <Relationship Id="rId1" Type="${OFFICE_REL}officeDocument" Target="${MAIN}"/>
    <Relationship Id="rId2" Type="${REL}/metadata/core-properties" Target="docProps/core.xml"/>
    <Relationship Id="rId3" Type="${OFFICE_REL}extended-properties" Target="docProps/app.xml"/>
  </Relationships>`);
  parts['docProps/app.xml'] = encoder.encode(DECLARATION +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Wiser</Application></Properties>');
  parts[MAIN_RELS] = encoder.encode(DECLARATION + `<Relationships xmlns="${REL}">
    <Relationship Id="rId1" Type="${OFFICE_REL}styles" Target="styles.xml"/>
  </Relationships>`);
  parts['word/styles.xml'] = encoder.encode(DECLARATION + `<w:styles xmlns:w="${W}">
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
      <w:name w:val="Normal"/>
      <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
    </w:style>
    <w:style w:type="paragraph" w:styleId="Title">
      <w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
      <w:pPr><w:keepNext/><w:spacing w:after="240"/></w:pPr>
      <w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr>
    </w:style>
  </w:styles>`);
  return {
    bytes: pack(codec.zipSync, parts),
    result: { paragraphs: paragraphs.length, title: title || null },
  };
}

function pack(zipSync, parts) {
  const size = Object.values(parts).reduce((total, bytes) => total + bytes.length, 0);
  if (size > MAX_PACKAGE_BYTES) throw new Error('Output exceeds 256 MiB unpacked. Use a smaller document.');
  const bytes = zipSync(parts, { level: 6, mtime: new Date(2000, 0, 1) });
  if (bytes.length > MAX_PACKAGE_BYTES) throw new Error('Output exceeds 256 MiB packed. Use a smaller document.');
  return bytes;
}

function inlineText(node, { deleted = false, owner } = {}) {
  if (word(node, 'p') && owner && node !== owner) return '';
  if (node.namespaceURI === MC && node.localName === 'AlternateContent') return '';
  if (word(node, 'del') || word(node, 'moveFrom')) {
    if (!deleted) return '';
  }
  if (word(node, 't') || (deleted && word(node, 'delText'))) return node.textContent;
  if (word(node, 'tab') || word(node, 'ptab')) return '\t';
  if (word(node, 'br') || word(node, 'cr')) return '\n';
  if (word(node, 'noBreakHyphen')) return '\u2011';
  if (word(node, 'rPr') || word(node, 'pPr')) return '';
  return elements(node).map((child) => inlineText(child, { deleted, owner })).join('');
}

function paragraphSpecial(node) {
  return word(node, 'rPr') || word(node, 'sectPr');
}

function withinAlternateContent(node) {
  for (let parent = node; parent; parent = parent.parentNode) {
    if (parent.namespaceURI === MC && parent.localName === 'AlternateContent') return true;
  }
  return false;
}

function hasAlternateContent(node) {
  return withinAlternateContent(node) || node.getElementsByTagNameNS(MC, 'AlternateContent').length > 0;
}

const TEXT_REVISION_CONTENT = new Set([
  'r', 'rPr', 't', 'delText', 'tab', 'ptab', 'br', 'cr', 'noBreakHyphen',
  'ins', 'del', 'rPrChange', 'commentRangeStart', 'commentRangeEnd', 'commentReference',
]);
const HIDDEN_REVISION_CONTENT = new Set([
  'footnoteReference', 'endnoteReference', 'footnoteRef', 'endnoteRef', 'drawing', 'pict', 'object',
  'fldSimple', 'fldChar', 'instrText', 'delInstrText', 'sym',
]);

function revisionScopeIssue(node) {
  const name = node.localName;
  const parent = node.parentNode;
  if (hasAlternateContent(node) || Array.from(node.attributes).some((item) => item.namespaceURI === MC)) return 'alternate content';
  const paragraph = nearestParagraph(node);
  if (name === 'rPrChange' || name === 'pPrChange') {
    const property = name.slice(0, -6);
    const old = direct(node, property);
    if (!word(parent, property) || elements(node).length !== 1 || !old ||
        (name === 'pPrChange' && elements(old).some(paragraphSpecial))) return 'unsupported formatting snapshot';
    return null;
  }
  if ((name !== 'ins' && name !== 'del') || !paragraph || parent.namespaceURI !== W ||
      !RUN_CONTAINERS.has(parent.localName)) return 'unsupported revision structure';
  const omitted = new Set();
  function inspect(container, inRunProperties = false) {
    for (const child of elements(container)) {
      const kind = child.localName;
      const breakType = word(child, 'br') && attr(child, 'type');
      if (breakType && breakType !== 'textWrapping') {
        omitted.add(`${child.nodeName} (${breakType} break)`);
      } else if (child.namespaceURI !== W || HIDDEN_REVISION_CONTENT.has(kind) ||
          (!inRunProperties && !TEXT_REVISION_CONTENT.has(kind)) ||
          Array.from(child.attributes).some((item) => item.namespaceURI === MC)) {
        omitted.add(child.nodeName);
      }
      inspect(child, inRunProperties || word(child, 'rPr'));
    }
  }
  inspect(node);
  return omitted.size ? `markup outside the text preview: ${[...omitted].join(', ')}` : null;
}

function revisions(body, XMLSerializer) {
  const all = descendants(body, '*');
  // Preserve the source's insertion, deletion, run-format, paragraph-format ID ordering.
  const byType = new Map([...REVISION_TYPES.keys()].map((name) => [name, []]));
  for (const node of all) byType.get(node.localName)?.push(node);
  return [...byType.values()].flat().map((node, index) => {
    const issue = revisionScopeIssue(node);
    const info = {
      id: index + 1, wordId: attr(node, 'id') || null,
      type: REVISION_TYPES.get(node.localName), author: authorOf(node),
      date: attr(node, 'date') || null, status: 'pending',
      text: hasAlternateContent(node) ? '[Alternate content]' :
        node.localName.endsWith('Change') ? '[Formatting change]' : inlineText(node, { deleted: true }),
      supported: issue === null,
    };
    if (issue) info.unsupportedReason = issue;
    if (info.supported && node.localName.endsWith('PrChange')) {
      const serializer = new XMLSerializer();
      const properties = node.parentNode;
      const current = properties.cloneNode(false);
      for (const child of children(properties)) {
        if (child !== node && (!word(properties, 'pPr') || !paragraphSpecial(child))) {
          current.appendChild(child.cloneNode(true));
        }
      }
      info.text = inlineText(properties.parentNode, { deleted: true });
      info.formatting = {
        before: serializer.serializeToString(direct(node, properties.localName)),
        after: serializer.serializeToString(current),
      };
      const preserved = word(properties, 'pPr') ? elements(properties).filter(paragraphSpecial) : [];
      if (preserved.length) info.formatting.preserved = preserved.map((child) => `w:${child.localName}`);
    }
    return { node, info };
  });
}

function selectChanges(changes, command, args) {
  const selected = changes.filter(({ info }) => {
    if (command !== 'apply-all') return info.id === args.changeId;
    return (args.filterAuthor === undefined || args.filterAuthor === info.author) &&
      (!args.filterType || args.filterType === info.type ||
        (args.filterType === 'formatting' && info.type.startsWith('formatting-')));
  });
  if (command !== 'apply-all' && !selected.length) {
    throw new Error(`Change ID ${args.changeId} is absent. Run list-changes on this input again.`);
  }
  return selected;
}

function restoreFormatting(node) {
  const parent = node.parentNode;
  const old = direct(node, parent.localName);
  const preserve = (child) => word(parent, 'pPr') && paragraphSpecial(child);
  // Keep the property container in place, including its position relative to the run.
  for (const attribute of Array.from(parent.attributes)) {
    if (attribute.namespaceURI === W) {
      parent.removeAttributeNode(attribute);
    }
  }
  for (const attribute of Array.from(old.attributes)) {
    if (attribute.namespaceURI !== XMLNS) parent.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
  }
  const firstSpecial = elements(parent).find(preserve) ?? null;
  for (const child of children(parent)) {
    if (!preserve(child)) parent.removeChild(child);
  }
  for (const child of children(old)) {
    carryDeclarations(child, old);
    carryDeclarations(child, node);
    parent.insertBefore(child, firstSpecial);
  }
}

function carryDeclarations(child, wrapper) {
  if (child.nodeType !== 1) return;
  for (const declaration of Array.from(wrapper.attributes)) {
    const inheritedXml = declaration.namespaceURI === XML && ['space', 'lang', 'base'].includes(declaration.localName);
    if ((declaration.namespaceURI === XMLNS || inheritedXml) &&
        !child.hasAttributeNS(declaration.namespaceURI, declaration.localName)) {
      child.setAttributeNS(declaration.namespaceURI, declaration.name, declaration.value);
    }
  }
}

function preserveCommentAnchors(node) {
  const parent = node.parentNode;
  for (const child of descendants(node, '*')) {
    const reference = word(child, 'commentReference');
    if (!reference && !word(child, 'commentRangeStart') && !word(child, 'commentRangeEnd')) continue;
    for (let wrapper = child.parentNode; wrapper !== parent; wrapper = wrapper.parentNode) {
      carryDeclarations(child, wrapper);
    }
    if (reference) {
      const run = element(node.ownerDocument, 'r');
      run.appendChild(child);
      parent.insertBefore(run, node);
    } else parent.insertBefore(child, node);
  }
}

function resolveChanges(changes, selected, command) {
  const accepting = command !== 'reject-change';
  const pending = new Set(selected.map(({ node }) => node));
  const removesContent = (node) => accepting ? word(node, 'del') : word(node, 'ins');

  for (const { node, info } of selected) {
    if (!info.supported) throw new Error(`Change ${info.id} uses ${info.type} outside this tool's edit scope (${info.unsupportedReason}). Resolve it in Word.`);
    if (removesContent(node) || (!accepting && node.localName.endsWith('PrChange'))) {
      const discarded = removesContent(node) ? [node] : elements(node.parentNode).filter((child) =>
        !word(node.parentNode, 'pPr') || !paragraphSpecial(child));
      for (const other of changes) {
        if (!pending.has(other.node) &&
            discarded.some((root) => root === other.node || contains(root, other.node))) {
          throw new Error(`Change ${info.id} would also remove change ${other.info.id}. Resolve the nested change first and preview again.`);
        }
      }
    }
  }

  // Innermost selected revisions go first so no mutation loses a selected node.
  const depth = (node) => {
    let count = 0;
    for (let parent = node.parentNode; parent; parent = parent.parentNode) count++;
    return count;
  };
  for (const { node } of [...selected].sort((left, right) => depth(right.node) - depth(left.node))) {
    const parent = node.parentNode;
    if (removesContent(node)) {
      preserveCommentAnchors(node);
      parent.removeChild(node);
    } else if (word(node, 'rPrChange') || word(node, 'pPrChange')) {
      if (accepting) parent.removeChild(node);
      else restoreFormatting(node);
    } else {
      if (word(node, 'del')) {
        for (const [deleted, normal] of [['delText', 't'], ['delInstrText', 'instrText']]) {
          for (const old of descendants(node, deleted)) {
            // Descendants of a still-pending nested deletion retain their deleted text.
            let enclosing = old.parentNode;
            while (enclosing !== node && !word(enclosing, 'del')) enclosing = enclosing.parentNode;
            if (enclosing !== node) continue;
            replaceTextNode(old, normal);
          }
        }
      }
      for (const child of children(node)) {
        carryDeclarations(child, node);
        parent.insertBefore(child, node);
      }
      parent.removeChild(node);
    }
  }
}

function contains(parent, child) {
  for (let node = child.parentNode; node; node = node.parentNode) {
    if (node === parent) return true;
  }
  return false;
}

function replaceTextNode(old, name) {
  const replacement = element(old.ownerDocument, name);
  for (const attribute of Array.from(old.attributes)) {
    replacement.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
  }
  for (const child of children(old)) replacement.appendChild(child);
  old.parentNode.replaceChild(replacement, old);
}

function storyParts(codec, parts, types) {
  const names = new Set();
  const extensions = new Set();
  for (const entry of elements(types)) {
    if (entry.namespaceURI !== TYPES || !STORY_TYPES.test(entry.getAttribute('ContentType'))) continue;
    if (entry.localName === 'Override') names.add(entry.getAttribute('PartName').slice(1));
    if (entry.localName === 'Default') extensions.add(entry.getAttribute('Extension').toLowerCase());
  }
  for (const name of Object.keys(parts)) {
    const extension = /\.([^.\/]+)$/.exec(name)?.[1]?.toLowerCase();
    if (/^word\/.+\.xml$/i.test(name) || extensions.has(extension)) names.add(name);
  }
  names.delete(MAIN);

  const roots = new Map();
  const related = [MAIN];
  for (const name of related) {
    const base = name.split('/');
    const file = base.pop();
    const rels = [...base, '_rels', `${file}.rels`].join('/');
    if (!Object.hasOwn(parts, rels)) continue;
    const relationships = readXml(codec, parts, rels, REL, 'Relationships');
    for (const link of elements(relationships)) {
      const type = link.getAttribute('Type');
      if (link.namespaceURI !== REL || link.localName !== 'Relationship' || !type.startsWith(OFFICE_REL)) continue;
      const rootName = STORY_RELATIONSHIPS.get(type.slice(OFFICE_REL.length));
      if (!rootName) continue;
      const label = STORY_NAMES.get(rootName);
      if (link.getAttribute('TargetMode') === 'External') {
        throw new Error(`The ${label} relationship names an external story. Save a fresh local copy in Word.`);
      }
      const target = packageTarget(base, link.getAttribute('Target'), label);
      if (!roots.has(target)) {
        roots.set(target, readXml(codec, parts, target, W, rootName));
        related.push(target);
      } else if (roots.get(target).localName !== rootName) {
        throw new Error(`Conflicting story relationships for ${target}. Repair the document in Word.`);
      }
      names.add(target);
    }
  }
  const stories = [];
  for (const name of names) {
    const root = roots.get(name) ?? readXml(codec, parts, name);
    const story = root.namespaceURI === W && STORY_NAMES.get(root.localName);
    if (story) stories.push({ root, label: `${story} (${name})` });
  }
  return stories;
}

function excludedParagraph(paragraph) {
  if (withinAlternateContent(paragraph)) return 'alternate content';
  for (let parent = paragraph.parentNode; parent; parent = parent.parentNode) {
    if (word(parent, 'del') || word(parent, 'moveFrom')) return 'pending deletion or move';
    if (word(parent, 'txbxContent')) return 'text box';
    if (word(parent, 'p')) return 'nested paragraph';
  }
  return null;
}

function omittedText(node) {
  if (word(node, 'del') || word(node, 'moveFrom') || word(node, 'pPr') || word(node, 'rPr')) return false;
  if (word(node, 'altChunk') || word(node, 'subDoc')) return true;
  if (node.namespaceURI === W && INLINE_WHITESPACE.has(node.localName)) return true;
  return (word(node, 't') && node.textContent.length > 0) || embeddedText(node) || elements(node).some(omittedText);
}

function embeddedText(node) {
  return word(node, 'sym') || (node.namespaceURI !== W && node.localName === 't' && node.textContent.length > 0) ||
    (node.namespaceURI === VML && node.localName === 'textpath' && Boolean(node.getAttribute('string')));
}

function editParagraphs(body, stories) {
  const items = [];
  const excluded = new Map();
  function record(label, hasText, paragraphs = 0) {
    const entry = excluded.get(label) ?? { paragraphs: 0, hasText: false };
    entry.paragraphs += paragraphs;
    entry.hasText ||= hasText;
    excluded.set(label, entry);
  }
  function scanInline(node) {
    if (word(node, 'del') || word(node, 'moveFrom') || word(node, 'pPr') || word(node, 'rPr')) return;
    if (node.namespaceURI === MC && node.localName === 'AlternateContent') {
      record('alternate content', omittedText(node), descendants(node, 'p').length);
    } else if (word(node, 'txbxContent') || (word(node, 'p') && nearestParagraph(node))) {
      const label = word(node, 'txbxContent') ? 'text box' : 'nested paragraph';
      record(label, omittedText(node), descendants(node, 'p').length + Number(word(node, 'p')));
    } else if (word(node, 'altChunk') || word(node, 'subDoc')) {
      record(`linked story (w:${node.localName})`, true);
    } else if (embeddedText(node)) {
      record(`embedded text (${node.nodeName})`, true);
    } else {
      for (const child of elements(node)) scanInline(child);
    }
  }
  scanInline(body);
  for (const { root, label } of stories) record(label, omittedText(root), descendants(root, 'p').length);
  let offset = 0;
  for (const paragraph of descendants(body, 'p')) {
    if (excludedParagraph(paragraph)) continue;
    const text = inlineText(paragraph, { owner: paragraph });
    const length = textLength(text);
    items.push({ paragraph, text, offset, length });
    offset += length + 1;
  }
  return { items, excluded, length: Math.max(0, offset - 1) };
}

function locate(body, stories, position, match) {
  const { items, excluded, length } = editParagraphs(body, stories);
  const hasExcludedText = [...excluded.values()].some((entry) => entry.hasText);
  const scope = () => {
    const omitted = [...excluded].map(([label, entry]) => `${label}: ${entry.paragraphs} paragraphs`).join(', ');
    return `Main-body addressable length: ${length} code points.${omitted ? ` Excluded locations: ${omitted}.` : ''}`;
  };
  if (match === undefined && hasExcludedText) {
    if (!items.length) {
      throw new Error(`No addressable main-body paragraph is available. ${scope()} Edit the excluded text in Word.`);
    }
    if (position === undefined) {
      throw new Error(`Cannot place this edit by default when excluded locations contain text. ${scope()} Pass an explicit main-body --position or edit the excluded text in Word.`);
    }
  }
  if (!items.length && match === undefined && (position === undefined || position === 0)) {
    const paragraph = element(body.ownerDocument, 'p');
    body.insertBefore(paragraph, direct(body, 'sectPr') ?? null);
    return { paragraph, start: 0, position: 0, length: 0, selectionLength: 0 };
  }
  if (match !== undefined && position === undefined) {
    const hits = [];
    for (const item of items) {
      const first = item.text.indexOf(match);
      if (first === -1) continue;
      if (hits.length || item.text.indexOf(match, first + 1) !== -1) {
        throw new Error('The selected text occurs more than once. Supply its exact --position.');
      }
      const start = textLength(item.text.slice(0, first));
      hits.push({ ...item, start, position: item.offset + start, selectionLength: textLength(match) });
    }
    if (hits.length === 1) return hits[0];
    throw new Error(`The selected text was not found in one main-body paragraph. ${scope()} Copy the exact current body text or edit an excluded location in Word.`);
  }
  const last = items.at(-1);
  const target = position ?? ((last?.offset ?? 0) + (last?.length ?? 0));
  const item = items.find(({ offset, length }) => target >= offset && target <= offset + length);
  if (!item) throw new Error(`--position is outside the document text. ${scope()} Pass a valid main-body offset or edit an excluded location in Word.`);
  const start = target - item.offset;
  const selectionLength = match === undefined ? 0 : textLength(match);
  if (match !== undefined && [...item.text].slice(start, start + selectionLength).join('') !== match) {
    throw new Error(`The selected text does not match at --position. ${scope()} Use the exact current text and offset.`);
  }
  return { ...item, start, position: target, selectionLength };
}

function editableRun(node) {
  return word(node, 'r') && !descendants(node, 'rPrChange').length &&
    elements(node).every((child) => child.namespaceURI === W && ['rPr', 't', 'tab', 'br', 'cr'].includes(child.localName));
}

function splitRun(run, offset) {
  const right = run.cloneNode(false);
  const properties = direct(run, 'rPr');
  if (properties) right.appendChild(properties.cloneNode(true));
  let remaining = offset;
  for (const child of elements(run)) {
    if (child === properties) continue;
    const text = [...inlineText(child)];
    if (remaining === 0) right.appendChild(child);
    else if (remaining < text.length) {
      const suffix = child.cloneNode(false);
      suffix.textContent = text.slice(remaining).join('');
      child.textContent = text.slice(0, remaining).join('');
      child.setAttributeNS(XML, 'xml:space', 'preserve');
      suffix.setAttributeNS(XML, 'xml:space', 'preserve');
      right.appendChild(suffix);
      remaining = 0;
    } else remaining -= text.length;
  }
  run.parentNode.insertBefore(right, run.nextSibling);
  return right;
}

function boundary(paragraph, position, edge) {
  let offset = 0;
  for (const child of elements(paragraph)) {
    const length = textLength(inlineText(child, { owner: paragraph }));
    if (!length) continue;
    if (offset === position) return child;
    if (offset + length === position && edge === 'end') return child.nextSibling;
    if (offset + length > position) {
      if (!editableRun(child)) {
        throw new Error('The position falls inside an existing revision or complex inline element. Choose a plain text run or edit in Word.');
      }
      return splitRun(child, position - offset);
    }
    offset += length;
  }
  return null;
}

function selectRuns(paragraph, start, length) {
  const end = boundary(paragraph, start + length, 'end');
  const first = boundary(paragraph, start, 'start');
  const runs = [];
  for (let child = first; child && child !== end; child = child.nextSibling) {
    if (child.nodeType === 3 && !child.data.trim()) continue;
    if (!editableRun(child)) {
      throw new Error('The range crosses a marked or complex inline element. Select plain text runs within one paragraph or edit in Word.');
    }
    runs.push(child);
  }
  if (!runs.length) throw new Error('The range has no editable text. Choose a nonempty range in one paragraph.');
  return { first, end, runs };
}

function nextId(nodes) {
  let max = -1n;
  for (const node of nodes) {
    const id = attr(node, 'id').trim();
    if (/^[+-]?[0-9]+$/.test(id)) {
      const value = BigInt(id);
      if (value > max) max = value;
    }
  }
  return String(max + 1n);
}

function mark(node, id, author, date) {
  set(node, 'id', id);
  set(node, 'author', author);
  set(node, 'date', date);
}

function addChange(body, stories, args, date) {
  const text = requireText(args.text, '--text');
  if (!text.length) throw new Error('--text is empty. Supply text for the change.');
  const author = requireAuthor(args.author);
  const inserting = args.type === 'insertion';
  const target = locate(body, stories, args.position, inserting ? undefined : text);
  const { paragraph, start, selectionLength, position } = target;
  const idNodes = [body, ...stories.map(({ root }) => root)]
    .flatMap((root) => descendants(root, '*').filter((node) =>
      REVISION_TYPES.has(node.localName) || TRACKED_RANGE.test(node.localName)));
  const wordIds = [];
  if (inserting) {
    const insertion = element(body.ownerDocument, 'ins');
    const id = nextId(idNodes);
    mark(insertion, id, author, date);
    paragraph.insertBefore(insertion, boundary(paragraph, start, 'start'));
    writeText(add(insertion, 'r'), text);
    wordIds.push(id);
  } else {
    const { first, runs } = selectRuns(paragraph, start, selectionLength);
    if (args.type === 'deletion') {
      const deletion = element(body.ownerDocument, 'del');
      const id = nextId(idNodes);
      mark(deletion, id, author, date);
      paragraph.insertBefore(deletion, first);
      for (const run of runs) {
        deletion.appendChild(run);
        for (const child of descendants(run, 't')) replaceTextNode(child, 'delText');
      }
      wordIds.push(id);
    } else {
      let id = BigInt(nextId(idNodes));
      for (const run of runs) {
        const property = direct(run, 'rPr') ?? run.insertBefore(element(body.ownerDocument, 'rPr'), run.firstChild);
        const old = property.cloneNode(true);
        const name = { bold: 'b', italic: 'i', underline: 'u' }[args.format];
        const current = direct(property, name);
        const setting = current ?? add(property, name);
        set(setting, 'val', args.format === 'underline' ? 'single' : '1');
        const change = add(property, 'rPrChange');
        mark(change, String(id), author, date);
        change.appendChild(old);
        wordIds.push(String(id++));
      }
    }
  }
  return { type: args.type, author, position, text, wordIds };
}

function commentPart(codec, parts, types) {
  const rels = Object.hasOwn(parts, MAIN_RELS)
    ? readXml(codec, parts, MAIN_RELS, REL, 'Relationships')
    : parseXml(codec, `<Relationships xmlns="${REL}"/>`, MAIN_RELS, REL, 'Relationships');
  const relationships = elements(rels);
  const matching = relationships.filter((node) => node.namespaceURI === REL &&
    node.localName === 'Relationship' && node.getAttribute('Type') === `${OFFICE_REL}comments`);
  let part = COMMENTS;
  if (matching.length > 1) throw new Error('The document has multiple comments relationships. Repair the document in Word.');
  if (matching.length) {
    const link = matching[0];
    const target = link.getAttribute('Target');
    if (link.getAttribute('TargetMode') === 'External') {
      throw new Error('The comments relationship does not name a supported local package part. Save a fresh copy in Word.');
    }
    part = packageTarget(['word'], target, 'comments');
  }
  const existing = Object.hasOwn(parts, part);
  if (matching.length && !existing) throw new Error('The comments relationship points to a missing part. Repair the document in Word.');
  if (!existing && !types) return {};
  const comments = existing
    ? readXml(codec, parts, part, W, 'comments')
    : parseXml(codec, `<w:comments xmlns:w="${W}"/>`, part, W, 'comments');
  if (!types) return { comments };
  if (!matching.length) {
    const relationship = rels.ownerDocument.createElementNS(REL, 'Relationship');
    const ids = new Set(relationships.map((node) => node.getAttribute('Id')));
    let index = 1;
    while (ids.has(`rId${index}`)) index++;
    relationship.setAttribute('Id', `rId${index}`);
    relationship.setAttribute('Type', `${OFFICE_REL}comments`);
    relationship.setAttribute('Target', 'comments.xml');
    rels.appendChild(relationship);
  }
  const overrides = elements(types).filter((node) => node.namespaceURI === TYPES &&
    node.localName === 'Override' && node.getAttribute('PartName') === `/${part}`);
  if (overrides.length > 1) throw new Error('The comments part has duplicate content types. Repair the document in Word.');
  const override = overrides[0] ?? types.ownerDocument.createElementNS(TYPES, 'Override');
  override.setAttribute('PartName', `/${part}`);
  override.setAttribute('ContentType', COMMENTS_TYPE);
  if (!overrides.length) types.appendChild(override);
  return { comments, part, rels, types };
}

function addComment(codec, parts, types, body, stories, args, date) {
  const text = requireText(args.text, '--text');
  if (!text.length) throw new Error('--text is empty. Supply the comment text.');
  const author = requireAuthor(args.author);
  const initials = requireText(args.initials ?? author.trim().split(/\s+/).slice(0, 3)
    .map((word) => ([...word][0] ?? '').toUpperCase()).join(''), '--initials');
  const { comments, part, rels } = commentPart(codec, parts, types);
  const target = locate(body, stories, args.position);
  const { paragraph, start, position } = target;
  const length = args.length ?? 0;
  if (start + length > target.length) {
    throw new Error('The comment range extends past its paragraph. Shorten --length or change --position.');
  }
  const commentIds = [body, comments, ...stories.map(({ root }) => root)]
    .flatMap((root) => descendants(root, '*').filter((node) => COMMENT_ANCHORS.has(node.localName)));
  const commentId = nextId(commentIds);
  const comment = add(comments, 'comment');
  mark(comment, commentId, author, date);
  if (initials) set(comment, 'initials', initials);
  for (const line of text.split(/\r\n|\n|\r/)) writeText(add(add(comment, 'p'), 'r'), line);

  const startMarker = element(body.ownerDocument, 'commentRangeStart');
  const endMarker = element(body.ownerDocument, 'commentRangeEnd');
  const referenceRun = element(body.ownerDocument, 'r');
  for (const marker of [startMarker, endMarker, add(referenceRun, 'commentReference')]) set(marker, 'id', commentId);
  const range = length ? selectRuns(paragraph, start, length) : null;
  const first = range ? range.first : boundary(paragraph, start, 'start');
  const end = range ? range.end : first;
  paragraph.insertBefore(startMarker, first);
  paragraph.insertBefore(endMarker, end);
  paragraph.insertBefore(referenceRun, end);
  writeXml(codec, parts, part, comments);
  writeXml(codec, parts, MAIN_RELS, rels);
  writeXml(codec, parts, CONTENT_TYPES, types);
  return { commentId, author, initials, position, length, text };
}

function listComments(codec, parts, body) {
  const { comments } = commentPart(codec, parts);
  if (!comments) return [];
  const ranges = new Map();
  const active = new Set();
  const references = new Set();
  const append = (text) => {
    for (const id of active) ranges.get(id).push(text);
  };
  function read(node) {
    if (node.namespaceURI === MC && node.localName === 'AlternateContent') return;
    if (word(node, 'commentRangeStart')) {
      const id = attr(node, 'id');
      if (!ranges.has(id)) ranges.set(id, []);
      active.add(id);
    } else if (word(node, 'commentRangeEnd')) active.delete(attr(node, 'id'));
    else if (word(node, 'commentReference')) references.add(attr(node, 'id'));
    else if (word(node, 't') || word(node, 'delText')) append(node.textContent);
    else if (word(node, 'tab') || word(node, 'ptab')) append('\t');
    else if (word(node, 'br') || word(node, 'cr')) append('\n');
    else {
      for (const child of elements(node)) read(child);
      if (word(node, 'p')) append('\n');
    }
  }
  read(body);
  return descendants(comments, 'comment').map((node, index) => {
    const commentId = attr(node, 'id') || null;
    const commentedText = ranges.get(commentId)?.join('') ?? '';
    let anchor = 'missing';
    if (active.has(commentId)) anchor = 'incomplete-range';
    else if (commentedText || (ranges.has(commentId) && !references.has(commentId))) anchor = 'range';
    else if (references.has(commentId)) anchor = 'point';
    return {
      id: index + 1, commentId,
      author: authorOf(node), date: attr(node, 'date') || null,
      initials: attr(node, 'initials') || '',
      text: descendants(node, 'p').map((paragraph) => inlineText(paragraph)).join('\n'),
      commentedText, anchor,
    };
  });
}

export async function runWordDocument(codec, command, args, bytes, { date, approved = false } = {}) {
  if (command === 'create') return createPackage(codec, args.spec, date);

  const { parts, duplicateParts } = await readPackage(codec, bytes);
  const types = checkMainPackage(codec, parts);
  const main = readXml(codec, parts, MAIN, W, 'document');
  const body = direct(main, 'body');
  if (!body) throw new Error('The document has no Word body. Use a valid .docx.');
  const base = { duplicateParts };
  if (command === 'list-changes') {
    return { result: { ...base, changes: revisions(body, codec.XMLSerializer).map(({ info }) => info) } };
  }
  if (command === 'list-comments') return { result: { ...base, comments: listComments(codec, parts, body) } };

  let result;
  if (command === 'add-change' || command === 'add-comment') {
    const stories = storyParts(codec, parts, types);
    result = command === 'add-change'
      ? { change: addChange(body, stories, args, date) }
      : { comment: addComment(codec, parts, types, body, stories, args, date) };
  }
  else {
    const changes = revisions(body, codec.XMLSerializer);
    const selected = selectChanges(changes, command, args);
    const selection = new Set(selected);
    const info = selected.map((entry) => entry.info);
    const skipped = changes.filter((entry) => !selection.has(entry)).map(({ info }) => info.id);
    if (!approved) return { result: { ...base, changes: info, skipped } };
    if (!selected.length) throw new Error('No revisions match this selection. Preview the current document to review its changes.');
    resolveChanges(changes, selected, command);
    const status = command === 'reject-change' ? 'rejected' : 'accepted';
    result = { changes: info.map((change) => ({ ...change, status })), skipped };
  }
  writeXml(codec, parts, MAIN, main);
  return { bytes: pack(codec.zipSync, parts), result: { ...base, ...result } };
}
