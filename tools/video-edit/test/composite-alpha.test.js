import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alphaOracle, protectedSamples, rational, roundHalfUp } from './alpha-oracle.js';
import { alphaClock, alphaEditList, clock, inspect, text } from '../scripts/evidence-media.js';

const tool = resolve(dirname(fileURLToPath(import.meta.url)), '..'), entry = join(tool, 'scripts/edit.js');
const prefix = '.wiser-video-composite-alpha-';
let controlName = '';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const id = p => ({ bytes: statSync(p).size, sha256: hash(readFileSync(p)) });
const json = p => JSON.parse(readFileSync(p, 'utf8'));
function temp(fn) { const d = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-video-alpha-test-'))); try { return fn(d); } finally { rmSync(d, { recursive: true, force: true }); } }
function run(bin, args, extra = {}) { return spawnSync(bin, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 128 * 1024 * 1024, ...extra }); }
function ff(args, binary = false) {
  const r = run('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-filter_threads', '1', ...args], { encoding: binary ? null : 'utf8' });
  assert.equal(r.status, 0, r.stderr?.toString()); return r.stdout;
}
function probe(p) { const r = run('ffprobe', ['-v', 'error', '-show_streams', '-show_frames', '-of', 'json', p]); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); }
// Copied from evidence.test.js: moving numbered luma, high-frequency Cb/Cr.
function fixture(d, name, { width = 16, height = 16, count = 3, rate = '30/1', timescale = '30', seed = 17, audio = false } = {}) {
  const size = width * height * 3 / 2, bytes = Buffer.alloc(size * count), raw = join(d, `${name}.yuv`);
  for (let n = 0; n < count; n++) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) bytes[n * size + y * width + x] = 16 + (seed + n * 23 + y * 7 + x * 3) % 220;
    for (let bit = 0; bit < 8; bit++) bytes.fill(n & 1 << bit ? 220 : 30, n * size + bit * 4, n * size + bit * 4 + 4);
    for (let c = 0; c < width * height / 4; c++) { bytes[n * size + width * height + c] = 16 + (c * 7 + n * 17 + seed) % 224; bytes[n * size + width * height * 5 / 4 + c] = 16 + (c * 11 + n * 13 + seed) % 224; }
  }
  writeFileSync(raw, bytes);
  const path = join(d, `${name}.mp4`);
  ff(['-f', 'rawvideo', '-pixel_format', 'yuv420p', '-video_size', `${width}x${height}`, '-framerate', rate, '-i', raw,
    ...(audio ? ['-f', 'lavfi', '-i', 'sine=frequency=997:sample_rate=48000:d=1'] : []), '-map', '0:v:0', ...(audio ? ['-map', '1:a:0', '-c:a', 'pcm_s16le'] : []),
    '-frames:v', String(count), '-c:v', 'libx264', '-crf', '0', '-threads:v', '1', '-bf', '0', '-x264-params', 'b-adapt=0:scenecut=0',
    '-vf', 'setsar=1,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-video_track_timescale', timescale, '-use_editlist', '0', path]);
  return path;
}
const rawYUV = p => ff(['-noautorotate', '-i', p, '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-pix_fmt', 'yuv420p', '-c:v', 'rawvideo', '-threads:v', '1', '-f', 'rawvideo', 'pipe:1'], true);
const rawRGBA = p => ff(['-noautorotate', '-i', p, '-pix_fmt', 'rgba', '-c:v', 'rawvideo', '-threads:v', '1', '-f', 'rawvideo', 'pipe:1'], true);
function pixel(rgba, width, x, y, colour, a) { rgba.set([...colour, a], (y * width + x) * 4); }
function pattern(width, height, n, box = false) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const a = box && x >= 2 && y >= 2 && x < width - 2 && y < height - 2 ? 127 : 0;
    pixel(rgba, width, x, y, [(x * 37 + n * 71) % 256, (y * 51 + n * 19) % 256, (x * y * 13 + n * 47) % 256], a);
  }
  // A moving odd-coordinate glyph with holes; antialias codes span blocks.
  for (let y = 3; y < height - 3; y++) for (let x = 3; x < width - 3; x++) {
    if ((x + y + n) % 4 === 0 || x === 3 + n % 3) pixel(rgba, width, x, y, [231 - n * 13, 41 + y * 3, 193 - x * 5], [1,127,128,254,255][(x + y + n) % 5]);
  }
  pixel(rgba, width, width - 1, height - 1, [255,255,255], 255);
  pixel(rgba, width, 0, height - 1, [20,20,20], 128);
  pixel(rgba, width, width - 1, 0, [0,0,0], 254);
  return rgba;
}
function layer(d, name, frames, { width = 16, height = 16, first = 1 } = {}) {
  const directory = join(d, name); mkdirSync(directory);
  for (let n = 0; n < frames.length; n++) {
    const raw = join(d, `${name}-${n}.rgba`), png = join(directory, `frame_${String(first + n).padStart(6, '0')}.png`);
    writeFileSync(raw, frames[n]);
    ff(['-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${width}x${height}`, '-i', raw, '-frames:v', '1', '-c:v', 'png', '-pix_fmt', 'rgba', '-threads:v', '1', png]);
    assert.deepEqual(rawRGBA(png), frames[n], 'PNG encoder preserves straight RGBA bytes');
    rmSync(raw);
  }
  manifest(directory);
  return directory;
}
function manifest(directory) {
  const names = readdirSync(directory).filter(n => /^frame_\d{6}\.png$/.test(n)).sort();
  writeFileSync(join(directory, 'frames.sha256'), names.map(n => `${hash(rawRGBA(join(directory, n)))}  ${n}\n`).join(''));
}
function args(base, directory, output, first = 1) {
  const o = { base, 'base-sha256': id(base).sha256, layer: directory, 'layer-manifest-sha256': id(join(directory, 'frames.sha256')).sha256, 'layer-first-index': first, 'layer-alpha': 'straight', 'layer-colour': 'bt709', output };
  return ['composite-alpha', ...Object.entries(o).flatMap(([k,v]) => [`--${k}`, String(v)])];
}
function replaceFlag(a, flag, value) { a = [...a]; a[a.indexOf(flag) + 1] = String(value); return a; }
function success(a, program = entry, extra = {}) { const r = run(process.execPath, [program, ...a], extra); assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); return JSON.parse(r.stdout); }
function refuse(d, a, pattern = /Error:/, program = entry, extra = {}) {
  const before = readdirSync(d).sort(), r = run(process.execPath, [program, ...a], extra);
  assert.equal(r.status, 1, r.stderr); assert.equal(r.stdout, ''); assert.match(r.stderr, pattern);
  const output=a[a.indexOf('--output') + 1];
  assert.ok(typeof output !== 'string' || !existsSync(output), 'no output on refusal');
  assert.deepEqual(readdirSync(d).sort(), before, 'ordinary refusal removes its own staging'); return r;
}
function complete(result) {
  const c = json(result.completion);
  assert.deepEqual({ schema: c.schema, version: c.version, complete: c.complete }, { schema: 'video-composite-alpha-complete', version: 1, complete: true });
  assert.deepEqual(Object.keys(c.files).sort(), ['receipt.json', 'segment.mp4']);
  for (const [file, expected] of Object.entries(c.files)) assert.deepEqual(id(join(result.output, file)), expected);
  assert.deepEqual(readdirSync(result.output).sort(), ['complete.json', 'receipt.json', 'segment.mp4']);
  assert.deepEqual(id(result.receipt), result.record_identity);
}
function mutant(d, name, file, change) {
  controlName = name;
  const copy = join(d, name); mkdirSync(copy); cpSync(join(tool, 'scripts'), join(copy, 'scripts'), { recursive: true }); writeFileSync(join(copy, 'package.json'), '{"type":"module"}');
  patch(join(copy, 'scripts', file), change, name); return join(copy, 'scripts/edit.js');
}
function patch(file, change, name = file) { const original = readFileSync(file, 'utf8'), updated = change(original); assert.notEqual(updated, original, `mutation applied: ${name}`); writeFileSync(file, updated); }
function replace(needle, value) { return s => { assert.ok(s.includes(needle), `mutation anchor: ${needle}`); return s.replace(needle, value); }; }
function disableVerifier(program) { patch(join(dirname(program), 'composite-alpha.js'), replace('mismatch = verifyFrame(actual.value, baseFrame.value, layer, b.width, b.height)', 'mismatch = null')); }
function blendMutant(d, name, body) {
  const p = mutant(d, name, 'alpha-blend.js', s => {
    const renamed = s.replace(/export function composeAlpha\(/, 'function originalComposeAlpha(');
    assert.notEqual(renamed, s, 'exported blender anchor');
    return renamed + `\nexport function composeAlpha(base,width,height,layer){${body}}\n`;
  }); disableVerifier(p); return p;
}
function oracleCheck(base, directory, result, first = 1, protectedOnly = false) {
  const b = probe(base), v = probe(result.segment), bs = b.streams[0], vs = v.streams[0];
  assert.equal(bs.pix_fmt, 'yuv420p'); assert.equal(vs.pix_fmt, 'yuv420p');
  const size = bs.width * bs.height * 3 / 2, src = rawYUV(base), out = rawYUV(result.segment);
  assert.equal(out.length, src.length, 'frame count and native planar size');
  for (let n = 0; n < src.length / size; n++) {
    const rgba = rawRGBA(join(directory, `frame_${String(first + n).padStart(6, '0')}.png`));
    const baseFrame = src.subarray(n * size, (n + 1) * size), actual = out.subarray(n * size, (n + 1) * size);
    const expected = alphaOracle(baseFrame, bs.width, bs.height, rgba), mask = protectedSamples(bs.width, bs.height, rgba);
    for (let at = 0; at < size; at++) if (!protectedOnly || mask[at]) assert.equal(actual[at], protectedOnly ? baseFrame[at] : expected[at], `${protectedOnly ? 'protected' : 'policy/mapping'} sample frame=${n} plane=${at < bs.width * bs.height ? 'Y' : at < bs.width * bs.height * 5/4 ? 'Cb' : 'Cr'} offset=${at}`);
  }
  for (const k of ['width','height','r_frame_rate','time_base']) assert.equal(vs[k], bs[k], `base ${k} kept`);
  assert.deepEqual(v.frames.map(f => [f.pts,f.duration]), b.frames.map(f => [f.pts,f.duration]), 'base grid kept');
}
function setup(d, { count = 3, first = 1, width = 16, height = 16, ...opts } = {}) {
  const base = fixture(d, 'base', { count, width, height, ...opts });
  const directory = layer(d, 'frames', Array.from({ length: count }, (_, n) => pattern(width,height,n,n % 2 === 0)), { first, width, height });
  return { base, directory, a: args(base, directory, join(d, 'out'), first) };
}
function caught(fn, message) {
  let failure;
  assert.throws(()=>{try{fn();}catch(error){failure=error;throw error;}}, { code: 'ERR_ASSERTION', ...(message ? { message } : {}) });
  assert.doesNotMatch(failure.message,/SyntaxError|ReferenceError|mutation anchor/,'control must fail a behavioral assertion, not break its scripts');
  console.log(`CONTROL ${controlName}: assertion ${failure.operator} failed as required${message ? ` (${message})` : ''}`);
}

test('AL1: sequence layout, first 1 and 0, moving ordinal 0/interior/last, fractional grid', () => temp(d => {
  const {base,directory,a} = setup(d, { rate: '30000/1001', timescale: '30000', count: 5 });
  const r = success(a); oracleCheck(base,directory,r); complete(r);
  assert.equal(probe(r.segment).streams[0].time_base,'1/30000');
  const zero = layer(d,'zero',Array.from({length:5},(_,n)=>pattern(16,16,n)),{first:0});
  oracleCheck(base,zero,success(args(base,zero,join(d,'zero-out'),0)),0);
  // Shift both construction and read-back layer lookup so the production
  // verifier agrees with the bad mapping. Only the external oracle catches it.
  const p = mutant(d,'first-plus-n-plus-one','composite-alpha.js',s => s.replaceAll('rgba(pngs[count], pixels * 4, hashes[count]', 'rgba(pngs[(count + 1) % pngs.length], pixels * 4, hashes[(count + 1) % pngs.length]').replaceAll('rgba(pngs[n], pixels * 4, hashes[n]', 'rgba(pngs[(n + 1) % pngs.length], pixels * 4, hashes[(n + 1) % pngs.length]'));
  const bad = success(replaceFlag(a,'--output',join(d,'shifted')),p);
  caught(()=>oracleCheck(base,directory,bad),/policy\/mapping sample frame=0/);
}));

test('AL2: every protected Y/Cb/Cr sample, holes, odd glyphs, isolated edges, chroma texture; spill controls', () => temp(d => {
  const {base,directory,a}=setup(d), r=success(a); oracleCheck(base,directory,r,1,true);
  for (const [name,at] of [['luma',0],['chroma',16*16]]) {
    const p=blendMutant(d,`spill-${name}`,`const out=originalComposeAlpha(base,width,height,layer);out[${at}]^=1;return out;`);
    const bad=success(replaceFlag(a,'--output',join(d,`out-${name}`)),p);
    caught(()=>oracleCheck(base,directory,bad,1,true),/protected sample frame=0/);
  }
}));

// These deliberately faulty blenders are used only in copied scripts. The
// oracle above never imports them. Each changes one policy choice.
const faultyBlend = mode => `
const out=Buffer.from(base),p=width*height;
const kr=${mode === '601' ? '.299' : '.2126'},kb=${mode === '601' ? '.114' : '.0722'},kg=1-kr-kb;
const conv=(r,g,b)=>{const y=(kr*r+kg*g+kb*b)/255;return [16+219*y,128+112*(b/255-y)/(1-kb),128+112*(r/255-y)/(1-kr)]};
const rnd=x=>${mode === 'down' ? 'Math.floor(x+1e-10)' : 'Math.floor(x+.5)'};
for(let i=0;i<p;i++){const a=layer[4*i+3]/255;if(!a)continue;const c=conv(layer[4*i],layer[4*i+1],layer[4*i+2]);out[i]=rnd((1-a)*base[i]+${mode === 'conv-alpha' ? 'conv(a*layer[4*i],a*layer[4*i+1],a*layer[4*i+2])[0]' : 'a*c[0]'});}
for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2){const ids=[y*width+x,y*width+x+1,(y+1)*width+x,(y+1)*width+x+1];const aa=ids.reduce((s,i)=>s+layer[4*i+3]/255,0)/4;if(!aa)continue;for(let plane=1;plane<=2;plane++){const at=p+(plane-1)*p/4+y/2*width/2+x/2;const sum=ids.reduce((s,i)=>{const a=layer[4*i+3]/255;return s+${mode === 'mean' ? 'conv(layer[4*i],layer[4*i+1],layer[4*i+2])[plane]' : mode === 'conv-alpha' ? 'conv(a*layer[4*i],a*layer[4*i+1],a*layer[4*i+2])[plane]' : 'a*conv(layer[4*i],layer[4*i+1],layer[4*i+2])[plane]'}},0)/4;out[at]=rnd(sum+${mode === 'mean' ? '0' : '(1-aa)*base[at]'});}}
return out;`;

test('AL3: alpha 0/1/127/128/254/255, AA/box/no box/block transitions, one of four opaque, exact half; arithmetic controls', () => temp(d => {
  assert.equal(roundHalfUp(rational(257,2)),129);
  const half=alphaOracle(Buffer.from([16,16,16,16,129,144]),2,2,Buffer.from([20,20,20,255,20,20,20,255,9,8,7,0,3,2,1,0]));
  assert.equal(half[4],129,'worked 128.5 half stores 129');
  fixture(d,'base',{count:3}); const raw=readFileSync(join(d,'base.yuv'));
  // Exact halves and a 16-code chroma contrast occur in real encoded fixtures.
  raw[256]=129; raw[320]=129; raw[257]=144; raw[321]=144;
  raw[13]=255; raw[14]=0; raw[262]=0; raw[326]=255;
  writeFileSync(join(d,'half.yuv'),raw);
  const halfBase=join(d,'half.mp4');
  ff(['-f','rawvideo','-pixel_format','yuv420p','-video_size','16x16','-framerate','30','-i',join(d,'half.yuv'),'-c:v','libx264','-crf','0','-threads:v','1','-bf','0','-vf','setsar=1,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv','-video_track_timescale','30','-use_editlist','0',halfBase]);
  const frames=[pattern(16,16,0,true),pattern(16,16,1),pattern(16,16,2)];
  for(const f of frames){for(let y=0;y<2;y++)for(let x=0;x<4;x++)pixel(f,16,x,y,[20,20,20],0);pixel(f,16,0,0,[20,20,20],255);pixel(f,16,1,0,[20,20,20],255);pixel(f,16,2,0,[20,20,20],255);}
  [0,1,127,128,254,255].forEach((a,x)=>pixel(frames[0],16,x+4,1,[23,171,219],a));
  const directory=layer(d,'frames',frames), a=args(halfBase,directory,join(d,'out')), r=success(a);
  oracleCheck(halfBase,directory,r);
  assert.equal(rawYUV(r.segment)[256],129,'encoded exact half');
  assert.equal(rawYUV(r.segment)[257],140,'one opaque grey plus three clear over Cb=144');
  assert.equal(rawYUV(r.segment)[13],255,'protected luma outside TV range is not clipped');
  assert.equal(rawYUV(r.segment)[262],0,'protected chroma outside TV range is not clipped');
  const associated=blendMutant(d,'premultiplied-association','const changed=Buffer.from(layer);for(let i=0;i<width*height;i++)for(let c=0;c<3;c++)changed[4*i+c]=Math.round(changed[4*i+c]*changed[4*i+3]/255);return originalComposeAlpha(base,width,height,changed);');
  caught(()=>oracleCheck(halfBase,directory,success(replaceFlag(a,'--output',join(d,'associated')),associated)),/policy\/mapping/);
  for(const mode of ['mean','conv-alpha','down']) {
    const p=blendMutant(d,`arithmetic-${mode}`,faultyBlend(mode));
    const bad=success(replaceFlag(a,'--output',join(d,mode)),p);
    caught(()=>oracleCheck(halfBase,directory,bad),/policy\/mapping/);
    if(mode==='down')caught(()=>assert.equal(rawYUV(bad.segment)[256],129,'exact-half rounding'),/exact-half rounding/);
  }
}));

test('AL4: clear frame between visible frames, no hold, all-clear identity, poisoned RGB invariance', () => temp(d => {
  const base=fixture(d,'base'), frames=[pattern(16,16,0),Buffer.alloc(16*16*4),pattern(16,16,2)], directory=layer(d,'frames',frames), a=args(base,directory,join(d,'out')), r=success(a);
  oracleCheck(base,directory,r); const src=rawYUV(base), actual=rawYUV(r.segment);
  assert.deepEqual(actual.subarray(384,768),src.subarray(384,768),'all-zero middle frame copies base');
  const poison=frames.map(f=>{f=Buffer.from(f);for(let i=0;i<f.length;i+=4)if(!f[i+3]){f[i]=255;f[i+1]=17;f[i+2]=209;}return f;});
  const pd=layer(d,'poison',poison), pr=success(args(base,pd,join(d,'poison-out')));
  assert.deepEqual(rawYUV(pr.segment),actual,'transparent RGB contributes no sample');
  const clear=layer(d,'clear',Array.from({length:3},()=>Buffer.alloc(1024))), cr=success(args(base,clear,join(d,'clear-out')));
  assert.deepEqual(rawYUV(cr.segment),src,'wholly transparent sequence is native base');
  const clearPoison=layer(d,'clear-poison',Array.from({length:3},()=>Buffer.from(poison[1]))), cp=success(args(base,clearPoison,join(d,'clear-poison-out')));
  assert.deepEqual(rawYUV(cp.segment),src);
  const p=mutant(d,'hold-previous-layer','composite-alpha.js',s=>s.replace('let count = 0;','let count = 0, previousLayer;').replace('await writeFrame(writer, composeAlpha(frame, b.width, b.height, layer), encoder);','const visible=layer.some((v,i)=>i%4===3&&v); const used=visible ? layer : previousLayer ?? layer; previousLayer=used; await writeFrame(writer, composeAlpha(frame, b.width, b.height, used), encoder);'));
  disableVerifier(p); const bad=success(replaceFlag(a,'--output',join(d,'held')),p);
  caught(()=>oracleCheck(base,directory,bad),/policy\/mapping sample frame=1/);
}));

function profile(base,result) {
  const s=probe(result.segment).streams[0], r=json(result.receipt);
  assert.equal(s.codec_name,'h264'); assert.equal(s.pix_fmt,'yuv420p'); assert.equal(s.sample_aspect_ratio,'1:1');
  for(const k of ['color_space','color_transfer','color_primaries'])assert.equal(s[k],'bt709'); assert.equal(s.color_range,'tv');
  assert.equal(readFileSync(result.segment).includes(Buffer.from('elst')),false,'no MP4 edit list');
  const settings=r.encoder.settings;
  for(const [k,v] of [['-c:v','libx264'],['-preset','medium'],['-crf','0'],['-threads:v','1'],['-bf','0'],['-pix_fmt','yuv420p'],['-movflags','+faststart'],['-use_editlist','0'],['-map_metadata','-1'],['-fflags','+bitexact'],['-flags:v','+bitexact'],['-video_track_timescale',probe(base).streams[0].time_base.split('/')[1]]])assert.equal(settings[settings.indexOf(k)+1],v,k);
  assert.equal(settings[settings.indexOf('-i')+1],'composite.fifo'); assert.equal(settings.at(-1),'segment.mp4');
  const trace=run('ffmpeg',['-v','verbose','-i',result.segment,'-map','0:v:0','-c:v','copy','-bsf:v','trace_headers','-f','null','-']);
  assert.equal(trace.status,0); assert.match(trace.stderr,/qpprime_y_zero_transform_bypass_flag\s+1\s*=\s*1/,'H.264 lossless transform bypass');
}
test('AL5: lossless encoder profile/grid and all samples; CRF18 and verifier-bypass controls', () => temp(d => {
  const {base,directory,a}=setup(d), r=success(a); profile(base,r); oracleCheck(base,directory,r);
  const lossy=mutant(d,'crf18','composite-alpha.js',replace("'-crf', '0'","'-crf', '18'"));
  refuse(d,replaceFlag(a,'--output',join(d,'lossy')),/independent readback .*sample mismatch/,lossy);
  const bypass=blendMutant(d,'verifier-null-with-blend-fault','const out=originalComposeAlpha(base,width,height,layer);out[width*height-1]^=1;return out;');
  caught(()=>oracleCheck(base,directory,success(replaceFlag(a,'--output',join(d,'bypass')),bypass)),/policy\/mapping/);
}));

function receiptCheck(base,directory,result,first=1) {
  complete(result); const r=json(result.receipt), b=probe(base), size=b.streams[0].width*b.streams[0].height*3/2;
  assert.equal(r.schema,'video-composite-alpha'); assert.equal(r.version,1); assert.equal(r.tool_version,'0.4.0');
  assert.deepEqual(r.policy,{version:'composite-alpha-policy/1',support:'composite-alpha-support/1',alpha:'straight',colour:'bt709',blend:"Y'CbCr: luma per pixel, chroma box filter of the premultiplied blend per 2x2 block",rounding:'once, half up, exact integers',clip:'none'});
  assert.deepEqual(r.inputs.base,{path:base,expected_sha256:id(base).sha256,before:id(base),after:id(base)});
  assert.equal(r.inputs.layer.directory,directory); assert.equal(r.inputs.layer.first_index,first);
  const mi=id(join(directory,'frames.sha256')); assert.deepEqual(r.inputs.layer.manifest,{expected_sha256:mi.sha256,before:mi,after:mi});
  assert.deepEqual(r.inputs.layer.frames,Array.from({length:b.frames.length},(_,ordinal)=>{const file=`frame_${String(first+ordinal).padStart(6,'0')}.png`;return {ordinal,file,...id(join(directory,file)),decoded_rgba_sha256:hash(rawRGBA(join(directory,file)))};}));
  assert.deepEqual(r.clocks,{base:{stream:b.streams[0],frames:b.frames.length,first_pts:String(b.frames[0].pts),edit_list:'none'},rate:b.streams[0].r_frame_rate,time_base:b.streams[0].time_base});
  assert.deepEqual(r.mapping,{first_index:first,rule:'output ordinal n = layer frame_{first_index+n} over base frame n',frames:b.frames.length});
  for(const bin of ['ffmpeg','ffprobe'])assert.equal(r.encoder[bin],run(bin,['-version']).stdout);
  assert.deepEqual(r.decoder.pixel_formats,{base:'yuv420p',layer:'rgba',output:'yuv420p'});
  assert.deepEqual(Object.keys(r.decoder.input_arguments).sort(),['base','layer','output']);
  for(const a of Object.values(r.decoder.input_arguments)){assert.equal(a[0],'-noautorotate');assert.ok(a.includes('file,pipe'));}
  assert.match(r.decoder.verification,/separate new base\/layer\/output FFmpeg decodes/);
  assert.deepEqual(r.output,{file:'segment.mp4',identity:id(result.segment)});
  assert.deepEqual(r.readback.checks,['silent-intermediate','base-size-rate-clock-count','layer-decoded-rgba-manifest','outside-luma-support-equal','outside-chroma-support-equal','every-policy-sample-equal','sources-unchanged','layer-listing-unchanged']);
  assert.equal(r.readback.frames,b.frames.length); const decoded=rawYUV(result.segment);
  assert.deepEqual(r.readback.frame_sha256,Array.from({length:b.frames.length},(_,n)=>hash(decoded.subarray(n*size,(n+1)*size))));
  assert.equal(result.ok,true); assert.deepEqual(result.operations,['composite-alpha']); assert.equal(result.frames,b.frames.length); assert.equal(result.fps,r.clocks.rate);
  assert.equal(result.policy,r.policy.version);assert.equal(result.support,r.policy.support); assert.deepEqual({bytes:result.bytes,sha256:result.sha256},id(result.segment));
}
test('AL6: complete versioned receipt, every source/media/record/marker identity read back', () => temp(d => {
  const {base,directory,a}=setup(d); receiptCheck(base,directory,success(a));
}));

function actual(bin) { const r=run('/usr/bin/which',[bin]); assert.equal(r.status,0);return r.stdout.trim(); }
function wrapper(d,name,bin,source) {const dir=join(d,name);mkdirSync(dir);writeFileSync(join(dir,bin),`#!${process.execPath}\n${source}`,{mode:0o755});return {env:{...process.env,PATH:dir+':'+process.env.PATH}};}
function forward(binary,after='') {return `const a=process.argv.slice(2),r=require('node:child_process').spawnSync(${JSON.stringify(binary)},a,{stdio:'inherit'});${after}process.exit(r.status??1);`;}
function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
function stuckPeerReadback(d, program = entry) {
  const { base, a } = setup(d, { count: 1 }), ffmpeg = actual('ffmpeg');
  const count = join(d, 'base-decodes'), ready = join(d, 'base-mid-frame'), pids = join(d, 'stand-in-pids');
  for (const [file, value] of [[count, '0'], [ready, ''], [pids, '']]) writeFileSync(file, value);
  const extra = wrapper(d, 'stuck-readback', 'ffmpeg', `
const fs=require('node:fs'),argv=process.argv.slice(2),input=argv[argv.indexOf('-i')+1];
fs.appendFileSync(${JSON.stringify(pids)},process.pid+'\\n');
if(argv.at(-1)==='pipe:1'&&input===${JSON.stringify(base)}){
  const n=Number(fs.readFileSync(${JSON.stringify(count)},'utf8'))+1;fs.writeFileSync(${JSON.stringify(count)},String(n));
  if(n===2){
    process.stdout.write(Buffer.alloc(1),()=>fs.writeFileSync(${JSON.stringify(ready)},'mid-frame'));
    setInterval(()=>{},1000);return;
  }
}
if(argv.at(-1)==='pipe:1'&&input?.endsWith('/segment.mp4')){
  const timer=setInterval(()=>{if(fs.readFileSync(${JSON.stringify(ready)},'utf8')==='mid-frame'){clearInterval(timer);process.stdout.write(Buffer.alloc(1),()=>{fs.writeFileSync(${JSON.stringify(ready)},'output-failed');process.exit(77);});}},2);return;
}
${forward(ffmpeg)}`);
  delete extra.env.NODE_OPTIONS;
  const before = readdirSync(d).sort(), tracked = () => readFileSync(pids, 'utf8').trim().split('\n').filter(Boolean).map(Number);
  try {
    const r = run(process.execPath, [program, ...a], { ...extra, timeout: 30000, killSignal: 'SIGKILL' });
    assert.equal(r.error?.code, undefined, 'read-back must settle within the test\'s 30000 ms bound');
    assert.equal(r.status, 1, r.stderr); assert.equal(r.stdout, '');
    assert.match(r.stderr, /decoder returned a partial frame/);
    assert.doesNotMatch(r.stderr, /\n\s+at |UnhandledPromiseRejection|unhandled.rejection|node:internal/i);
    assert.equal(readFileSync(count, 'utf8'), '2', 'fault occurs only in read-back');
    assert.equal(readFileSync(ready, 'utf8'), 'output-failed', 'output fails while base is stuck mid-frame');
    assert.ok(!existsSync(a[a.indexOf('--output') + 1]), 'no output on refusal');
    assert.deepEqual(readdirSync(d).sort(), before, 'refusal removes its staging sibling');
    assert.ok(tracked().length > 0, 'stand-in process IDs were recorded');
    for (const pid of tracked()) assert.equal(alive(pid), false, `stand-in ${pid} must be gone`);
  } finally {
    // A failing control must not leave the deliberately stuck decoder alive.
    for (const pid of tracked()) if (alive(pid)) process.kill(pid, 'SIGKILL');
    const deadline = Date.now() + 1000;
    while (tracked().some(alive) && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
    assert.ok(tracked().every(pid => !alive(pid)), 'test cleanup leaves no stand-in alive');
  }
}
test('N1 stuck peer: partial output failure kills the nonclosing base decoder and removes staging within 30 s', () => temp(d => {
  stuckPeerReadback(d);
}));
test('N1 control: removing the read-back kills fails the same stuck-peer test at its 30 s bound', () => temp(d => {
  const program = mutant(d, 'readback-without-kill', 'composite-alpha.js', replace(
    "verifyBase.child.kill('SIGKILL'); verifyOutput.child.kill('SIGKILL');", 'void 0;'));
  assert.throws(() => stuckPeerReadback(d, program), { code: 'ERR_ASSERTION', message: /30000 ms bound/, actual: 'ETIMEDOUT' });
  console.log('CONTROL readback-without-kill: ETIMEDOUT at the 30000 ms bound as required');
}));
test('R1 readback: partial output decode while base is mid-frame refuses cleanly in default rejection mode', () => temp(d => {
  const { base, a } = setup(d, { count: 1 }), ffmpeg = actual('ffmpeg');
  const count = join(d, 'base-decodes'), ready = join(d, 'base-mid-frame'), settled = join(d, 'base-read-settled');
  writeFileSync(count, '0'); writeFileSync(ready, ''); writeFileSync(settled, '');
  const extra = wrapper(d, 'partial-readback', 'ffmpeg', `
const fs=require('node:fs'),argv=process.argv.slice(2),input=argv[argv.indexOf('-i')+1];
if(argv.at(-1)==='pipe:1'&&input===${JSON.stringify(base)}){
  const n=Number(fs.readFileSync(${JSON.stringify(count)},'utf8'))+1;fs.writeFileSync(${JSON.stringify(count)},String(n));
  if(n===2){
    process.stdout.write(Buffer.alloc(1),()=>fs.writeFileSync(${JSON.stringify(ready)},'mid-frame'));
    const timer=setInterval(()=>{if(fs.readFileSync(${JSON.stringify(ready)},'utf8')==='output-failed'){clearInterval(timer);setTimeout(()=>{fs.writeFileSync(${JSON.stringify(settled)},'settled');process.stdout.end(Buffer.alloc(383));},100);}},2);return;
  }
}
if(argv.at(-1)==='pipe:1'&&input?.endsWith('/segment.mp4')){
  const timer=setInterval(()=>{if(fs.readFileSync(${JSON.stringify(ready)},'utf8')==='mid-frame'){clearInterval(timer);process.stdout.write(Buffer.alloc(1),()=>{fs.writeFileSync(${JSON.stringify(ready)},'output-failed');process.exit(77);});}},2);return;
}
${forward(ffmpeg)}`);
  // No --unhandled-rejections flag or NODE_OPTIONS override of Node's default.
  delete extra.env.NODE_OPTIONS;
  const r = refuse(d, a, /decoder returned a partial frame/, entry, extra);
  assert.equal(readFileSync(count, 'utf8'), '2', 'fault occurs in read-back, after construction');
  assert.equal(readFileSync(ready, 'utf8'), 'output-failed', 'base had an incomplete frame before output failed');
  assert.equal(readFileSync(settled, 'utf8'), '', 'failed output decode kills base before its delayed frame completion');
  assert.doesNotMatch(r.stderr, /\n\s+at |UnhandledPromiseRejection|unhandled.rejection|node:internal/i);
}));
test('R1 paths: absent layer, absent parent and nondirectory parent use the canonicalization refusal before probes/staging', () => temp(d => {
  const { a } = setup(d, { count: 1 }), starts = join(d, 'ffmpeg-starts'); writeFileSync(starts, '');
  const extra = wrapper(d, 'path-ffmpeg-tripwire', 'ffmpeg', `require('node:fs').appendFileSync(${JSON.stringify(starts)},'started');process.exit(99);`);
  const program = mutant(d, 'path-stage-tripwire', 'composite-alpha.js', replace(
    "stage = mkdtempSync(join(dirname(output), '.wiser-video-composite-alpha-'));", "throw new Error('STAGING REACHED');"));
  const file = join(d, 'regular-layer'); writeFileSync(file, 'a file');
  for (const path of [join(d, 'absent-layer'), join(d, 'absent-parent', 'frames'), join(file, 'frames')]) {
    const request = replaceFlag(a, '--layer', path);
    refuse(d, request, /path cannot be canonicalized or its parent does not exist/, entry, extra);
    refuse(d, request, /path cannot be canonicalized or its parent does not exist/, program, extra);
  }
  refuse(d, replaceFlag(a, '--layer', file), /layer must be an unlinked directory/, entry, extra);
  assert.equal(readFileSync(starts, 'utf8'), '', 'no FFmpeg invocation for invalid layer paths');
}));
test('R1 malformed MP4: truncated box header uses the malformed refusal before any media decode or staging', () => temp(d => {
  const { base, directory } = setup(d, { count: 1 }), truncated = join(d, 'truncated.mp4');
  writeFileSync(truncated, Buffer.concat([readFileSync(base), Buffer.from([0, 0, 0, 16])]));
  const starts = join(d, 'media-starts'); writeFileSync(starts, '');
  const extra = wrapper(d, 'malformed-ffmpeg-tripwire', 'ffmpeg', `if(process.argv.includes('-i')){require('node:fs').appendFileSync(${JSON.stringify(starts)},'started');process.exit(99);}${forward(actual('ffmpeg'))}`);
  const program = mutant(d, 'malformed-stage-tripwire', 'composite-alpha.js', replace(
    "stage = mkdtempSync(join(dirname(output), '.wiser-video-composite-alpha-'));", "throw new Error('STAGING REACHED');"));
  const a = args(truncated, directory, join(d, 'out'));
  refuse(d, a, /malformed or truncated MP4 edit-list structure/, entry, extra);
  refuse(d, a, /malformed or truncated MP4 edit-list structure/, program, extra);
  assert.equal(readFileSync(starts, 'utf8'), '', 'no FFmpeg media decode for malformed MP4; the dependency probe runs first, as composite runs its own');
}));
test('R1 mkfifo missing: PATH has FFmpeg/ffprobe only; refusal precedes staging', () => temp(d => {
  const { a } = setup(d, { count: 1 }), bin = join(d, 'without-mkfifo'); mkdirSync(bin);
  for (const name of ['ffmpeg', 'ffprobe']) symlinkSync(actual(name), join(bin, name));
  const extra = { env: { ...process.env, PATH: bin } }, pattern = /missing mkfifo; composite-alpha needs a POSIX named pipe/;
  const program = mutant(d, 'mkfifo-stage-tripwire', 'composite-alpha.js', replace(
    "stage = mkdtempSync(join(dirname(output), '.wiser-video-composite-alpha-'));", "throw new Error('STAGING REACHED');"));
  refuse(d, a, pattern, entry, extra);
  refuse(d, a, pattern, program, extra);
}));
test('R1 mkfifo probe: failed or non-FIFO creation refuses before staging and removes its fresh temporary directory', () => temp(d => {
  const { a } = setup(d, { count: 1 }), scratch = join(d, 'dependency-tmp'), calls = join(d, 'mkfifo-calls');
  mkdirSync(scratch); writeFileSync(calls, '');
  const program = mutant(d, 'mkfifo-probe-stage-tripwire', 'composite-alpha.js', replace(
    "stage = mkdtempSync(join(dirname(output), '.wiser-video-composite-alpha-'));", "throw new Error('STAGING REACHED');"));
  for (const [name, body] of [['fails', 'process.exit(99);'], ['regular-file', "fs.writeFileSync(process.argv[2],'not a pipe');"]]) {
    const extra = wrapper(d, `mkfifo-${name}`, 'mkfifo', `const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(calls)},process.argv[2]+'\\n');${body}`);
    extra.env.TMPDIR = scratch; extra.env.TMP = scratch; extra.env.TEMP = scratch;
    const pattern = /missing mkfifo; composite-alpha needs a POSIX named pipe/;
    refuse(d, a, pattern, entry, extra); refuse(d, a, pattern, program, extra);
    assert.deepEqual(readdirSync(scratch), [], 'dependency probe removed immediately on refusal');
  }
  const paths = readFileSync(calls, 'utf8').trim().split('\n');
  assert.equal(paths.length, 4); assert.equal(new Set(paths.map(dirname)).size, 4, 'each probe has a fresh directory');
  for (const path of paths) assert.equal(dirname(dirname(path)), scratch, 'probe is under os.tmpdir()');
}));
test('R1 mkfifo success: real dependency probe is removed before the staging FIFO is created', () => temp(d => {
  const { a } = setup(d, { count: 1 }), scratch = join(d, 'dependency-tmp'), calls = join(d, 'mkfifo-calls');
  mkdirSync(scratch); writeFileSync(calls, '');
  const extra = wrapper(d, 'mkfifo-success', 'mkfifo', `const fs=require('node:fs');const path=process.argv[2];if(path.endsWith('/composite.fifo')&&fs.readdirSync(${JSON.stringify(scratch)}).length)process.exit(99);fs.appendFileSync(${JSON.stringify(calls)},path+'\\n');${forward(actual('mkfifo'))}`);
  extra.env.TMPDIR = scratch; extra.env.TMP = scratch; extra.env.TEMP = scratch;
  complete(success(a, entry, extra));
  const paths = readFileSync(calls, 'utf8').trim().split('\n');
  assert.equal(paths.length, 2, 'a dependency probe precedes the staging FIFO');
  assert.equal(dirname(dirname(paths[0])), scratch);
  assert.ok(paths[1].endsWith('/composite.fifo'));
  assert.deepEqual(readdirSync(scratch), []);
}));
test('R1 docs dependencies: alpha declares mkfifo, supported platforms, macOS run and its setup check/refusal', () => {
  const doc = readFileSync(join(tool, 'TOOL.md'), 'utf8'), setup = readFileSync(join(tool, 'SETUP.md'), 'utf8');
  const dependency = doc.split('\n').find(line => line.startsWith('| ') && line.includes('`composite-alpha` only'));
  const alpha = doc.split('## Full-frame alpha composition')[1].split('\n## ')[0];
  for (const section of [dependency, alpha]) {
    assert.match(section, /mkfifo/); assert.match(section, /macOS and Linux/);
    assert.match(section, /refuses on Windows/); assert.match(section, /run on macOS/);
  }
  assert.match(setup, /command -v mkfifo/); assert.match(setup, /mkfifo "\$probe\/probe.fifo"/);
  const row = doc.split('\n').find(line => line.startsWith('| `missing mkfifo;'));
  assert.match(row ?? '', /POSIX named pipe.*\|.+\|.+\|/);
});
test('R1 docs kill window: alpha staging is never the bundle, even with a matching completion marker', () => {
  const doc = readFileSync(join(tool, 'TOOL.md'), 'utf8'), inventory = readFileSync(join(tool, '..', 'AGENTS.md'), 'utf8');
  const alpha = doc.split('## Full-frame alpha composition')[1].split('\n## ')[0];
  const row = inventory.split('\n').find(line => line.includes('`video-edit` `composite-alpha`'));
  for (const section of [alpha, row]) {
    assert.match(section, /kill can leave.*staging sibling/);
    assert.match(section, /never the bundle, even when it holds a completion marker that matches its files/);
    assert.match(section, /only `--output` after the success JSON is the bundle/);
  }
});
test('AL6 controls: changed base/layer/manifest, corrupt encoded media, record and completion refuse', () => temp(d => {
  const {base,directory,a}=setup(d), ffmpeg=actual('ffmpeg');
  for(const [name,target] of [['base',base],['manifest',join(directory,'frames.sha256')],['png',join(directory,'frame_000001.png')]]) {
    const original=readFileSync(target);
    const p=mutant(d,`change-${name}`,'composite-alpha.js',replace('const after = sameSources',`await import('node:fs').then(fs=>fs.appendFileSync(${JSON.stringify(target)},'changed')); const after = sameSources`));
    refuse(d,a,/identity changed/,p);writeFileSync(target,original);
    patch(join(dirname(p),'evidence-media.js'),muteFailure(/source identity changed/));
    caught(()=>refuse(d,a,/identity changed/,p));writeFileSync(target,original);
    if(existsSync(join(d,'out')))rmSync(join(d,'out'),{recursive:true});
  }
  const corrupt=wrapper(d,'corrupt-media','ffmpeg',forward(ffmpeg,"if(r.status===0&&a.at(-1).endsWith('/segment.mp4'))require('node:fs').writeFileSync(a.at(-1),'corrupt');"));
  refuse(d,a,/ffprobe|media|MP4/,entry,corrupt);
  // Corrupt the bytes after the verified identity was taken. Publication must
  // re-hash media, independently of whether the codec can still decode it.
  const media=mutant(d,'corrupt-media-identity','composite-alpha.js',replace('const result = publish',"await import('node:fs').then(fs=>fs.appendFileSync(video,'corrupt')); const result = publish"));
  refuse(d,a,/identity|staged|changed/,media);
  patch(join(dirname(media),'evidence-media.js'),muteFailure(/identity|staged|changed/));
  caught(()=>refuse(d,a,/identity|staged|changed/,media));
  if(existsSync(join(d,'out')))rmSync(join(d,'out'),{recursive:true});
  for(const [name,file] of [['record','receipt.json'],['marker','complete.json']]) {
    const p=mutant(d,`corrupt-${name}`,'evidence-media.js',s=>s.replace(/\breadFileSync\b(?=\s*[,}])/,'readFileSync as originalReadFileSync')+`\nfunction readFileSync(path,...rest){if(String(path).includes('${prefix}')&&String(path).endsWith('/${file}'))writeFileSync(path,'{}');return originalReadFileSync(path,...rest);}\n`);
    refuse(d,a,/record|receipt|identity|readback|completion|marker/,p);
    patch(join(dirname(p),'evidence-media.js'),muteFailure(/readback|read-back|record|marker|completion/));
    caught(()=>refuse(d,a,/record|receipt|identity|readback|completion|marker/,p));
    if(existsSync(join(d,'out')))rmSync(join(d,'out'),{recursive:true});
  }
}));

test('AL7: fresh destinations are byte-identical with semantic receipt equality; staging/timestamp controls', () => temp(d => {
  const {a}=setup(d), x=success(a), y=success(replaceFlag(a,'--output',join(d,'repeat')));
  assert.deepEqual(readFileSync(x.segment),readFileSync(y.segment)); assert.deepEqual(json(x.receipt),json(y.receipt));
  for(const [name,value] of [['stage','stage'],['timestamp','new Date().toISOString()']]) {
    const p=mutant(d,`receipt-${name}`,'composite-alpha.js',replace('policy: { ...POLICY }',`policy: { ...POLICY, clip: ${value} }`));
    const q=success(replaceFlag(a,'--output',join(d,`${name}-1`)),p), r=success(replaceFlag(a,'--output',join(d,`${name}-2`)),p);
    caught(()=>assert.deepEqual(json(q.receipt),json(r.receipt)));
  }
}));

// Disable only the named diagnostic guard in a private scripts copy. The
// caller asserts its precise refusal, so a later/different guard is not credit
// for the guard under test. Every substitution must actually change the copy.
function muteFailure(pattern) {
  return s => s.replace(/fail\((?:'[^'\n]*'|"[^"\n]*"|`[^`]*`)\)/g, call => pattern.test(call) ? 'void 0' : call);
}
function guardControl(d,name,a,pattern,file,change,extra={}) {
  refuse(d,a,pattern,entry,extra);
  const p=mutant(d,`unguarded-${name}`,file,change);
  if(name==='hardlink')patch(join(dirname(p),'composite-alpha.js'),replace('s.nlink !== 1','false'));
  caught(()=>refuse(d,a,pattern,p,extra));
  const output=a[a.indexOf('--output')+1];
  if(typeof output==='string'&&existsSync(output))rmSync(output,{recursive:true,force:true});
  for(const n of readdirSync(d).filter(n=>n.startsWith(prefix)))rmSync(join(d,n),{recursive:true});
}

test('AL8: closed flags, required values, explicit alpha/colour and hashes; each guard control', () => temp(d => {
  const {a}=setup(d,{count:1});
  for(const [name,request,pattern,change] of [
    ['unknown',[...a,'--bogus','1'],/unknown or inapplicable option/,muteFailure(/unknown or inapplicable option/)],
    ['duplicate',[...a,'--layer-alpha','straight'],/twice/,muteFailure(/twice/)],
    ['valueless',a.slice(0,-1),/needs a value/,muteFailure(/needs a value/)],
    ['missing-flag',a.filter((_,i)=>i!==a.indexOf('--layer-alpha')&&i!==a.indexOf('--layer-alpha')+1),/required/,muteFailure(/required/)],
    ['inapplicable',[...a,'--fps','30'],/unknown or inapplicable option/,muteFailure(/unknown or inapplicable option/)],
    ['bad-hash',replaceFlag(a,'--base-sha256','no'),/64 hexadecimal/,muteFailure(/64.*hex/)],
    ['hash-mismatch',replaceFlag(a,'--base-sha256','0'.repeat(64)),/SHA-256/,replace('if (id.sha256 !== expected)','if (false)')]
  ])guardControl(d,name,request,pattern,'evidence-media.js',change);
  guardControl(d,'premultiplied',replaceFlag(a,'--layer-alpha','premultiplied'),/only straight/,'composite-alpha.js',muteFailure(/only straight/));
  guardControl(d,'srgb',replaceFlag(a,'--layer-colour','srgb'),/only bt709/,'composite-alpha.js',muteFailure(/only bt709/));
}));

test('AL1/AL8: missing, extra, duplicate/reordered indices, unexpected entry, count/size and off-grid guards', () => temp(d => {
  const {base,directory,a}=setup(d);
  const first=join(directory,'frame_000001.png'), original=readFileSync(first), mf=join(directory,'frames.sha256'), originalManifest=readFileSync(mf);
  for(const name of ['missing','extra','duplicate-numbered','renamed','unexpected','subdirectory']) {
    const extra=join(directory,name==='extra'?'frame_000004.png':name==='duplicate-numbered'?'frame_0000001.png':name==='renamed'?'frame_000009.png':name==='subdirectory'?'subdir':'.unexpected');
    if(name==='missing')rmSync(first);else if(name==='renamed')renameSync(first,extra);else if(name==='subdirectory')mkdirSync(extra);else writeFileSync(extra,original);
    guardControl(d,name,a,/exactly frames.sha256/,'composite-alpha.js',muteFailure(/exactly frames.sha256/));
    if(name==='missing')writeFileSync(first,original);else if(name==='renamed')renameSync(extra,first);else rmSync(extra,{recursive:true});
  }
  const shorter=fixture(d,'short',{count:2});
  guardControl(d,'count',args(shorter,directory,join(d,'out')),/exactly frames.sha256/,'composite-alpha.js',muteFailure(/exactly frames.sha256/));
  const small=layer(d,'small',[pattern(8,8,0),pattern(8,8,1),pattern(8,8,2)],{width:8,height:8});
  guardControl(d,'png-size',args(base,small,join(d,'out')),/same-size noninterlaced/,'composite-alpha.js',muteFailure(/same-size noninterlaced/));
  for(const [name,contents,pattern] of [
    ['manifest-short',originalManifest.subarray(0,-1),/83-byte line/],
    ['manifest-syntax',Buffer.from(originalManifest.toString().replace('  frame',' xframe')),/line syntax/],
    ['manifest-duplicate',Buffer.from(originalManifest.toString().replace('frame_000002','frame_000001')),/line syntax/],
    ['manifest-reordered',Buffer.from(originalManifest.toString().split('\n').slice(0,-1).reverse().join('\n')+'\n'),/line syntax/],
    ['manifest-traversal',Buffer.from(originalManifest.toString().replace('frame_000001.png','../evil00001.png')),/line syntax/]
  ]) {
    writeFileSync(mf,contents);
    guardControl(d,name,args(base,directory,join(d,'out')),pattern,'composite-alpha.js',muteFailure(pattern));
  }
  writeFileSync(mf,originalManifest);
  guardControl(d,'manifest-pin',replaceFlag(a,'--layer-manifest-sha256','0'.repeat(64)),/SHA-256/,'evidence-media.js',replace('if (id.sha256 !== expected)','if (false)'));
  writeFileSync(mf,originalManifest.toString().replace(/^[a-f0-9]{64}/,'0'.repeat(64)));
  guardControl(d,'decoded-hash',args(base,directory,join(d,'out')),/decoded RGBA SHA-256/,'composite-alpha.js',muteFailure(/decoded RGBA SHA-256/));
  writeFileSync(mf,originalManifest);
  const grid=fixture(d,'grid',{timescale:'3000'}), off=join(d,'off.mp4');
  ff(['-i',grid,'-map','0:v','-c','copy','-bsf:v','setts=pts=PTS+if(eq(N\\,1)\\,1\\,0)','-video_track_timescale','3000','-use_editlist','0',off]);
  assert.equal(probe(off).frames[1].pts,101);
  guardControl(d,'grid',args(off,directory,join(d,'out')),/exact constant grid/,'evidence-media.js',replace('cmp(r.seconds, rat(BigInt(r.ordinal) * rate.d, rate.n)) || r.duration === undefined || pts(r.duration) * info.tb.n * rate.n !== rate.d * info.tb.d','false'));
}));

test('AL8: relative, linked, hardlinked, aliased, traversing and protected paths, audio; guard controls', () => temp(d => {
  const {base,directory,a}=setup(d,{count:1});
  // No protected file is read or created. The spelling must fail before any I/O.
  for(const [name,flag,value,pattern,file,change] of [
    ['relative-base','--base','relative.mp4',/absolute/,'evidence-media.js',muteFailure(/absolute/)],
    ['relative-layer','--layer','relative',/absolute/,'composite-alpha.js',muteFailure(/layer must be absolute/)],
    ['relative-output','--output','relative',/absolute/,'evidence-media.js',muteFailure(/absolute/)],
    ['protected-base','--base',join(d,'memory','private.mp4'),/protected/,'evidence-media.js',muteFailure(/protected/)],
    ['protected-layer','--layer',join(d,'memory','frames'),/protected/,'composite-alpha.js',muteFailure(/layer must be absolute/)],
    ['protected-output','--output',join(d,'memory','out'),/protected/,'evidence-media.js',muteFailure(/protected/)],
    ['traversing-protected-layer','--layer',`${d}/memory/../frames`,/protected/,'composite-alpha.js',muteFailure(/layer must be absolute/)]
  ])guardControl(d,name,replaceFlag(a,flag,value),pattern,file,change);
  const linked=join(d,'linked.mp4');symlinkSync(base,linked);
  guardControl(d,'linked-base',replaceFlag(a,'--base',linked),/one link|symbolic link/,'composite-alpha.js',replace('unlinked(raw);','void 0;'));
  const ld=join(d,'linked-frames');symlinkSync(directory,ld);
  guardControl(d,'linked-layer',replaceFlag(a,'--layer',ld),/unlinked directory/,'composite-alpha.js',replace('unlinked(raw, true);','void 0;'));
  const png=join(directory,'frame_000001.png'), bytes=readFileSync(png), pngReal=join(d,'original.png');writeFileSync(pngReal,bytes);rmSync(png);symlinkSync(pngReal,png);
  guardControl(d,'linked-png',a,/one link|symbolic link/,'composite-alpha.js',replace('unlinked(raw);','void 0;'));
  rmSync(png);writeFileSync(png,bytes);
  const hard=join(d,'hard.png');linkSync(png,hard);
  guardControl(d,'hardlink',a,/one link/,'evidence-media.js',muteFailure(/one link/));rmSync(hard);
  const alias=join(d,'tool-link');symlinkSync(tool,alias);
  refuse(d,replaceFlag(a,'--output',join(alias,'out')),/inside this tool/);
  // Exercise the removed guard against the copy's own directory. Even if the
  // mutant writes there, everything is inside this test's temporary tree.
  const p=mutant(d,'tool-alias','evidence-media.js',s=>s+'\n// private path control\n');
  const privateAlias=join(d,'private-tool-link');symlinkSync(dirname(dirname(p)),privateAlias);
  const privateArgs=replaceFlag(a,'--output',join(privateAlias,'out'));
  refuse(d,privateArgs,/inside this tool/,p);
  patch(join(dirname(p),'evidence-media.js'),muteFailure(/inside this tool/));
  caught(()=>refuse(d,privateArgs,/inside this tool/,p));
  const av=fixture(d,'audio',{count:1,audio:true});
  guardControl(d,'audio',args(av,directory,join(d,'out')),/refuses audio/,'evidence-media.js',replace('silent && streams.length !== 1','false'));
}));

function crc32(bytes) {let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,body) {const out=Buffer.alloc(body.length+12);out.writeUInt32BE(body.length);out.write(type,4,'ascii');body.copy(out,8);out.writeUInt32BE(crc32(out.subarray(4,-4)),out.length-4);return out;}
test('AL8: depth/type/interlace, colour/alpha chunks and CRC; individual PNG guard controls', () => temp(d => {
  const {base,directory}=setup(d,{count:1}), png=join(directory,'frame_000001.png'), original=readFileSync(png);
  const raw=join(d,'variant.rgba');writeFileSync(raw,rawRGBA(png));
  for(const [name,format,flags,header] of [['16-bit','rgba64be',[],[16,6,0]],['rgb24','rgb24',[],[8,2,0]],['palette','pal8',[],[8,3,0]],['interlaced','rgba',['-flags','+ildct'],[8,6,1]]]) {
    ff(['-f','rawvideo','-pixel_format','rgba','-video_size','16x16','-i',raw,'-frames:v','1','-c:v','png','-pix_fmt',format,'-threads:v','1',...flags,png]);
    const encoded=readFileSync(png);assert.deepEqual([encoded[24],encoded[25],encoded[28]],header,name);
    assert.equal(rawRGBA(png).length,1024,`${name} fixture actually decodes`);
    guardControl(d,name,args(base,directory,join(d,'out')),/same-size noninterlaced/,'composite-alpha.js',muteFailure(/same-size noninterlaced/));
  }
  for(const [type,body] of [['gAMA',Buffer.from([0,0,177,143])],['iCCP',Buffer.from('profile\0\0bad')],['sRGB',Buffer.from([0])],['tRNS',Buffer.from([0])]]) {
    writeFileSync(png,Buffer.concat([original.subarray(0,33),chunk(type,body),original.subarray(33)]));
    guardControl(d,`chunk-${type}`,args(base,directory,join(d,'out')),new RegExp(`unsupported PNG chunk ${type}`),'composite-alpha.js',muteFailure(/unsupported PNG chunk/));
  }
  const bad=Buffer.from(original);bad[29]^=1;writeFileSync(png,bad);
  guardControl(d,'crc',args(base,directory,join(d,'out')),/CRC mismatch/,'composite-alpha.js',muteFailure(/CRC mismatch/));
  writeFileSync(png,original);
}));

test('AL8: ordinary decoder/encoder failure cleans staging; cleanup guard control', () => temp(d => {
  const {a}=setup(d,{count:1}), ffmpeg=actual('ffmpeg');
  for(const phase of ['decode','encode']) {
    const env=wrapper(d,`fail-${phase}`,'ffmpeg',`const argv=process.argv.slice(2);if(${phase==='encode'?"argv.some(x=>x.endsWith('/composite.fifo'))":"argv.at(-1)==='pipe:1'"})process.exit(99);${forward(ffmpeg)}`);
    refuse(d,a,/media|encoder/,entry,env);
    const p=mutant(d,`no-cleanup-${phase}`,'composite-alpha.js',replace('if (stage && existsSync(stage)) rmSync(stage, { recursive: true, force: true });','void 0;'));
    caught(()=>refuse(d,a,/media|encoder/,p,env),/ordinary refusal removes its own staging/);
    for(const n of readdirSync(d).filter(n=>n.startsWith(prefix)))rmSync(join(d,n),{recursive:true});
  }
}));

test('AL8: interrupted decode/encode/publication retain only named incomplete staging and never reuse it', () => temp(d => {
  const {a}=setup(d,{count:1});
  const abandoned=[];
  const stopChildren="for(const task of children)task.child.kill('SIGKILL'); await Promise.allSettled([...children].map(task=>task.completed));";
  for(const [phase,anchor] of [['decode','let count = 0;'],['encode','writer = await fifoWriter'],['publication','const result = publish']]) {
    const publication=(s,poison=false)=>s.replace(/\breadFileSync\b(?=\s*[,}])/,'readFileSync as originalReadFileSync')+`\nfunction readFileSync(path,...rest){if(String(path).includes('${prefix}')&&String(path).endsWith('/receipt.json')){${poison?"writeFileSync(join(dirname(path),'complete.json'),'{}');":''}process.kill(process.pid,'SIGKILL');}return originalReadFileSync(path,...rest);}\n`;
    const p=phase==='publication'?mutant(d,`kill-${phase}`,'evidence-media.js',s=>publication(s)):mutant(d,`kill-${phase}`,'composite-alpha.js',s=>s.replace(anchor,`${stopChildren}process.kill(process.pid, 'SIGKILL'); ${anchor}`));
    const old=new Set(readdirSync(d)), r=run(process.execPath,[p,...a]);assert.equal(r.signal,'SIGKILL');assert.equal(r.stdout,'');assert.ok(!existsSync(join(d,'out')));
    const fresh=readdirSync(d).filter(n=>n.startsWith(prefix)&&!old.has(n));assert.equal(fresh.length,1);
    const stage=join(d,fresh[0]), files=readdirSync(stage).sort();assert.ok(!files.includes('complete.json'));assert.ok(files.every(n=>['composite.fifo','segment.mp4','receipt.json'].includes(n)));
    abandoned.push([stage,files]);
    // A control falsely marking a killed stage complete fails this same check.
    const q=phase==='publication'?mutant(d,`kill-complete-${phase}`,'evidence-media.js',s=>publication(s,true)):mutant(d,`kill-complete-${phase}`,'composite-alpha.js',s=>s.replace(anchor,`${stopChildren}await import('node:fs').then(fs=>fs.writeFileSync(join(stage,'complete.json'),'{}'));process.kill(process.pid,'SIGKILL'); ${anchor}`));
    const before=new Set(readdirSync(d)), k=run(process.execPath,[q,...a]);assert.equal(k.signal,'SIGKILL');
    const poisoned=readdirSync(d).filter(n=>n.startsWith(prefix)&&!before.has(n));assert.equal(poisoned.length,1);
    caught(()=>assert.ok(!existsSync(join(d,poisoned[0],'complete.json'))));rmSync(join(d,poisoned[0]),{recursive:true});
  }
  success(a);for(const [stage,files]of abandoned)assert.deepEqual(readdirSync(stage).sort(),files,'fresh run retains earlier staging');
}));

test('AL8: late destination collision refuses, preserves other data; publication guard control', () => temp(d => {
  const {a}=setup(d,{count:1}), output=join(d,'out');
  const p=mutant(d,'late-collision','composite-alpha.js',replace('const result = publish',"await import('node:fs').then(fs=>fs.mkdirSync(output)); const result = publish"));
  const check=r=>{assert.equal(r.status,1,r.stderr);assert.equal(r.stdout,'');assert.match(r.stderr,/already exists|destination collision/);assert.deepEqual(readdirSync(output),[]);assert.ok(!readdirSync(d).some(n=>n.startsWith(prefix)));};
  check(run(process.execPath,[p,...a]));rmSync(output,{recursive:true});
  patch(join(dirname(p),'evidence-media.js'),muteFailure(/already exists|destination collision/));
  // The underlying reservation may still refuse. It must no longer pass the
  // named collision assertion, so generic downstream errors earn no credit.
  caught(()=>check(run(process.execPath,[p,...a])));
}));

test('AL10: opaque flat RGB patches agree with render conversion within one code; BT.601 control', () => temp(d => {
  const width=16,height=16,colours=[[255,255,255],[0,0,0],[20,20,20],[255,0,0],[0,255,0],[0,0,255]],base=fixture(d,'base',{width,height,count:colours.length});
  const frames=colours.map(c=>{const f=Buffer.alloc(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixel(f,width,x,y,c,255);return f;});
  const directory=layer(d,'frames',frames,{width,height}), a=args(base,directory,join(d,'out'));
  const reference=Buffer.concat(colours.map((_,n)=>ff(['-i',join(directory,`frame_${String(n+1).padStart(6,'0')}.png`),'-vf','format=rgb24,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p','-pix_fmt','yuv420p','-f','rawvideo','pipe:1'],true)));
  const check=result=>{const out=rawYUV(result.segment);for(let n=0;n<colours.length;n++)for(let plane=0;plane<3;plane++){const scale=plane?2:1,w=width/scale,h=height/scale,offset=n*width*height*3/2+(plane===0?0:plane===1?width*height:width*height*5/4);for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const at=offset+y*w+x;assert.ok(Math.abs(out[at]-reference[at])<=1,`render conversion frame=${n} plane=${plane} x=${x} y=${y}: ${out[at]} vs ${reference[at]}`);}}};
  const r=success(a);check(r);oracleCheck(base,directory,r);
  const p=blendMutant(d,'bt601',faultyBlend('601'));caught(()=>check(success(replaceFlag(a,'--output',join(d,'601')),p)),/render conversion/);
}));

test('AL11: pixel/frame/PNG/manifest bounds checked before staging; each removed-bound control', () => temp(d => {
  const {a}=setup(d,{count:3});
  for(const [name,lower,remove,pattern] of [
    ['pixels',replace('MAX_PIXELS = 2073600','MAX_PIXELS = 255'),replace('pixels > MAX_PIXELS','false'),/bound exceeded/],
    ['frames',replace('MAX_FRAMES = 27000','MAX_FRAMES = 2'),replace('b.count > MAX_FRAMES','false'),/bound exceeded/],
    ['png',replace('MAX_PNG = 64 * 1024 ** 2','MAX_PNG = 1'),s=>s.replaceAll('unlinked(path).size > MAX_PNG','false').replaceAll('bytes.length > MAX_PNG','false'),/64 MiB/],
    ['manifest',replace('MAX_MANIFEST = MAX_FRAMES * 83','MAX_MANIFEST = 1'),replace('unlinked(manifest).size > MAX_MANIFEST','false'),/27000 lines/]
  ]) {
    const p=mutant(d,`lower-${name}`,'composite-alpha.js',lower);
    refuse(d,a,pattern,p);
    // An mkdtemp tripwire proves refusal precedes staging, not merely cleanup.
    patch(join(dirname(p),'composite-alpha.js'),replace("stage = mkdtempSync(join(dirname(output), '.wiser-video-composite-alpha-'));","throw new Error('STAGING REACHED');"));
    refuse(d,a,pattern,p);
    patch(join(dirname(p),'composite-alpha.js'),remove);
    caught(()=>refuse(d,a,pattern,p));
  }
}));

test('AL9: new segment through unchanged mux -> loudness -> finish, copied packets and exact audio sample clock', () => temp(d => {
  const {base,directory,a}=setup(d,{count:33}), r=success(a);oracleCheck(base,directory,r);
  const raw=join(d,'narration.s16le'), wav=join(d,'narration.wav'), samples=Buffer.alloc(48000*2);let state=31;
  for(let n=0;n<48000;n++){state=(Math.imul(state,1664525)+1013904223)>>>0;samples.writeInt16LE((state>>>17)-16384,n*2);}writeFileSync(raw,samples);
  ff(['-f','s16le','-ar','48000','-ac','1','-i',raw,wav]);
  const mux=success(['mux','--input',r.segment,'--audio',wav,'--audio-start','0.0123','--output',join(d,'mux.mp4')]);
  const packets=p=>{const v=run('ffprobe',['-v','error','-select_streams','v:0','-show_packets','-show_data_hash','sha256','-of','json',p]);assert.equal(v.status,0);const tb=probe(p).streams.find(s=>s.codec_type==='video').time_base.split('/').map(BigInt);return JSON.parse(v.stdout).packets.map(p=>({hash:p.data_hash,pts:rational(BigInt(p.pts)*tb[0],tb[1]),dts:rational(BigInt(p.dts)*tb[0],tb[1]),duration:rational(BigInt(p.duration)*tb[0],tb[1])}));};
  assert.deepEqual(packets(mux.output),packets(r.segment),'mux copied packet bytes and rational clock');
  const expected=Buffer.alloc(52800*2);samples.copy(expected,591*2);
  assert.deepEqual(ff(['-i',mux.output,'-map','0:a:0','-c:a','pcm_s16le','-f','s16le','pipe:1'],true),expected);
  assert.equal(mux.audioStartSample,591);assert.equal(mux.firstFrameSample,0);assert.equal(mux.frames,33);assert.equal(mux.narrationSamples,48000);assert.equal(mux.samples,52800);
  const loud=success(['loudness','--input',mux.output,'--output',join(d,'loud.mp4'),'--target','-24','--true-peak','-1']);
  assert.deepEqual(packets(loud.output),packets(r.segment),'loudness copied picture packets and clock');
  const lp=probe(loud.output), audio=lp.streams.find(s=>s.codec_type==='audio');assert.equal(audio.sample_rate,'48000');
  const af=lp.frames.filter(f=>f.media_type==='audio');assert.equal(af[0].pts,0);assert.equal(af.reduce((sum,f)=>sum+f.nb_samples,0),52800);
  for(let i=1;i<af.length;i++)assert.equal(af[i].pts,af[i-1].pts+af[i-1].nb_samples,'loudness continuous sample clock');
  const finish=success(['finish','--input',loud.output,'--output',join(d,'finish.mp4'),'--target','-24','--true-peak','-1']);
  assert.ok(finish.after.truePeak<=-1);assert.equal(finish.frames,33);
}));

// Independent fixture reader: expose the actual muxer's entry and its patch
// offsets, without using the production reader to decide what was written.
function editBoxes(bytes, start = 0, end = bytes.length) {
  const out = [];
  for (let at = start; at < end;) {
    let length = bytes.readUInt32BE(at), head = 8;
    if (length === 1) { length = Number(bytes.readBigUInt64BE(at + 8)); head = 16; }
    else if (length === 0) length = end - at;
    assert.ok(length >= head && at + length <= end);
    out.push({ type: bytes.toString('ascii', at + 4, at + 8), body: at + head, end: at + length }); at += length;
  }
  return out;
}
function muxedIdentity(d) {
  const { base, directory } = setup(d, { timescale: '15360' }), edited = join(d, 'identity.mp4');
  ff(['-i', base, '-map', '0:v:0', '-c:v', 'copy', '-video_track_timescale', '15360', '-use_editlist', '1', edited]);
  const bytes = readFileSync(edited);
  const child = (parent, type) => {
    const found = editBoxes(bytes, parent.body, parent.end).filter(b => b.type === type);
    assert.equal(found.length, 1, `one ${type}`); return found[0];
  };
  const moov = child({ body: 0, end: bytes.length }, 'moov'), mvhd = child(moov, 'mvhd');
  const trak = child(moov, 'trak'), mdhd = child(child(trak, 'mdia'), 'mdhd'), elst = child(child(trak, 'edts'), 'elst');
  assert.equal(bytes[mvhd.body], 0); assert.equal(bytes[mdhd.body], 0); assert.equal(bytes[elst.body], 0);
  assert.equal(bytes.readUInt32BE(elst.body + 4), 1);
  const entry = elst.body + 8, movieScale = bytes.readUInt32BE(mvhd.body + 12), mediaScale = bytes.readUInt32BE(mdhd.body + 12);
  const mediaDuration = bytes.readUInt32BE(mdhd.body + 16), segmentDuration = bytes.readUInt32BE(entry);
  assert.equal(bytes.readInt32BE(entry + 4), 0); assert.equal(bytes.readInt16BE(entry + 8), 1); assert.equal(bytes.readInt16BE(entry + 10), 0);
  assert.equal(BigInt(segmentDuration) * BigInt(mediaScale), BigInt(mediaDuration) * BigInt(movieScale), 'muxed edit duration is exactly media duration');
  assert.deepEqual(alphaEditList(edited), { version: 0, entry_count: 1, movie_timescale: BigInt(movieScale), media_timescale: BigInt(mediaScale), media_duration: BigInt(mediaDuration), segment_duration: BigInt(segmentDuration), media_time: 0n, rate_integer: 1, rate_fraction: 0 });
  return { base, directory, edited, bytes, entry };
}

test('AL5/AL9: muxed identity edit is accepted, produces identical segment bytes, records its edit state; legacy clock still refuses', () => temp(d => {
  const { base, directory, edited } = muxedIdentity(d), info = inspect(edited, true);
  assert.deepEqual(rawYUV(edited), rawYUV(base), 'identity remux keeps decoded frames');
  assert.equal(text(alphaClock(info, edited)), '30/1');
  assert.equal(alphaClock(info, edited).edit_list, 'identity');
  assert.throws(() => clock(info, edited), /no edit list/);
  assert.equal(alphaEditList(base), null);
  const plain = success(args(base, directory, join(d, 'plain-out'))), identity = success(args(edited, directory, join(d, 'identity-out')));
  assert.deepEqual(readFileSync(identity.segment), readFileSync(plain.segment), 'same segment.mp4 bytes with and without identity edit');
  assert.equal(json(plain.receipt).clocks.base.edit_list, 'none'); assert.equal(json(identity.receipt).clocks.base.edit_list, 'identity');
  complete(plain); complete(identity); profile(edited, identity); oracleCheck(edited, directory, identity);
  assert.doesNotThrow(() => clock(inspect(identity.segment, true), identity.segment));
  for (const change of [
    i => { i.stream.r_frame_rate = '241/1'; },
    i => { i.tb.n = 2n; },
    i => { i.first.n = 1n; },
    i => { i.rows[1].seconds.n += 1n; },
    i => { delete i.rows[1].duration; },
    i => { i.rows[1].duration = String(Number(i.rows[1].duration) - 1); }
  ]) { const bad = structuredClone(info); change(bad); assert.throws(() => alphaClock(bad, edited), /rate or clock|picture origin|exact constant grid/); }
}));

test('AL8: media time 512, rate 2 and segment duration one unit short each refuse; accept-any-edit mutant fails all three refusal assertions', () => temp(d => {
  const { directory, bytes, entry } = muxedIdentity(d);
  const p = mutant(d, 'accept-any-edit', 'evidence-media.js', replace(
    'edit.media_time === 0n && edit.rate_integer === 1 && edit.rate_fraction === 0\n    && edit.segment_duration * edit.media_timescale === edit.media_duration * edit.movie_timescale', 'true'));
  for (const [name, change] of [
    ['media-time-512', b => b.writeInt32BE(512, entry + 4)],
    ['rate-2', b => b.writeInt16BE(2, entry + 8)],
    ['duration-short', b => b.writeUInt32BE(b.readUInt32BE(entry) - 1, entry)]
  ]) {
    const patched = Buffer.from(bytes); change(patched);
    const base = join(d, `${name}.mp4`); writeFileSync(base, patched);
    const a = args(base, directory, join(d, `${name}-out`));
    refuse(d, a, /one identity edit/);
    controlName = `accept-any-edit ${name}`;
    caught(() => refuse(d, a, /one identity edit/, p));
    if (existsSync(join(d, `${name}-out`))) rmSync(join(d, `${name}-out`), { recursive: true });
  }
}));

test('R1 nested size zero: identity elst with unchanged payload refuses; old-rule mutant fails that assertion', () => temp(d => {
  const { directory, bytes, entry } = muxedIdentity(d), patched = Buffer.from(bytes), base = join(d, 'nested-zero.mp4');
  patched.writeUInt32BE(0, entry - 16);
  assert.deepEqual(patched.subarray(entry - 12), bytes.subarray(entry - 12), 'only the elst size field changed');
  writeFileSync(base, patched);
  const a = args(base, directory, join(d, 'out')), pattern = /malformed or truncated MP4 edit-list structure/;
  refuse(d, a, pattern);
  const program = mutant(d, 'nested-zero-old-rule', 'evidence-media.js', replace('if (!topLevel) invalid();', 'void 0;'));
  caught(() => refuse(d, replaceFlag(a, '--output', join(d, 'mutant-out')), pattern, program));
  const top = join(d, 'top-level-zero.mp4'), topBytes = clockMovie(0, 0, 0, false);
  writeFileSync(top, topBytes); const expected = alphaEditList(top);
  topBytes.writeUInt32BE(0, 0); writeFileSync(top, topBytes);
  assert.deepEqual(alphaEditList(top), expected, 'top-level size zero remains accepted');
}));

function mp4Box(type, payload, extended) {
  const head = Buffer.alloc(extended ? 16 : 8);
  head.writeUInt32BE(extended ? 1 : payload.length + 8); head.write(type, 4, 'ascii');
  if (extended) head.writeBigUInt64BE(BigInt(payload.length + 16), 8);
  return Buffer.concat([head, payload]);
}
function clockMovie(movieVersion, mediaVersion, editVersion, extended) {
  const movie = Buffer.alloc(movieVersion ? 112 : 100), media = Buffer.alloc(mediaVersion ? 36 : 24), edit = Buffer.alloc(editVersion ? 28 : 20);
  for (const [body, version, scale, duration] of [[movie, movieVersion, 1000, 100], [media, mediaVersion, 15360, 1536]]) {
    body[0] = version; body.writeUInt32BE(scale, version ? 20 : 12);
    if (version) body.writeBigUInt64BE(BigInt(duration), 24); else body.writeUInt32BE(duration, 16);
  }
  edit[0] = editVersion; edit.writeUInt32BE(1, 4);
  if (editVersion) edit.writeBigUInt64BE(100n, 8); else edit.writeUInt32BE(100, 8);
  edit.writeInt16BE(1, editVersion ? 24 : 16);
  const box = (type, body) => mp4Box(type, body, extended);
  return box('moov', Buffer.concat([box('mvhd', movie), box('trak', Buffer.concat([box('edts', box('elst', edit)), box('mdia', box('mdhd', media))]))]));
}
test('AL8: edit reader handles mvhd/mdhd/elst versions 0/1, 32/64-bit boxes and exact 64-bit durations; malformed/truncated boxes refuse', () => temp(d => {
  const path = join(d, 'structure.mp4');
  for (const movie of [0, 1]) for (const media of [0, 1]) for (const edit of [0, 1]) for (const extended of [false, true]) {
    const bytes = clockMovie(movie, media, edit, extended); writeFileSync(path, bytes);
    assert.deepEqual(alphaEditList(path), { version: edit, entry_count: 1, movie_timescale: 1000n, media_timescale: 15360n, media_duration: 1536n, segment_duration: 100n, media_time: 0n, rate_integer: 1, rate_fraction: 0 });
    for (const length of [0, 4, 7, 12, bytes.length - 1]) {
      writeFileSync(path, bytes.subarray(0, length)); assert.throws(() => alphaEditList(path), /malformed or truncated/);
    }
  }
  const large = clockMovie(1, 1, 1, true), at = type => large.indexOf(Buffer.from(type)) + 12;
  const huge = 2n ** 54n + 1n;
  large.writeUInt32BE(1000, at('mdhd') + 20); large.writeBigUInt64BE(huge, at('mdhd') + 24); large.writeBigUInt64BE(huge, at('elst') + 8);
  writeFileSync(path, large);
  assert.equal(alphaEditList(path).media_duration, huge); assert.equal(alphaEditList(path).segment_duration, huge);
  const info = inspect(fixture(d, 'clock', { timescale: '15360' }), true);
  assert.equal(text(alphaClock(info, path)), '30/1');
  large.writeBigUInt64BE(huge - 1n, at('elst') + 8); writeFileSync(path, large);
  assert.throws(() => alphaClock(info, path), /one identity edit/, 'one tick above the safe Number range is still not an identity');
  const valid = clockMovie(0, 0, 0, false), offset = type => valid.indexOf(Buffer.from(type)) + 4;
  const malformed = [
    b => b.writeUInt32BE(7, 0),
    b => b.writeUInt32BE(b.length + 1, 0),
    b => b.writeUInt32BE(999, offset('elst') - 8),
    b => { b[offset('elst')] = 2; },
    b => b.writeUInt32BE(2, offset('elst') + 4),
    b => { b[offset('mvhd')] = 2; },
    b => { b[offset('mdhd')] = 2; },
    b => b.writeUInt32BE(0, offset('mdhd') + 12),
    b => b.writeUInt32BE(0, offset('mvhd') + 12),
    b => b.write('free', offset('mdhd') - 4, 'ascii'),
    b => b.writeUInt32BE(0x01000000, offset('elst'))
  ];
  for (const change of malformed) { const bytes = Buffer.from(valid); change(bytes); writeFileSync(path, bytes); assert.throws(() => alphaEditList(path), /malformed or truncated/); }
  const badExtended = clockMovie(1, 1, 1, true); badExtended.writeBigUInt64BE(0n, 8); writeFileSync(path, badExtended);
  assert.throws(() => alphaEditList(path), /malformed or truncated/);
  const two = Buffer.concat([valid.subarray(0, offset('elst') + 20), valid.subarray(offset('elst') + 8, offset('elst') + 20), valid.subarray(offset('elst') + 20)]);
  for (const type of ['moov', 'trak', 'edts', 'elst']) {
    const header = two.indexOf(Buffer.from(type)) - 4; two.writeUInt32BE(two.readUInt32BE(header) + 12, header);
  }
  two.writeUInt32BE(2, offset('elst') + 4); writeFileSync(path, two);
  assert.throws(() => alphaClock(info, path), /exactly one identity edit/, 'a well-sized two-entry edit is refused');
  const empty = Buffer.concat([valid.subarray(0, offset('elst') + 8), valid.subarray(offset('elst') + 20)]);
  for (const type of ['moov', 'trak', 'edts', 'elst']) {
    const header = empty.indexOf(Buffer.from(type)) - 4; empty.writeUInt32BE(empty.readUInt32BE(header) - 12, header);
  }
  empty.writeUInt32BE(0, offset('elst') + 4); writeFileSync(path, empty);
  assert.throws(() => alphaClock(info, path), /exactly one identity edit/, 'an empty edit list is refused');
  for (const [offsetBytes, value] of [[12, -1], [18, 1]]) {
    const bytes = Buffer.from(valid);
    if (offsetBytes === 12) bytes.writeInt32BE(value, offset('elst') + offsetBytes); else bytes.writeInt16BE(value, offset('elst') + offsetBytes);
    writeFileSync(path, bytes); assert.throws(() => alphaClock(info, path), /one identity edit/);
  }
  for (const version of [0, 1]) {
    const bytes = clockMovie(version, 0, 0, false), body = bytes.indexOf(Buffer.from('mvhd')) + 4;
    if (version) bytes.writeBigUInt64BE(0xffffffffffffffffn, body + 24); else bytes.writeUInt32BE(0xffffffff, body + 16);
    writeFileSync(path, bytes);
    assert.equal(alphaClock(info, path).edit_list, 'identity', 'mvhd duration is not an identity criterion');
  }
}));
