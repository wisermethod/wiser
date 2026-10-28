import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modules } from '../index.js';
import { inspectWav, isMp3 } from '../audio.js';
import { createTestGateway, putActive, confirmCall } from '../../../gateway/test/fake-provider.js';
import { statusSignal, STATUS } from '../../../gateway/src/errors.js';
import { setup, run, scene, voice, wav, mp3, hash, wire, page, characterTimings, speechAnswer, noPrivate, MODULES, videoInput, ADDRESS, PRIVATE, SIGNATURE } from './fixtures.js';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = JSON.parse(fs.readFileSync(join(DIR, 'manifest.json')));
const clone = (f, extra = {}) => ({ name: 'Invented clone', path: f.file, idempotency_key: 'invented-key-123', ...extra });
const bases = (f) => ({ 'speech.synthesize': scene(), 'voices.list': {}, 'voices.get': { voice_id: 'voice_fake-1' }, 'voices.add': clone(f),
  'voices.delete': { voice_id: 'voice_fake-1' }, 'avatars.list': {}, 'avatars.list_looks': {}, 'assets.upload_audio': { path: f.file, idempotency_key: 'invented-key-123' }, 'videos.create': videoInput(), 'videos.get': { video_id: 'video_fake-1' }, 'videos.download': { video_id: 'video_fake-1' }, 'account.wallet': {}, 'account.permissions': {} });
const noFiles = (f) => assert.deepEqual(fs.existsSync(join(f.home, 'outputs')) ? fs.readdirSync(join(f.home, 'outputs')) : [], []);

// Keep the template's schema-enforcement block: the actual gateway refuses
// undeclared keys, mistyped fields, missing required fields and non-object inputs.
test('manifest/export parity, exact thirteen actions and template schema-enforcement block', async (t) => {
  const f = await setup(t);
  assert.deepEqual(Object.keys(modules), MODULES);
  assert.equal(Object.keys(bases(f)).length, 13);
  for (const [mod, definition] of Object.entries(MANIFEST.modules)) {
    assert.deepEqual(Object.keys(definition.actions).sort(), Object.keys(modules[mod]).sort());
    assert.deepEqual(definition.auth, { provider: 'catalog', toolkit: 'HEYGEN', scheme: 'API_KEY', privilege: 'write' });
    assert.equal(definition.unwrap_token, false); assert.equal(definition.fallback, 'none');
    for (const [name, row] of Object.entries(definition.actions)) {
      const id = `${mod}.${name}`, base = bases(f)[id];
      assert.equal(row.proxy_body_max_bytes, 4100000); assert.deepEqual(row.execution, { prefer: 'proxy' });
      if (id === 'videos.create') assert.equal(row.standing_approval.kind, 'pay');
      else assert.equal(row.standing_approval, undefined);
      const before = f.calls.length;
      const got = await run(f, id, base);
      assert.ok(f.calls.length > before, `${id} reaches fake provider`);
      assert.equal(got.status, undefined, `${id}: ${JSON.stringify(got)}`);
      const bads = [{ ...base, undeclared: 'example' }];
      for (const key of row.input.required) { const bad = { ...base }; delete bad[key]; bads.push(bad); }
      for (const [key, prop] of Object.entries(row.input.properties)) {
        bads.push({ ...base, [key]: prop.type === 'string' ? 12345 : 'mistyped' });
        if (prop.enum) bads.push({ ...base, [key]: 'not-in-enum' });
        if (prop.pattern) bads.push({ ...base, [key]: ' ! ' });
        if (prop.minLength) bads.push({ ...base, [key]: '' });
        if (prop.maxLength) bads.push({ ...base, [key]: 'a'.repeat(prop.maxLength + 1) });
        if (prop.minimum !== undefined) bads.push({ ...base, [key]: prop.minimum - 1 });
        if (prop.maximum !== undefined) bads.push({ ...base, [key]: prop.maximum + 1 });
        if (prop.type === 'integer') bads.push({ ...base, [key]: 1.5 });
      }
      const acceptedCalls = f.calls.length;
      for (const input of bads) assert.equal((await run(f, id, input)).status, 'invalid_arguments', `${id}: ${JSON.stringify(input).slice(0,100)}`);
      for (const input of [null, [], 'example', 1]) assert.deepEqual(await f.gw.execute({ action: `heygen.${id}`, input }), { status: 'invalid_arguments', field: 'input' });
      assert.equal(f.calls.length, acceptedCalls, `${id}: schema violation sent`);
    }
  }
  for (const file of ['CONNECTOR.md','auth.md','manifest.json','index.js','audio.js','package.json']) assert.doesNotMatch(fs.readFileSync(join(DIR,file),'utf8'), /\{\{[A-Z_]+\}\}/);
});

test('residual code-point and numeric bounds refuse before any transport, preserving exact whitespace', async (t) => {
  const f = await setup(t);
  const cases = [ ['speech.synthesize', scene('𐐀'.repeat(5001)), 'text'], ['speech.synthesize', { ...scene(), language: 'aa-'.repeat(12)+'aa' }, 'language'],
    ...[-0.01,1.01,NaN,Infinity].map((expressiveness_boost) => ['speech.synthesize',{ ...scene(), expressiveness_boost },'expressiveness_boost']),
    ['voices.add',clone(f,{ name:'𐐀'.repeat(65) }),'name'], ['voices.add',clone(f,{ path:'/'.repeat(4097) }),'path'],
    ['voices.add',clone(f,{ language:'a'.repeat(33) }),'language'] ];
  for (const mod of ['voices','avatars']) for (const name of mod === 'voices' ? ['list'] : ['list','list_looks']) {
    cases.push([`${mod}.${name}`,{ limit: 0 },'limit'],[`${mod}.${name}`,{ limit: mod === 'voices' ? 101 : 51 },'limit'],[`${mod}.${name}`,{ token:'a'.repeat(2049) },'token']);
  }
  for (const [id,input,key] of cases) {
    const [mod,name] = id.split('.');
    assert.deepEqual(await modules[mod][name](input, { proxy() { assert.fail('invalid input transported'); } }), { status:'invalid_arguments',field:key });
  }
  const got = await run(f,'speech.synthesize',scene(' \n ')); assert.equal(got.characters,3);
  assert.equal(f.calls.find((r) => r.method === 'POST').body.text,' \n ');
  assert.equal((await run(f,'voices.add',clone(f,{name:'𐐀'.repeat(64)}))).accepted,true);
});

test('three varied whole scenes and all models preserve bytes, hashes, timings and defaults', async (t) => {
  const f = await setup(t);
  const models = MANIFEST.modules.speech.actions.synthesize.input.properties.model.enum;
  for (const [i,text] of ['Short ASCII.','a'.repeat(2224),'𐐀'.repeat(5000)].entries()) {
    const before = f.calls.length;
    const input = { ...scene(text,models[i]), ...(i === 0 ? {} : { expressiveness_boost:i-1, language:'en-US' }) };
    const got = await run(f,'speech.synthesize',input);
    const posted = f.calls.slice(before).filter((r) => r.method === 'POST');
    assert.equal(posted.length,1);
    assert.deepEqual(posted[0].body, { text, voice_id:input.voice_id, model:models[i], with_timestamps:true, expressiveness_boost:i === 0 ? 0.5 : i-1, ...(i === 0 ? {} : {language:'en-US'}) });
    assert.deepEqual(got.original_characters,characterTimings(text)); assert.equal(got.characters,Array.from(text).length);
    assert.equal(got.duration,1.25); assert.equal(got.sample_duration,1);
    assert.deepEqual(fs.readFileSync(got.file.path),wav()); assert.equal(got.file.sha256,hash(wav())); assert.equal(got.file.bytes,wav().length); assert.equal(got.file.media_type,'audio/wav');
    assert.match(got.file.path,/[/\\][0-9a-f-]{36}\.wav$/);
    assert.equal(fs.statSync(got.file.path).mode & 0o777,0o600);
    noPrivate(got);
  }
  assert.equal(f.media.requests.length,3);
  for (const opt of f.media.options) {
    assert.equal(opt.servername,'resource2.heygen.ai');
    assert.deepEqual(opt.headers,{ Host:'resource2.heygen.ai','Accept-Encoding':'identity' });
    assert.equal(opt.auth,undefined);
  }
  const audit = fs.readFileSync(join(f.home,'audit.jsonl'),'utf8'); noPrivate(audit);
});

test('synthesis proves private membership across pages and rejects professional or nonready voices', async (t) => {
  const f = await setup(t); const original = f.fake.auth.proxy;
  for (const extra of [{mode:'professional'},{status:'PENDING'},{status:'FAILED'}]) {
    f.reply = (req) => ({ status:200,data:new URL(req.endpoint).pathname === '/v3/models/audio/voices' ? page([voice()]) : {data:voice(extra)} });
    const before=f.calls.length; assert.equal((await run(f,'speech.synthesize',scene())).status,'invalid_arguments');
    assert.equal(f.calls.slice(before).some((r)=>r.method==='POST'),false);
  }
  f.reply=(req)=>({status:200,data:page([])});
  assert.equal((await run(f,'speech.synthesize',scene())).status,'invalid_arguments');
  f.reply=(req)=>{
    const path=new URL(req.endpoint).pathname;
    if(path==='/v3/models/audio/voices') return {status:200,data:page(req.parameters.some(p=>p.name==='token')?[voice()]:[voice({id:'other'})],req.parameters.some(p=>p.name==='token')?{}:{has_more:true,next_token:'page-2'})};
    if(path.endsWith('/voice_fake-1'))return {status:200,data:{data:voice()}};
    return {status:200,data:speechAnswer(req.body.text)};
  };
  assert.equal((await run(f,'speech.synthesize',scene())).characters,2);
  f.reply=()=>({status:200,data:page([voice({id:'other'})],{has_more:true,next_token:'repeated'})});
  const before=f.calls.length; assert.equal((await run(f,'speech.synthesize',scene())).status,'vendor_error');assert.equal(f.calls.length-before,2);
});

test('paid synthesis requires same-credential self-serve USD wallet and sufficient balance; free never falls back', async(t)=>{
  const f=await setup(t);const original=f.fake.auth.proxy;
  for(const data of [{billing_type:'subscription',wallet:null},{billing_type:'wallet',wallet:null},{billing_type:'wallet',wallet:{currency:'eur',remaining_balance:5}},{billing_type:'wallet',wallet:{currency:'usd',remaining_balance:0}},{billing_type:'wallet',wallet:{currency:'usd',remaining_balance:NaN}}]){
    f.fake.auth.proxy=async(req,opts)=>new URL(req.endpoint).pathname==='/v3/users/me' ? (f.calls.push(req),{status:200,data:{data}}):original(req,opts);
    const before=f.calls.length;const got=await run(f,'speech.synthesize',scene('Hi','heygen-voice-1'));
    assert.equal(got.status,'vendor_error');assert.equal(f.calls.slice(before).some(r=>r.method==='POST'),false);
  }
  f.fake.auth.proxy=original;
  const got=await run(f,'speech.synthesize',scene('a'.repeat(5000),'heygen-voice-1'));assert.equal(got.characters,5000);
  const calls=f.calls.slice(-4);assert.ok(calls.every(r=>r.providerAccountId==='fake-acct-heygen-speech'));
});

test('every malformed timing shape, duration and WAV container stops with no output',async(t)=>{
  const f=await setup(t);const original=f.fake.auth.proxy;
  const bads=[undefined,null,[],[{}],[{text:'Hi',start_time:NaN,end_time:1}],[{text:'Hi',start_time:-1,end_time:1}],[{text:'Hi',start_time:1,end_time:0}],
    [{text:'H',start_time:1,end_time:2},{text:'i',start_time:0,end_time:2}],[{text:'other',start_time:0,end_time:1}]];
  for(const original_characters of bads){
    f.fake.auth.proxy=async(req,opts)=>req.method==='POST'?{status:200,data:{data:{audio_url:ADDRESS,duration:1,original_characters}}}:original(req,opts);
    const got=await run(f,'speech.synthesize',scene());assert.equal(got.status,'vendor_error');noPrivate(got);noFiles(f);
  }
  for(const duration of [0,-1,NaN,Infinity,'1']){
    f.fake.auth.proxy=async(req,opts)=>req.method==='POST'?{status:200,data:{data:{...speechAnswer('Hi').data,duration}}}:original(req,opts);
    assert.equal((await run(f,'speech.synthesize',scene())).status,'vendor_error');noFiles(f);
  }
  for(const mutate of [b=>b.subarray(0,b.length-1),b=>{b.write('RF64');return b;},b=>{b.writeUInt32LE(0,40);return b;},b=>{b.writeUInt16LE(2,22);return b;},b=>{b.writeUInt32LE(48000,24);return b;},b=>{b.writeUInt16LE(8,34);return b;}])assert.equal(inspectWav(mutate(wav()),true),null);
});

test('safe container walker rejects truncated, duplicate and misaligned data; MP3 is complete frames, not a label',()=>{
  assert.equal(inspectWav(wav(),true).duration,1);assert.equal(isMp3(mp3()),true);
  for(const b of [Buffer.from('ID3'),Buffer.from('not audio'),mp3().subarray(0,416),Buffer.concat([mp3(),Buffer.from([1])])])assert.equal(isMp3(b),false);
  const b=wav();b.writeUInt32LE(88201,40);assert.equal(inspectWav(b),null);
});

test('clone JSON independently decodes exact MP3/WAV bytes, options, Unicode and idempotency header',async(t)=>{
  const f=await setup(t);
  for(const [ext,bytes,type] of [['mp3',mp3(),'audio/mpeg'],['wav',wav(),'audio/wav']]){
    const path=join(f.home,`recording.${ext}`);fs.writeFileSync(path,bytes);
    const name='Quotes " \\ and\r\nUnicode 𐐀';
    assert.deepEqual(await run(f,'voices.add',clone(f,{name,path,similarity:'high',remove_background_noise:false,language:'en-US'})),{voice_id:'clone_fake-1',accepted:true});
    const req=f.calls.at(-1);assert.equal(req.method,'POST');assert.equal(req.binary_body,undefined);assert.equal(req.body.mode,'instant');assert.equal(req.body.name,name);assert.equal(req.body.audio.length,1);
    assert.equal(req.body.audio[0].media_type,type);assert.equal(req.body.audio[0].type,'base64');assert.equal(req.body.audio[0].content_type,undefined);assert.deepEqual(Buffer.from(req.body.audio[0].data,'base64'),bytes);
    assert.equal(req.body.similarity,'high');assert.equal(req.body.remove_background_noise,false);assert.equal(req.body.language,'en-US');
    assert.deepEqual(req.parameters,[{name:'Idempotency-Key',value:'invented-key-123',type:'header'}]);assert.equal(req.serialized.includes(path),false);
  }
  await run(f,'voices.add',clone(f));const req=f.calls.at(-1);assert.equal(req.body.similarity,'max');assert.equal(req.body.remove_background_noise,false);assert.equal(req.body.language,undefined);
  for(const similarity of ['medium','high','extra_high','max'])assert.equal((await run(f,'voices.add',clone(f,{similarity,remove_background_noise:true}))).accepted,true);
});

test('file caps include exactly 3000000, and refuse zero/3000001 before opening',async(t)=>{
  const f=await setup(t);
  for(const [ext,bytes]of [['mp3',mp3(3000000)],['wav',wav(3000000)]]){const path=join(f.home,`cap.${ext}`);fs.writeFileSync(path,bytes);assert.equal((await run(f,'voices.add',clone(f,{path}))).accepted,true);}
  for(const size of [0,3000001]){const path=join(f.home,'oversize.wav');fs.writeFileSync(path,Buffer.alloc(size));const opened=t.mock.method(fs,'openSync',()=>assert.fail('bad size opened'));const got=await modules.voices.add(clone(f,{path}),{});assert.equal(got.status,'invalid_arguments');assert.equal(opened.mock.callCount(),0);opened.mock.restore();}
});

test('protected names, links, FIFO and nonregular paths are refused without opening content',async(t)=>{
  const f=await setup(t);
  const link=join(f.home,'linked.mp3');fs.symlinkSync(f.file,link);const ancestor=join(f.home,'linked-parent');fs.symlinkSync(f.home,ancestor);
  const hard=join(f.home,'hard.mp3');fs.linkSync(f.file,hard);const fifo=join(f.home,'pipe.mp3');execFileSync('mkfifo',[fifo]);
  const config=process.platform==='darwin'?join(homedir(),'Library','Application Support','wiser'):process.platform==='win32'?join(process.env.APPDATA||join(homedir(),'AppData','Roaming'),'wiser'):join(process.env.XDG_CONFIG_HOME||join(homedir(),'.config'),'wiser');
  const paths=['relative.mp3','https://example.test/audio.mp3',link,join(ancestor,'sample.mp3'),join(ancestor,'..','sample.mp3'),hard,f.file,fifo,f.home,join(f.home,'.env.mp3'),join(f.home,'.env','sample.mp3'),join(f.home,'memory','sample.mp3'),join(config,'sample.mp3')];
  const opened=t.mock.method(fs,'openSync',()=>assert.fail('protected content opened'));
  for(const path of paths)assert.equal((await modules.voices.add(clone(f,{path}),{})).status,'invalid_arguments');assert.equal(opened.mock.callCount(),0);opened.mock.restore();assert.equal(f.calls.length,0);
});

test('unreadability, replacement and same-size concurrent changes are refused',async(t)=>{
  const f=await setup(t);const add=()=>modules.voices.add(clone(f),{});const open=fs.openSync;
  let mock=t.mock.method(fs,'openSync',()=>{throw new Error('invented private error');});assert.equal((await add()).status,'invalid_arguments');mock.mock.restore();
  mock=t.mock.method(fs,'openSync',function(path,flags){fs.unlinkSync(f.file);fs.writeFileSync(f.file,mp3());return open(path,flags);});assert.equal((await add()).status,'invalid_arguments');mock.mock.restore();
  const read=fs.readSync;let changed=false;mock=t.mock.method(fs,'readSync',function(...args){const n=read(...args);if(!changed){changed=true;fs.writeFileSync(f.file,Buffer.alloc(417));}return n;});assert.equal((await add()).status,'invalid_arguments');mock.mock.restore();
});

test('wrong extension/container cannot pass cloning; a 2xx answer with valid id means accepted',async(t)=>{
  const f=await setup(t);
  for(const [filename,bytes] of [['wrong.mp3',wav()],['wrong.wav',mp3()],['wrong.txt',mp3()],['truncated.wav',wav().subarray(0,80)]]){const path=join(f.home,filename);fs.writeFileSync(path,bytes);assert.equal((await run(f,'voices.add',clone(f,{path}))).status,'invalid_arguments');}
  for(const res of [{status:199,data:{data:{voice_id:'clone_fake-1'}}},{status:300,data:{data:{voice_id:'clone_fake-1'}}},{status:202,data:{data:{}}},{status:202,data:{data:{voice_id:''}}},{status:202,data:{data:{voice_id:'clone_fake-1',error:'raw-envelope-canary'}}}]){f.reply=()=>res;const got=await run(f,'voices.add',clone(f));assert.equal(got.status,'vendor_error');assert.equal(got.accepted,undefined);noPrivate(got);}
});

test('voice pages preserve states/nulls and recognized failure codes with strict cursors',async(t)=>{
  const f=await setup(t);
  f.reply=()=>({status:200,data:page([voice({status:'PENDING',language:null}),voice({id:'failed',status:'FAILED',language:undefined,failure_code:'TRAINING_FAILED',failure_message:ADDRESS})],{has_more:true,next_token:'opaque-page-2'})});
  const got=await run(f,'voices.list',{type:'private',limit:100,token:'previous'});assert.equal(got.voices[0].language,null);assert.equal(got.voices[0].status,'PENDING');assert.equal(got.voices[1].status,'FAILED');assert.equal(got.voices[1].failure_code,'TRAINING_FAILED');noPrivate(got);
  assert.deepEqual(f.calls.at(-1).parameters,[{name:'type',value:'private',type:'query'},{name:'limit',value:100,type:'query'},{name:'token',value:'previous',type:'query'}]);
  for(const envelope of [{data:[]},page([],{has_more:true,next_token:'next'}),page([voice()],{has_more:true}),page([voice()],{has_more:true,next_token:123}),page([voice()],{has_more:true,next_token:'same'}),page([voice()],{next_token:'contradictory'}),page([voice({status:'UNKNOWN'})]),page([voice({language:3})])]){f.reply=()=>({status:200,data:envelope});assert.equal((await run(f,'voices.list',{token:'same'})).status,'vendor_error');}
  f.reply=()=>({status:200,data:page()});assert.deepEqual(await run(f,'voices.list'),{voices:[],has_more:false,next_token:null});assert.deepEqual(f.calls.at(-1).parameters,[]);
});

test('delete requires private membership and exact confirmation and never revokes bindings',async(t)=>{
  const f=await setup(t);const original=f.fake.auth.proxy;f.reply=()=>({status:200,data:page([])});
  assert.equal((await run(f,'voices.delete',{voice_id:'public_voice'})).status,'invalid_arguments');assert.equal(f.calls.some(r=>r.method==='DELETE'),false);f.reply=null;
  for(const data of [{},null,{status:'error'},{status:'ok',error:ADDRESS},{status:'ok',success:false}]){f.fake.auth.proxy=async(req,opts)=>req.method==='DELETE'?{status:200,data:{data}}:original(req,opts);const got=await run(f,'voices.delete',{voice_id:'voice_fake-1'});assert.equal(got.status,'vendor_error');assert.equal(got.deleted,undefined);noPrivate(got);}
  f.fake.auth.proxy=original;assert.deepEqual(await run(f,'voices.delete',{voice_id:'voice_fake-1'}),{deleted:true,voice_id:'voice_fake-1'});for(const module of MODULES)assert.equal(f.store.getConnection({service:'heygen',module}).status,'ACTIVE');
});

test('multiple private/public avatar pages, duplicate names, equal group/look ids, nulls and all filters',async(t)=>{
  const f=await setup(t);const g=(id)=>({id,name:'Duplicate character',looks_count:3,default_voice_id:null,preview_image_url:ADDRESS,status:null,consent_status:null});
  const l=(id,group_id)=>({id,name:'Duplicate look',group_id,avatar_type:'photo_avatar',status:'completed',default_voice_id:null,supported_api_engines:['avatar_iv','avatar_v'],preview_image_url:ADDRESS,preview_video_url:ADDRESS});
  for(const ownership of ['private','public']){
    f.reply=(req)=>({status:200,data:page(req.parameters.some(p=>p.name==='token')?[g('group_2')]:[g('group_1')],req.parameters.some(p=>p.name==='token')?{}:{has_more:true,next_token:'next-page'})});
    const first=await run(f,'avatars.list',{ownership,limit:1});const second=await run(f,'avatars.list',{ownership,limit:1,token:first.next_token});assert.equal(first.groups[0].name,second.groups[0].name);assert.notEqual(first.groups[0].id,second.groups[0].id);noPrivate(first);noPrivate(second);
    for(const group_id of ['group_1','group_2']){f.reply=()=>({status:200,data:page([l(group_id,group_id),l('look_other',group_id)])});const got=await run(f,'avatars.list_looks',{ownership,group_id,avatar_type:'photo_avatar',limit:50,token:'opaque'});assert.equal(got.looks.length,2);assert.equal(got.looks[0].id,group_id);assert.equal(got.looks[0].group_id,group_id);noPrivate(got);assert.deepEqual(f.calls.at(-1).parameters.map(p=>p.name),['group_id','ownership','avatar_type','limit','token']);}
  }
  for(const bad of [l('look','wrong'),{...l('look','group_1'),supported_api_engines:'avatar_iv'},{...l('look','group_1'),avatar_type:'other'}]){f.reply=()=>({status:200,data:page([bad])});assert.equal((await run(f,'avatars.list_looks',{group_id:'group_1'})).status,'vendor_error');}
  f.reply=()=>({status:200,data:page([l('look',null)])});assert.equal((await run(f,'avatars.list_looks')).looks[0].group_id,null);
  f.reply=()=>({status:200,data:page([])});assert.deepEqual(await run(f,'avatars.list'),{groups:[],has_more:false,next_token:null});
});

test('account projections let human connect distinguish intended, full, read-only and broader grants',async(t)=>{
  const f=await setup(t);assert.deepEqual(await run(f,'account.wallet'),{billing_type:'wallet',wallet:{currency:'usd',remaining_balance:3}});
  const intended=['voices:write','videos:write','assets:write','avatars:read','account:read'];const matches=(p)=>p.scope_mode==='custom'&&p.scopes.length===intended.length&&intended.every(s=>p.scopes.includes(s));assert.equal(matches(await run(f,'account.permissions')),true);
  for(const data of [{scope_mode:'full',scopes:['*:*']},{scope_mode:'custom',scopes:['voices:read']},{scope_mode:'custom',scopes:[]},{scope_mode:'custom',scopes:[...intended,'avatars:write']}]){f.reply=()=>({status:200,data:{data:{...data,api_key:SIGNATURE,extra:ADDRESS}}});const got=await run(f,'account.permissions');assert.equal(matches(got),false);noPrivate(got);}
  for(const data of [{scope_mode:'custom',scopes:[1]},{scope_mode:1,scopes:[]},{scope_mode:'custom'}]){f.reply=()=>({status:200,data:{data}});assert.equal((await run(f,'account.permissions')).status,'vendor_error');}
  f.reply=()=>({status:200,data:{data:{billing_type:'subscription',wallet:null}}});assert.deepEqual(await run(f,'account.wallet'),{billing_type:'subscription',wallet:null});
  for(const remaining_balance of [NaN,Infinity,'3',null]){f.reply=()=>({status:200,data:{data:{billing_type:'wallet',wallet:{currency:'usd',remaining_balance}}}});assert.equal((await run(f,'account.wallet')).status,'vendor_error');}
});

test('exact 4100000/4100001 serialized budget includes account, Unicode escaping, headers and cursor',async(t)=>{
  const f=await setup(t);
  // Account length is deliberately synthetic; derive it from an independent UTF-8 serialization.
  for(const target of [4100000,4100001]){
    const input=clone(f,{name:'𐐀 " \\ \n'});
    const request={providerAccountId:'',endpoint:'https://api.heygen.com/v3/models/audio/voices',method:'POST',
      body:{mode:'instant',name:input.name,audio:[{type:'base64',media_type:'audio/mpeg',data:mp3().toString('base64')}],similarity:'max',remove_background_noise:false},
      parameters:[{name:'Idempotency-Key',value:input.idempotency_key,type:'header'}]};
    const account='a'.repeat(target-Buffer.byteLength(wire(request)));
    const row=f.store.getConnection({service:'heygen',module:'voices'});
    f.store.putConnection({...row,provider_account_id:account});f.fake.auth.setStatus(account,'ACTIVE');
    const before=f.calls.length;const got=await run(f,'voices.add',input);
    if(target===4100000){assert.equal(got.accepted,true);assert.equal(f.calls.length,before+1);const sent=f.calls.at(-1);assert.equal(Buffer.byteLength(sent.serialized),target);assert.equal(sent.budget,target);assert.ok(f.measurements.some(m=>m.count===target&&m.serialized===sent.serialized));}
    else{assert.deepEqual(got,{status:'vendor_error',reason:'proxy_body_too_large'});assert.equal(f.calls.length,before);}
  }
  await putActive(f.store,f.fake,{service:'heygen',module:'voices'});
  await run(f,'voices.list',{token:'𐐀"\\'.repeat(200),limit:100,type:'private'});
  const sent=f.calls.at(-1);assert.ok(f.measurements.some(m=>m.serialized===sent.serialized));assert.equal(sent.budget,4100000);
});

test('missing, unsupported, malformed and throwing measurements send nothing',async(t)=>{
  const f=await setup(t);
  for(const measurement of [undefined,()=>({supported:false}),()=>-1,()=>1.5,()=>NaN,()=>Infinity,()=>({count:1}),()=>{throw new Error(ADDRESS);}]){
    f.fake.auth.measureProxyBody=measurement;const before=f.calls.length;assert.deepEqual(await run(f,'account.wallet'),{status:'needs_provider_capability'});assert.equal(f.calls.length,before);
  }
});

test('all missing grants stop; hosted speech and denied policy access neither connection nor provider',async(t)=>{
  const f=await setup(t,{unbound:true});
  for(const[id,input]of Object.entries(bases(f)))assert.equal((await run(f,id,input)).status,'needs_connect');assert.equal(f.calls.length,0);
  const hosted=await createTestGateway({home:join(f.home,'hosted')});hosted.store.getConnection=()=>assert.fail('hosted speech read connection');hosted.fake.auth.listAccounts=()=>assert.fail('hosted speech touched provider');
  assert.equal((await hosted.gw.execute({action:'heygen.speech.synthesize',input:scene()})).status,'local_only');
  // The default readonly policy supplies the supported policy shape.
  const readonly=await createTestGateway({home:join(f.home,'readonly'),role:'readonly'});
  assert.equal((await readonly.gw.execute({action:'heygen.voices.add',input:clone(f)})).status,'denied');
});

test('always-confirmed writes require single-use matching input, id, key, account and label',async(t)=>{
  const f=await setup(t);const original=clone(f);const call={action:'heygen.voices.add',input:original};
  assert.equal((await f.gw.execute({...call,confirm:true})).reason,'unmatched_confirm');assert.equal(f.calls.length,0);
  for(const changed of [{name:'Changed'}, {path:join(f.home,'different.mp3')},{idempotency_key:'different-key-123'}]){
    assert.equal((await f.gw.execute(call)).status,'needs_confirmation');const got=await f.gw.execute({...call,input:{...original,...changed},confirm:true});assert.equal(got.status,'needs_confirmation');assert.equal(got.reason,'unmatched_confirm');
  }
  await f.gw.execute(call);assert.equal((await f.gw.execute({...call,confirm:true})).accepted,true);const before=f.calls.length;
  assert.equal((await f.gw.execute({...call,confirm:true})).status,'needs_confirmation');assert.equal(f.calls.length,before);
  const del={action:'heygen.voices.delete',input:{voice_id:'voice_fake-1'}};await f.gw.execute(del);
  assert.equal((await f.gw.execute({...del,input:{voice_id:'other'},confirm:true})).reason,'unmatched_confirm');
  await f.gw.execute(call);const row=f.store.getConnection({service:'heygen',module:'voices'});f.store.putConnection({...row,provider_account_id:'other-account'});f.fake.auth.setStatus('other-account','ACTIVE');
  assert.equal((await f.gw.execute({...call,confirm:true})).reason,'unmatched_confirm');
  f.store.putConnection({...row,label:'other-label'});
  assert.equal((await f.gw.execute({...call,label:'other-label',confirm:true})).reason,'unmatched_confirm');
  for(const v of f.gw.pendingConfirmations.values())noPrivate(v);
});

test('sole custom-toolkit account adoption, ambiguity, labelled connect and shared-credential revocation',async(t)=>{
  const f=await setup(t,{unbound:true});const account='synthetic-shared-account';f.fake.auth.setStatus(account,'ACTIVE');
  f.fake.auth.listAccounts=async()=>[{id:account,toolkit:'CUSTOM_HEYGEN',status:'ACTIVE'}];
  assert.equal((await run(f,'account.wallet')).wallet.currency,'usd');assert.equal(f.store.getConnection({service:'heygen',module:'account'}).provider_account_id,account);
  f.fake.auth.listAccounts=async()=>[{id:account,toolkit:'HEYGEN',status:'ACTIVE'},{id:'ambiguous-account',toolkit:'HEYGEN',status:'ACTIVE'}];
  const ambiguous=await createTestGateway({home:join(f.home,'ambiguous'),fake:f.fake});
  assert.equal((await ambiguous.gw.execute({action:'heygen.voices.list',input:{}})).status,'needs_connect');
  const started=await f.gw.startConnect({service:'heygen',module:'voices',label:'workspace'});
  const labelled=f.store.getConnection({service:'heygen',module:'voices',label:'workspace'});assert.ok(labelled);f.fake.auth.setStatus(labelled.provider_account_id,'ACTIVE');
  await f.gw.connectStatus({service:'heygen',module:'voices',label:'workspace'});
  for(const module of MODULES)assert.equal(f.store.getConnection({service:'heygen',module,label:'workspace'}).provider_account_id,labelled.provider_account_id);
  const stop=await f.gw.disconnect({service:'heygen',module:'voices',label:'workspace'});assert.equal(stop.status,'needs_confirmation');assert.equal(stop.modules_ending.length,6);
  const ended=await f.gw.disconnect({service:'heygen',module:'voices',label:'workspace',confirm:true,provider_account_id:labelled.provider_account_id});assert.equal(ended.status,'disconnected');
  for(const module of MODULES)assert.equal(f.store.getConnection({service:'heygen',module,label:'workspace'}),null);
});

test('provider failures and thrown statuses are sanitized, preserve budget reason and never retry',async(t)=>{
  const f=await setup(t);
  for(const code of [401,403,402,409,413,422,429,500,503]){
    f.reply=()=>({status:code,error:{code:'vendor_error'},data:{raw:'raw-envelope-canary',audio_url:ADDRESS},headers:{cookie:SIGNATURE}});
    const before=f.calls.length;const got=await run(f,'account.wallet');assert.equal(got.status,'vendor_error');assert.equal(got.http_status,code);assert.equal(f.calls.length,before+1);noPrivate(got);
  }
  for(const error of [new Error(ADDRESS,{cause:new Error(SIGNATURE)}),statusSignal(STATUS.VENDOR_ERROR,{reason:'proxy_body_too_large',detail:ADDRESS}),statusSignal(STATUS.NEEDS_PROVIDER_CAPABILITY,{raw:ADDRESS})]){
    f.reply=()=>{throw error;};const before=f.calls.length;const got=await run(f,'account.wallet');assert.ok(['vendor_error','needs_provider_capability'].includes(got.status));if(error.object?.reason==='proxy_body_too_large')assert.equal(got.reason,'proxy_body_too_large');assert.equal(f.calls.length,before+1);noPrivate(got);
  }
});

for (const [name, media, address, reason, detail] of [
  ['malformed container', {chunks:[Buffer.from('not a WAV container')]}, ADDRESS, 'unexpected answer'],
  ['HTTP redirect', {status:302,headers:{location:ADDRESS}}, ADDRESS, 'media_download_failed','redirect_refused'],
  ['download HTTP unauthorized', {status:401}, ADDRESS, 'media_download_failed','http_refused'],
  ['private DNS', {v4:['127.0.0.1'],v6:[]}, ADDRESS, 'media_download_failed','address_refused'],
  ['mixed DNS', {v4:['93.184.216.35','10.0.0.1'],v6:[]}, ADDRESS, 'media_download_failed','address_refused'],
  ['private host', {}, `https://other.test/${PRIVATE}`, 'media_download_failed','host_refused'],
  ['userinfo', {}, `https://user@resource2.heygen.ai/${PRIVATE}`, 'media_download_failed','invalid_url'],
  ['fragment', {}, `${ADDRESS}#private`, 'media_download_failed','invalid_url'],
  ['non-HTTPS', {}, `http://resource2.heygen.ai/${PRIVATE}`, 'media_download_failed','invalid_url'],
  ['wrong port', {}, `https://resource2.heygen.ai:444/${PRIVATE}`, 'media_download_failed','invalid_url'],
  ['IP literal', {}, `https://127.0.0.1/${PRIVATE}`, 'media_download_failed','invalid_url'],
  ['incomplete response', {complete:false}, ADDRESS, 'media_download_failed','truncated'],
  ['compressed response', {headers:{'content-encoding':'gzip'}}, ADDRESS, 'media_download_failed','encoding_refused'],
]) test(`speech ${name} refuses privately without output or a second generation`,async(t)=>{
  const f=await setup(t,{media});const original=f.fake.auth.proxy;
  f.fake.auth.proxy=async(req,opts)=>req.method==='POST'?{status:200,data:{data:{...speechAnswer(req.body.text).data,audio_url:address}}}:original(req,opts);
  const got=await run(f,'speech.synthesize',scene());assert.equal(got.status,'vendor_error');assert.equal(got.reason,reason);if(detail)assert.equal(got.detail,detail);
  noPrivate(got);noFiles(f);assert.ok(f.media.requests.length<=1);assert.equal(f.store.getConnection({service:'heygen',module:'speech'}).status,'ACTIVE');
});

test('download fixed deadline stops once and discards chunks with no file',async(t)=>{
  const f=await setup(t,{media:{slow:'body'}});const pending=run(f,'speech.synthesize',scene());
  for(let i=0;i<100 && !f.media.responses.length;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(f.media.responses.length);f.media.expire();const got=await pending;assert.equal(got.detail,'deadline');noPrivate(got);noFiles(f);assert.equal(f.calls.filter(r=>r.method==='POST').length,1);
});

test('WAV download exact cap publishes identical bytes; one over cap sends no second generation',async(t)=>{
  for(const size of [67108864,67108865])await t.test(String(size),async(t)=>{
    const bytes=size%2===0?wav(size):Buffer.alloc(size);const f=await setup(t,{media:{chunks:[bytes]}});
    const got=await run(f,'speech.synthesize',scene());
    if(size===67108864){assert.equal(got.file.bytes,size);assert.equal(got.file.sha256,hash(bytes));assert.deepEqual(fs.readFileSync(got.file.path),bytes);}
    else{assert.equal(got.detail,'over_cap');noFiles(f);}
    assert.equal(f.calls.filter(r=>r.method==='POST').length,1);assert.equal(f.media.requests.length,1);noPrivate(got);
  });
});

test('tool answers, evidence serialization, pending confirmations, audit and process output contain no media canary',async(t)=>{
  const f=await setup(t);const writes=[];
  const stdout=t.mock.method(process.stdout,'write',chunk=>{writes.push(String(chunk));return true;});
  const stderr=t.mock.method(process.stderr,'write',chunk=>{writes.push(String(chunk));return true;});
  let got;
  try { got=await f.gw.callTool('execute',{action:'heygen.speech.synthesize',input:scene()}); }
  finally { stdout.mock.restore();stderr.mock.restore(); }
  noPrivate(got);noPrivate(JSON.stringify({result:got}));noPrivate(writes);assert.equal(writes.length,0);
  const pending=await f.gw.execute({action:'heygen.voices.add',input:clone(f)});noPrivate(pending);
  for(const value of f.gw.pendingConfirmations.values())noPrivate(value);
  noPrivate(fs.readFileSync(join(f.home,'audit.jsonl'),'utf8'));
});

test('a valid WAV containing a private media address is refused before file publication',async(t)=>{
  const bytes=wav();bytes.write(ADDRESS,44);
  const f=await setup(t,{media:{chunks:[bytes]}});const got=await run(f,'speech.synthesize',scene());
  assert.equal(got.status,'vendor_error');assert.equal(got.reason,'output_refused');assert.equal(got.detail,'private_address');noFiles(f);noPrivate(got);
});
