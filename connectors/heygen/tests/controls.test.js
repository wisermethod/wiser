// Plant faults only in in-memory module variants or cloned manifest declarations.
// Each control shows that an independent real-gateway assertion fails on the fault.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setup, run, scene, voice, page, speechAnswer, wav, noPrivate, ADDRESS } from './fixtures.js';

const source = fs.readFileSync(new URL('../index.js',import.meta.url),'utf8');
let sequence = 0;
async function variant(from,to) {
  assert.ok(source.includes(from),'the planted mutation still names its protection');
  const code = source.replace(from,to).replace("'./audio.js'",JSON.stringify(new URL('../audio.js',import.meta.url).href));
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
test('control: accepting HTTP 200 clone creation fails the expected-202 assertion',async(t)=>{
  const f=await setup(t);f.reply=()=>({status:200,data:{data:{voice_id:'clone_fake-1'}}});
  install(f,await variant('res.http_status === 202 &&','res.http_status === 200 &&'));
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
