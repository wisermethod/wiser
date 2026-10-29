// Independently generated containers; no vendor media or signed address fixture.
export function wav(size = 52) {
  const b = Buffer.alloc(size);
  b.write('RIFF'); b.writeUInt32LE(size - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(size - 44, 40);
  for (let i = 44; i < size; i++) b[i] = i % 251;
  return b;
}
// A one-frame, one-pixel JPEG track in ISO BMFF, assembled independently of the
// downloader/writer. Every sample table refers to the actual generated sample.
export function mp4(size = 1024) {
  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const cat = (...parts) => Buffer.concat(parts);
  const box = (name, ...parts) => { const data = cat(...parts); return cat(u32(data.length + 8), Buffer.from(name), data); };
  const full = (name, flags, ...parts) => box(name, u32(flags), ...parts);
  const zeros = (n) => Buffer.alloc(n);
  const matrix = cat(...[0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));
  // Baseline grayscale JPEG. One zero DC coefficient plus EOB, padded with 1s.
  const jpeg = cat(Buffer.from([255, 216, 255, 219]), u16(67), Buffer.from([0]), Buffer.alloc(64, 1),
    Buffer.from([255, 192]), u16(11), Buffer.from([8]), u16(1), u16(1), Buffer.from([1, 1, 0x11, 0]),
    Buffer.from([255, 196]), u16(38), Buffer.from([0, 1]), zeros(15), Buffer.from([0, 0x10, 1]), zeros(15), Buffer.from([0]),
    Buffer.from([255, 218]), u16(8), Buffer.from([1, 1, 0, 0, 63, 0, 0x3f, 255, 217]));
  const ftyp = box('ftyp', Buffer.from('isom'), u32(512), Buffer.from('isommp42'));
  function movie(offset) {
    const visual = box('jpeg', zeros(6), u16(1), zeros(16), u16(1), u16(1), u32(0x480000), u32(0x480000),
      zeros(4), u16(1), zeros(32), u16(24), u16(0xffff));
    const stbl = box('stbl', full('stsd', 0, u32(1), visual),
      full('stts', 0, u32(1), u32(1), u32(1000)), full('stsc', 0, u32(1), u32(1), u32(1), u32(1)),
      full('stsz', 0, u32(0), u32(1), u32(jpeg.length)), full('stco', 0, u32(1), u32(offset)), full('stss', 0, u32(1), u32(1)));
    const minf = box('minf', full('vmhd', 1, zeros(8)), box('dinf', full('dref', 0, u32(1), full('url ', 1))), stbl);
    const mdia = box('mdia', full('mdhd', 0, zeros(8), u32(1000), u32(1000), u16(0x55c4), u16(0)),
      full('hdlr', 0, u32(0), Buffer.from('vide'), zeros(12), Buffer.from('Invented\0')), minf);
    const trak = box('trak', full('tkhd', 7, zeros(8), u32(1), u32(0), u32(1000), zeros(16), matrix, u32(0x10000), u32(0x10000)), mdia);
    return box('moov', full('mvhd', 0, zeros(8), u32(1000), u32(1000), u32(0x10000), u16(0x100), zeros(10), matrix, zeros(24), u32(2)), trak);
  }
  const moov = movie(ftyp.length + movie(0).length + 8);
  const mdat = box('mdat', jpeg);
  const padding = size - ftyp.length - moov.length - mdat.length;
  if (padding < 8) throw new Error('invented MP4 size too small');
  return cat(ftyp, moov, mdat, box('free', zeros(padding - 8)));
}
