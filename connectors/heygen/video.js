// Check the ISO base media container, independent of HTTP content type. This is
// a container check, not a codec decoder or a promise about playable samples.
function boxes(bytes, start, end) {
  const out = [];
  for (let at = start; at < end;) {
    if (end - at < 8) return null;
    let size = bytes.readUInt32BE(at), header = 8;
    if (size === 1) {
      if (end - at < 16) return null;
      const wide = bytes.readBigUInt64BE(at + 8);
      if (wide > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      size = Number(wide); header = 16;
    } else if (size === 0) size = end - at;
    if (size < header || size > end - at) return null;
    out.push({ type: bytes.toString('ascii', at + 4, at + 8), start: at + header, end: at + size });
    at += size;
  }
  return out;
}
export function inspectMp4(bytes) {
  if (!Buffer.isBuffer(bytes)) return false;
  const top = boxes(bytes, 0, bytes.length);
  if (!top) return false;
  const ftyp = top.filter((v) => v.type === 'ftyp'), moov = top.filter((v) => v.type === 'moov');
  if (ftyp.length !== 1 || moov.length !== 1 || !top.some((v) => v.type === 'mdat' && v.end > v.start)) return false;
  const f = ftyp[0];
  if (f.end - f.start < 8 || (f.end - f.start) % 4) return false;
  const brands = [bytes.toString('ascii', f.start, f.start + 4)];
  for (let at = f.start + 8; at < f.end; at += 4) brands.push(bytes.toString('ascii', at, at + 4));
  if (!brands.some((v) => ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1'].includes(v))) return false;
  const movie = boxes(bytes, moov[0].start, moov[0].end);
  if (!movie || !movie.some((v) => v.type === 'mvhd' && v.end - v.start >= 100)) return false;
  const tracks = movie.filter((v) => v.type === 'trak');
  if (!tracks.length) return false;
  for (const track of tracks) {
    const children = boxes(bytes, track.start, track.end);
    if (!children || !children.some((v) => v.type === 'tkhd' && v.end - v.start >= 84)) return false;
    const media = children.find((v) => v.type === 'mdia');
    const details = media && boxes(bytes, media.start, media.end);
    if (!details || !details.some((v) => v.type === 'mdhd' && v.end - v.start >= 24) ||
        !details.some((v) => v.type === 'hdlr' && v.end - v.start >= 24) || !details.some((v) => v.type === 'minf' && v.end > v.start)) return false;
  }
  return true;
}
