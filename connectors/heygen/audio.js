import fs from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, parse, resolve, sep } from 'node:path';
const UPLOAD_MAX = 3000000;
const invalid = (field, reason) => ({ status: 'invalid_arguments', field, reason });

// Platform user-config location, matching gateway/src/paths.js. Screen names
// and metadata only; never open a credential or enumerate its contents.
function credentialDir() {
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'wiser');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'wiser');
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'wiser');
}

function canonicalName(path) {
  const tail = [];
  let head = resolve(path);
  for (;;) {
    try { return join(fs.realpathSync(head), ...tail.reverse()); }
    catch {
      const parent = dirname(head);
      if (parent === head) return head;
      tail.push(basename(head));
      head = parent;
    }
  }
}

const inside = (child, parent) => child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
const forbidden = (name) => /^memory$/i.test(name) || /^\.env(?:\.|$)/i.test(name);
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino;
const unchanged = (a, b) => sameIdentity(a, b) && a.size === b.size && a.nlink === b.nlink &&
  a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;

function screen(path) {
  if (!isAbsolute(path) || path.includes('\0')) throw new Error('path');
  const credential = resolve(credentialDir());
  const protectedDir = canonicalName(credential);
  // Inspect the original spelling too, including a link followed by .. .
  let here = parse(path).root;
  const ancestors = [];
  // Windows accepts both separators; elsewhere a backslash is part of a name.
  for (const component of path.slice(here.length).split(sep === '\\' ? /[\\/]/ : '/')) {
    if (!component || component === '.') continue;
    if (forbidden(component)) throw new Error('protected');
    here = resolve(here, component);
    if (inside(here, credential) || inside(here, protectedDir)) throw new Error('protected');
    const stats = fs.lstatSync(here, { bigint: true });
    if (stats.isSymbolicLink()) throw new Error('link');
    ancestors.push({ path: here, stats });
  }
  const canonical = fs.realpathSync(here);
  if (canonical.split(sep).some(forbidden) || inside(canonical, protectedDir)) throw new Error('protected');
  const stats = fs.lstatSync(canonical, { bigint: true });
  if (!stats.isFile() || stats.nlink !== 1n || !['.mp3', '.wav'].includes(extname(basename(canonical)).toLowerCase())) throw new Error('file');
  return { path: canonical, stats, ancestors };
}

export function readUpload(path) {
  let fd;
  try {
    const screened = screen(path);
    if (screened.stats.size > BigInt(UPLOAD_MAX)) return invalid('path', `file size ${screened.stats.size} exceeds ${UPLOAD_MAX} bytes`);
    if (screened.stats.size === 0n) return invalid('path', 'file must be nonempty');
    fd = fs.openSync(screened.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || !unchanged(screened.stats, opened)) return invalid('path', 'file changed');
    const bytes = Buffer.alloc(Number(opened.size) + 1);
    let read = 0;
    while (read < bytes.length) {
      const n = fs.readSync(fd, bytes, read, bytes.length - read, null);
      if (!n) break;
      read += n;
    }
    if (read !== Number(opened.size) || !unchanged(opened, fs.fstatSync(fd, { bigint: true }))) return invalid('path', 'file changed');
    const after = screen(path);
    if (after.path !== screened.path || !unchanged(opened, after.stats) ||
        screened.ancestors.some(({ path: ancestor, stats }) => !sameIdentity(stats, fs.lstatSync(ancestor, { bigint: true })))) return invalid('path', 'file changed');
    const audio = bytes.subarray(0, read);
    const wav = extname(screened.path).toLowerCase() === '.wav';
    if (wav ? !inspectWav(audio) : !isMp3(audio)) return invalid('path', 'extension and complete audio container must match');
    return { bytes: audio, media_type: wav ? 'audio/wav' : 'audio/mpeg' };
  } catch {
    return invalid('path', 'requires an unchanged, readable regular MP3 or WAV, without links or protected path components');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// Walk every RIFF chunk; speech additionally fixes format and sample-derived duration.
export function inspectWav(bytes, speech = false) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.readUInt32LE(4) + 8 !== bytes.length) return null;
  let fmt, dataSize;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) return null;
    const type = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + size;
    if (end + (size % 2) > bytes.length) return null;
    if (type === 'fmt ') {
      if (fmt || size < 16) return null;
      fmt = { format: bytes.readUInt16LE(offset + 8), channels: bytes.readUInt16LE(offset + 10),
        rate: bytes.readUInt32LE(offset + 12), byteRate: bytes.readUInt32LE(offset + 16),
        align: bytes.readUInt16LE(offset + 20), bits: bytes.readUInt16LE(offset + 22) };
    }
    if (type === 'data') { if (dataSize !== undefined) return null; dataSize = size; }
    offset = end + (size % 2);
  }
  if (!fmt || !dataSize || !fmt.channels || !fmt.rate || !fmt.bits || fmt.bits % 8 ||
      !fmt.align || fmt.align !== fmt.channels * fmt.bits / 8 || fmt.byteRate !== fmt.rate * fmt.align || dataSize % fmt.align) return null;
  if (speech && (fmt.format !== 1 || fmt.channels !== 1 || fmt.rate !== 44100 || fmt.bits !== 16)) return null;
  return { duration: dataSize / fmt.byteRate };
}

// ID3 alone is not MP3. Require complete MPEG Layer III frames after an optional ID3v2 tag.
export function isMp3(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 4) return false;
  let offset = 0, frames = 0, end = bytes.length;
  if (bytes.toString('ascii', 0, 3) === 'ID3') {
    if (bytes.length < 10 || ![2, 3, 4].includes(bytes[3]) || bytes.subarray(6, 10).some((v) => v & 128)) return false;
    offset = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]) + (bytes[3] === 4 && (bytes[5] & 16) ? 10 : 0);
    if (offset > end) return false;
  }
  if (end - offset >= 128 && bytes.toString('ascii', end - 128, end - 125) === 'TAG') end -= 128;
  while (offset < end) {
    if (offset + 4 > end || bytes[offset] !== 255 || (bytes[offset + 1] & 224) !== 224) return false;
    const version = (bytes[offset + 1] >> 3) & 3, layer = (bytes[offset + 1] >> 1) & 3;
    const br = bytes[offset + 2] >> 4, sr = (bytes[offset + 2] >> 2) & 3;
    if (version === 1 || layer !== 1 || br === 0 || br === 15 || sr === 3) return false;
    const rate = [44100, 48000, 32000][sr] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const bitrate = (version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[br] * 1000;
    const size = Math.floor((version === 3 ? 144 : 72) * bitrate / rate) + ((bytes[offset + 2] >> 1) & 1);
    if (size < 4 || offset + size > end) return false;
    offset += size; frames++;
  }
  return frames > 0;
}
