/** Small ZIP boundary for folder tools. Web APIs only; no filesystem or packages.
 * The caller supplies its declared input/output cap as maxBytes. ZIP64, split,
 * encrypted and symbolic-link archives are refused. No entry is extracted to disk.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const fail = reason => { throw new Error(`ZIP refused: ${reason}.`); };
function cap(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('maxBytes must be a positive safe integer');
  return value;
}
export function archiveName(value) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f\x7f]/.test(value)) fail('an entry has an invalid name');
  const name = value.replace(/\\/g, '/');
  if (encoder.encode(name).length > 240) fail('an entry name exceeds 240 bytes');
  if (name.split('/').filter(Boolean).length > 16) fail('an entry name exceeds 16 components');
  if (name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')) fail('an entry name is absolute or contains ..');
  const normalized = name.split('/').filter(part => part && part !== '.').join('/');
  if (!normalized) fail('an entry has an empty name');
  return normalized + (name.endsWith('/') ? '/' : '');
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
async function inflate(bytes, limit) {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } })
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader(), chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); fail('expanded total exceeds 4 times the declared cap or the entry size'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export async function readZip(bytes, { maxBytes } = {}) {
  cap(maxBytes);
  if (!(bytes instanceof Uint8Array)) fail('input must be bytes');
  if (bytes.length > maxBytes) fail('input exceeds the declared size cap');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const check = (at, size) => { if (at < 0 || at + size > bytes.length) fail('archive is truncated'); };
  const u16 = at => { check(at, 2); return view.getUint16(at, true); };
  const u32 = at => { check(at, 4); return view.getUint32(at, true); };
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (u32(at) === 0x06054b50 && at + 22 + u16(at + 20) === bytes.length) { end = at; break; }
  }
  if (end < 0) fail('end record is missing');
  const count = u16(end + 10), directorySize = u32(end + 12), directory = u32(end + 16);
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count) fail('split archives are unsupported');
  if (count > 1000) fail('more than 1,000 entries');
  if (directory + directorySize !== end) fail('ZIP64 or invalid directory bounds');
  const entries = [], names = new Set(), spans = [];
  let at = directory, expanded = 0;
  for (let index = 0; index < count; index++) {
    check(at, 46);
    if (u32(at) !== 0x02014b50) fail('invalid directory entry');
    const flags = u16(at + 8), method = u16(at + 10), crc = u32(at + 16);
    const packed = u32(at + 20), size = u32(at + 24), nameLength = u16(at + 28);
    const extraLength = u16(at + 30), commentLength = u16(at + 32), local = u32(at + 42);
    if (nameLength > 240) fail('an entry name exceeds 240 bytes');
    check(at + 46, nameLength + extraLength + commentLength);
    if (flags & ~0x080e || flags & 1) fail('encrypted or unsupported flags');
    if (method !== 0 && method !== 8) fail('entry compression must be stored or deflated');
    if (u16(at + 34) || packed === 0xffffffff || size === 0xffffffff || local === 0xffffffff) fail('ZIP64 or split entries are unsupported');
    if (((u32(at + 38) >>> 16) & 0xf000) === 0xa000) fail('symbolic-link entries are unsupported');
    let raw;
    try { raw = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)); } catch { fail('entry names must be UTF-8'); }
    const name = archiveName(raw), key = name.replace(/\/$/, '');
    if (names.has(key)) fail('duplicate entry names');
    names.add(key);
    expanded += size;
    if (expanded > maxBytes * 4) fail('expanded total exceeds 4 times the declared cap');
    check(local, 30);
    if (u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method) fail('local and directory headers disagree');
    const localLength = u16(local + 26), data = local + 30 + localLength + u16(local + 28);
    check(local + 30, localLength);
    if (localLength !== nameLength || bytes.subarray(local + 30, local + 30 + localLength).some((byte, i) => byte !== bytes[at + 46 + i])) fail('local and directory names disagree');
    if (!(flags & 8) && (u32(local + 14) !== crc || u32(local + 18) !== packed || u32(local + 22) !== size)) fail('local and directory sizes disagree');
    if (data + packed > directory) fail('entry data overlaps the directory');
    spans.push([local, data + packed]);
    entries.push({ name, method, crc, packed, size, data });
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (at !== end) fail('directory size disagrees with its entries');
  spans.sort((a, b) => a[0] - b[0]);
  if (spans.some((span, i) => i && span[0] < spans[i - 1][1])) fail('entry data overlaps another entry');
  const files = [];
  for (const entry of entries) {
    const packed = bytes.subarray(entry.data, entry.data + entry.packed);
    let body;
    try { body = entry.method === 0 ? packed.slice() : await inflate(packed, entry.size); }
    catch (error) { if (error.message.startsWith('ZIP refused:')) throw error; fail('deflated data is invalid'); }
    if (body.length !== entry.size || crc32(body) !== entry.crc) fail('entry size or CRC does not match');
    if (!entry.name.endsWith('/')) files.push({ name: entry.name, bytes: body });
    else if (body.length) fail('a directory entry contains data');
  }
  const fileNames = new Set(files.map(file => file.name));
  for (const file of files) {
    const parts = file.name.split('/');
    let prefix = parts[0];
    for (let i = 1; i < parts.length; i++) {
      if (fileNames.has(prefix)) fail('a file is also used as a directory');
      prefix += '/' + parts[i];
    }
  }
  return files;
}
export async function writeZip(files, { maxBytes } = {}) {
  cap(maxBytes);
  if (!Array.isArray(files) || files.length > 1000) fail('more than 1,000 entries or invalid file list');
  const names = new Set();
  let length = 22;
  const entries = files.map(file => {
    const name = archiveName(file.name), encoded = encoder.encode(name);
    if (!(file.bytes instanceof Uint8Array) || encoded.length > 65535 || name.endsWith('/')) fail('invalid output entry');
    if (names.has(name)) fail('duplicate entry names');
    names.add(name);
    length += 76 + 2 * encoded.length + file.bytes.length;
    return { name, encoded, bytes: file.bytes, crc: crc32(file.bytes) };
  });
  if (length > maxBytes) fail('output exceeds the declared size cap');
  const bytes = new Uint8Array(length), view = new DataView(bytes.buffer);
  const u16 = (at, n) => view.setUint16(at, n, true), u32 = (at, n) => view.setUint32(at, n, true);
  let at = 0;
  for (const entry of entries) {
    entry.offset = at;
    u32(at, 0x04034b50); u16(at + 4, 20); u16(at + 6, 0x800); u16(at + 12, 33);
    u32(at + 14, entry.crc); u32(at + 18, entry.bytes.length); u32(at + 22, entry.bytes.length); u16(at + 26, entry.encoded.length);
    bytes.set(entry.encoded, at + 30); bytes.set(entry.bytes, at + 30 + entry.encoded.length);
    at += 30 + entry.encoded.length + entry.bytes.length;
  }
  const directory = at;
  for (const entry of entries) {
    u32(at, 0x02014b50); u16(at + 4, 20); u16(at + 6, 20); u16(at + 8, 0x800); u16(at + 14, 33);
    u32(at + 16, entry.crc); u32(at + 20, entry.bytes.length); u32(at + 24, entry.bytes.length); u16(at + 28, entry.encoded.length); u32(at + 42, entry.offset);
    bytes.set(entry.encoded, at + 46); at += 46 + entry.encoded.length;
  }
  u32(at, 0x06054b50); u16(at + 8, entries.length); u16(at + 10, entries.length); u32(at + 12, at - directory); u32(at + 16, directory);
  return bytes;
}
