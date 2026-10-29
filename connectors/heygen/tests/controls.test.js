// Plant faults only in in-memory module variants or cloned manifest declarations.
// Each control shows that an independent real-gateway assertion fails on the fault.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setup, run, scene, voice, page, speechAnswer, wav, videoInput, avatarLook, avatarGroup, noPrivate, ADDRESS } from './fixtures.js';

const source = fs.readFileSync(new URL('../index.js',import.meta.url),'utf8');
let sequence = 0;
async function variant(from,to) {
  assert.ok(source.includes(from),'the planted mutation still names its protection');
  const code = source.replace(from,to).replace("'./audio.js'",JSON.stringify(new URL('../audio.js',import.meta.url).href)).replace("'./video.js'",JSON.stringify(new URL('../video.js',import.meta.url).href));
  return import(`data:text/javascript;base64,${Buffer.from(code+`\n// control ${sequence++}`).toString('base64')}`);
}
function install(f,impl) {
  f.gw.connectors=f.connectors.map(c=>c.id==='heygen'?{...c,impl}:c);
}
const clone=f=>({name:'Invented',path:f.file,idempotency_key:'invented-key-123'});

test('control: removing scene maximum makes the over-bound assertion fail',async(t)=>{
  const f=await setup(t);install(f,await variant('text: 5000','text: 6000'));
  const got=await run(f,'speech.synthesize',scene('a'.repeat(5001)));
  assert.throws(()=>assert.equal(got.status,'invalid_arguments'),assert.AssertionError);
});
test('control: removing private membership permits a public voice and fails the preflight assertion',async(t)=>{
  const f=await setup(t);const original=f.fake.auth.proxy;
  f.fake.auth.proxy=async(req,opts)=>new URL(req.endpoint).pathname==='/v3/models/audio/voices'?{status:200,data:page([])}:original(req,opts);
  install(f,await variant('if (!membership.found)','if (false)'));
  const got=await run(f,'speech.synthesize',scene());assert.throws(()=>assert.equal(got.status,'invalid_arguments'),assert.AssertionError);
});
test('control: removing ACTIVE/instant check fails the professional-voice assertion',async(t)=>{
  const f=await setup(t);const original=f.fake.auth.proxy;
  f.fake.auth.proxy=async(req,opts)=>req.endpoint.endsWith('/voice_fake-1')?{status:200,data:{data:voice({mode:'professional'})}}:original(req,opts);
  install(f,await variant("if (selected.mode !== 'instant' || selected.status !== 'ACTIVE')","if (false)"));
  const got=await run(f,'speech.synthesize',scene());assert.throws(()=>assert.equal(got.status,'invalid_arguments'),assert.AssertionError);
});
test('control: removing timing/text equality fails the malformed-answer assertion',async(t)=>{
  const f=await setup(t);const original=f.fake.auth.proxy;
  f.fake.auth.proxy=async(req,opts)=>req.method==='POST'?{status:200,data:speechAnswer('other')}:original(req,opts);
  install(f,await variant("return out.map((c) => c.text).join('') === scene ? out : null;","return out;"));
  const got=await run(f,'speech.synthesize',scene());assert.throws(()=>assert.equal(got.status,'vendor_error'),assert.AssertionError);
});
test('control: removing WAV validation fails the no-file assertion',async(t)=>{
  const f=await setup(t,{media:{chunks:[Buffer.from('invalid audio container')]}});
  install(f,await variant('const wav = inspectWav(bytes, true);','const wav = { duration: 1 };'));
  const got=await run(f,'speech.synthesize',scene());assert.throws(()=>assert.equal(got.file,undefined),assert.AssertionError);
});
test('control: leaking raw JSON fields fails the signed-address non-disclosure assertion',async(t)=>{
  const f=await setup(t);install(f,await variant('return { billing_type: v.billing_type, wallet: { currency:','return { ...v, billing_type: v.billing_type, wallet: { currency:'));
  const got=await run(f,'account.wallet');assert.throws(()=>noPrivate(got),/private field escaped/);
});
test('control: accepting a clone answer without a valid id fails the acknowledgement assertion',async(t)=>{
  const f=await setup(t);f.reply=()=>({status:200,data:{data:{voice_id:''}}});
  install(f,await variant('return id(res.data?.voice_id) ?', 'return true ?'));
  const got=await run(f,'voices.add',clone(f));assert.throws(()=>assert.equal(got.status,'vendor_error'),assert.AssertionError);
});
test('control: claiming delete success for arbitrary 2xx fails the deletion assertion',async(t)=>{
  const f=await setup(t);const original=f.fake.auth.proxy;
  f.fake.auth.proxy=async(req,opts)=>req.method==='DELETE'?{status:200,data:{data:{}}}:original(req,opts);
  install(f,await variant("return res.data?.status === 'ok' ?","return true ?"));
  const got=await run(f,'voices.delete',{voice_id:'voice_fake-1'});assert.throws(()=>assert.equal(got.deleted,undefined),assert.AssertionError);
});
test('control: removing manifest confirmation fails the gateway-stop assertion',async(t)=>{
  const f=await setup(t);const c=f.connectors.find(c=>c.id==='heygen');const manifest=structuredClone(c.manifest);manifest.modules.voices.actions.add.confirmation='none';
  f.gw.connectors=f.connectors.map(c=>c.id==='heygen'?{...c,manifest}:c);
  const got=await f.gw.execute({action:'heygen.voices.add',input:clone(f)});assert.throws(()=>assert.equal(got.status,'needs_confirmation'),assert.AssertionError);
});
test('control: removing group relationship check fails the wrong-group assertion',async(t)=>{
  const f=await setup(t);f.reply=()=>({status:200,data:page([{id:'look',name:'Invented',group_id:'other',avatar_type:'photo_avatar',status:'completed',supported_api_engines:['avatar_iv']}])});
  install(f,await variant('(input.group_id !== undefined && v.group_id !== input.group_id)','false'));
  const got=await run(f,'avatars.list_looks',{group_id:'chosen'});assert.throws(()=>assert.equal(got.status,'vendor_error'),assert.AssertionError);
});

test('control: removing protected-name screen fails the no-open assertion on invented audio',async(t)=>{
  const f=await setup(t);
  const audioSource=fs.readFileSync(new URL('../audio.js',import.meta.url),'utf8');
  const from="const forbidden = (name) => /^memory$/i.test(name) || /^\\.env(?:\\.|$)/i.test(name);";
  assert.ok(audioSource.includes(from));
  const planted=await import(`data:text/javascript;base64,${Buffer.from(audioSource.replace(from,'const forbidden = () => false;')).toString('base64')}`);
  // Invented in-memory fs state only; no credential or protected contents are opened.
  const protectedPath=f.file.replace('sample.mp3','.env.sample.mp3');
  const lstat=fs.lstatSync, realpath=fs.realpathSync, open=fs.openSync;
  let opened=0;
  t.mock.method(fs,'lstatSync',(p,...rest)=>lstat(p===protectedPath?f.file:p,...rest));
  t.mock.method(fs,'realpathSync',(p,...rest)=>p===protectedPath?protectedPath:realpath(p,...rest));
  t.mock.method(fs,'openSync',(p,...rest)=>{if(p===protectedPath){opened++;return open(f.file,...rest);}return open(p,...rest);});
  planted.readUpload(protectedPath);
  assert.throws(()=>assert.equal(opened,0),assert.AssertionError);
});

test('control: removing repeated-cursor validation fails the pagination refusal assertion',async(t)=>{
  const f=await setup(t);f.reply=()=>({status:200,data:page([voice()],{has_more:true,next_token:'same-token'})});
  install(f,await variant(' || token === input.token',''));
  const got=await run(f,'voices.list',{token:'same-token'});assert.throws(()=>assert.equal(got.status,'vendor_error'),assert.AssertionError);
});

test('control: removing wallet balance check fails the no-paid-generation assertion',async(t)=>{
  const f=await setup(t);const original=f.fake.auth.proxy;
  f.fake.auth.proxy=async(req,opts)=>req.endpoint.endsWith('/v3/users/me')?{status:200,data:{data:{billing_type:'wallet',wallet:{currency:'usd',remaining_balance:0}}}}:original(req,opts);
  install(f,await variant(' || w.wallet.remaining_balance < cost',''));
  const got=await run(f,'speech.synthesize',scene('Hi','heygen-voice-1'));assert.throws(()=>assert.equal(got.status,'vendor_error'),assert.AssertionError);
});

test('control: reverting clone wire shape fails independent base64-item contract', async (t) => {
  const f = await setup(t);
  install(f, await variant("type: 'base64', media_type: audio.media_type", 'content_type: audio.media_type'));
  await run(f, 'voices.add', clone(f));
  assert.throws(() => assert.equal(f.calls.at(-1).body.audio[0].type, 'base64'), assert.AssertionError);
});

test('control: removing asset MIME/size validation fails malformed-upload acknowledgement assertion', async (t) => {
  const f = await setup(t); f.reply = () => ({ status: 200, data: { data: { asset_id: 'asset_fake-1', mime_type: 'text/plain', size_bytes: 999 } } });
  install(f, await variant('v.mime_type === audio.media_type && Number.isSafeInteger(v.size_bytes) && v.size_bytes === audio.bytes.length', 'true'));
  const got = await run(f, 'assets.upload_audio', { path: f.file, idempotency_key: 'invented-key-123' });
  assert.throws(() => assert.equal(got.status, 'vendor_error'), assert.AssertionError);
});

test('control: corrupting multipart sample bytes fails independent decoded-audio equality', async (t) => {
  const f = await setup(t);
  install(f, await variant('Buffer.concat([head, audio.bytes, tail])', 'Buffer.concat([head, Buffer.alloc(audio.bytes.length), tail])'));
  await run(f, 'assets.upload_audio', { path: f.file, idempotency_key: 'invented-key-123' });
  const body = Buffer.from(f.calls.at(-1).binary_body.base64, 'base64');
  const sample = body.subarray(body.indexOf('\r\n\r\n') + 4, body.lastIndexOf('\r\n--'));
  assert.throws(() => assert.deepEqual(sample, fs.readFileSync(f.file)), assert.AssertionError);
});

test('control: removing video alternative check fails the incomplete-pair refusal assertion', async (t) => {
  const f = await setup(t);
  install(f, await variant('if (!((script && voiceId && !asset) || (asset && !script && !voiceId)))', 'if (false)'));
  const input = videoInput(); delete input.voice_id;
  const got = await run(f, 'videos.create', input);
  assert.throws(() => assert.equal(got.status, 'invalid_arguments'), assert.AssertionError);
});

test('control: removing chosen-engine readiness check fails the no-charged-render assertion', async (t) => {
  const f = await setup(t);
  f.reply = (req) => req.endpoint.includes('/looks/') ? { status: 200, data: { data: avatarLook({ supported_api_engines: ['avatar_v'] }) } } : f.defaultReply(req);
  install(f, await variant("if (selected.status !== 'completed' || !selected.supported_api_engines.includes(engine))", 'if (false)'));
  await run(f, 'videos.create', videoInput());
  assert.throws(() => assert.equal(f.calls.some((r) => r.method === 'POST'), false), assert.AssertionError);
});

test('control: fixed Avatar IV body fails caller-selected Avatar V engine assertion', async (t) => {
  const f = await setup(t);
  install(f, await variant('engine: { type: input.engine }', "engine: { type: 'avatar_iv' }"));
  const got = await run(f, 'videos.create', videoInput({ engine: 'avatar_v' }));
  assert.equal(got.video_id, 'video_fake-1');
  assert.equal(f.calls.at(-1).method, 'POST');
  assert.throws(() => assert.equal(f.calls.at(-1).body.engine.type, 'avatar_v'), assert.AssertionError);
});

test('control: substituting group id for chosen look fails the exact avatar_id assertion', async (t) => {
  const f = await setup(t); install(f, await variant('avatar_id: checked.selected.id', 'avatar_id: checked.selected.group_id'));
  await run(f, 'videos.create', videoInput());
  assert.throws(() => assert.equal(f.calls.at(-1).body.avatar_id, 'look_fake-1'), assert.AssertionError);
});

test('control: removing group membership requirement fails missing-group refusal', async (t) => {
  const f = await setup(t);
  f.reply = (req) => new URL(req.endpoint).pathname === '/v3/avatars' ? { status: 200, data: page([avatarGroup({ id: 'wrong-group' })]) } : f.defaultReply(req);
  install(f, await variant("if (!got.has_more) return { stop: invalid('avatar_id', 'look group membership unavailable') };", 'if (!got.has_more) break;'));
  const got = await run(f, 'videos.create', videoInput());
  assert.throws(() => assert.equal(got.status, 'invalid_arguments'), assert.AssertionError);
});

test('control: leaking JSON video status fields fails disclosure without invoking a media guard', async (t) => {
  const f = await setup(t, { video: true }); install(f, await variant('return { video_id: v.id, video_status:', 'return { ...v, video_id: v.id, video_status:'));
  const got = await run(f, 'videos.get', { video_id: 'video_fake-1' });
  assert.throws(() => noPrivate(got), /private field escaped/); assert.equal(f.media.requests.length, 0);
});

test('control: removing MP4 container check fails no-file assertion', async (t) => {
  const f = await setup(t, { video: true, media: { chunks: [Buffer.from('not an MP4')] } });
  install(f, await variant(' || !inspectMp4(bytes)', ''));
  const got = await run(f, 'videos.download', { video_id: 'video_fake-1' });
  assert.throws(() => assert.equal(got.file, undefined), assert.AssertionError);
});

test('control: allowing download of processing state fails no-file assertion', async (t) => {
  const f = await setup(t, { video: true });
  f.reply = (req) => { const res = f.defaultReply(req); res.data.data.status = 'processing'; return res; };
  install(f, await variant("if (got.video_status !== 'completed') return got;", ''));
  const got = await run(f, 'videos.download', { video_id: 'video_fake-1' });
  assert.throws(() => assert.equal(got.file, undefined), assert.AssertionError);
});

test('control: removing video wallet check fails no-render assertion on zero balance', async (t) => {
  const f = await setup(t);
  f.reply = (req) => req.endpoint.endsWith('/users/me') ? { status: 200, data: { data: { billing_type: 'wallet', wallet: { currency: 'usd', remaining_balance: 0 } } } } : f.defaultReply(req);
  install(f, await variant('w.wallet.remaining_balance <= 0', 'false'));
  await run(f, 'videos.create', videoInput());
  assert.throws(() => assert.equal(f.calls.some((r) => r.method === 'POST'), false), assert.AssertionError);
});
