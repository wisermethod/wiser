import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserSecurityCases } from './browser-security-cases.js';
import { portable } from './portable-loader.js';
import { launch } from '../../lib/browser-runtime/browser-runtime.js';
browserSecurityCases(new URL('../scripts/browser-core.js', import.meta.url));

const lookup = async () => ['93.184.216.34'];
function route(url) {
  return { request: () => ({ url: () => url, method: () => 'GET', headers: () => ({}), isNavigationRequest: () => false, resourceType: () => 'image' }), fulfill: async () => {}, abort: async () => {} };
}
test('asset and redirect ports require the exact nonstandard address named by the member', async () => {
  const core = await portable(new URL('../scripts/browser-core.js', import.meta.url));
  let handle, fetched = [];
  const context = { route: async (_, fn) => { handle = fn; } };
  const network = await core.addressRoutes(context, 'https://public.example:8443/page', { lookup, fetch: async url => {
    fetched.push(url); return new Response('ok');
  } }, new AbortController().signal);
  await handle(route('https://public.example:8443/asset'));
  await handle(route('https://public.example:6379/scan'));
  assert.throws(network.check, /port/);
  assert.equal(fetched.length, 2);
  const calls = [];
  await assert.rejects(core.addressRoutes(context, 'https://public.example/page', { lookup, fetch: async url => {
    calls.push(url); return new Response(null, {status:302,headers:{location:'http://public.example:6379/'}});
  } }, new AbortController().signal), /port/);
  assert.equal(calls.length, 1);
});

test('a small shared pool aborts all fetches at the first refused destination', async () => {
  const core = await portable(new URL('../scripts/browser-core.js', import.meta.url));
  let handle, active = 0, peak = 0, signals = [];
  const network = await core.addressRoutes({route: async (_, fn) => { handle = fn; }}, 'https://public.example/page', {lookup, fetch: async (url, {signal}) => {
    if (url.endsWith('/page')) return new Response('page');
    signals.push(signal); peak = Math.max(peak, ++active);
    return new Promise((_, reject) => signal.addEventListener('abort', () => { active--; reject(new Error('aborted')); }, {once:true}));
  }}, new AbortController().signal);
  const jobs = Array.from({length:200}, (_, i) => handle(route(`https://public.example/asset-${i}`)));
  while (!signals.length) await Promise.resolve();
  const refusal = handle(route('http://127.0.0.1/private'));
  await refusal;
  assert.ok(peak <= 4, `peak fetches: ${peak}`);
  assert.ok(signals.every(signal => signal.aborted));
  await Promise.all(jobs);
  assert.throws(network.check, /loopback/);
});

test('declared bytes are refused before reading and byte overflow cancels siblings', async () => {
  const core = await portable(new URL('../scripts/browser-core.js', import.meta.url));
  let reads = 0, cancelled = false;
  await assert.rejects(core.addressRoutes({}, 'https://public.example/page', {lookup, fetch: async () => ({ status:200, headers:new Headers({'content-length':'8388609'}), body:{getReader() { reads++; }, cancel:async()=>{cancelled=true;} } })}, new AbortController().signal), /8 MiB/);
  assert.equal(reads, 0); assert.equal(cancelled, true);
  let handle, signal, chunks = 0;
  const network = await core.addressRoutes({route:async(_,fn)=>{handle=fn;}}, 'https://public.example/page', {lookup,fetch:async(url,options)=>{
    if(url.endsWith('/page'))return new Response('x');
    signal=options.signal;
    return {status:200,headers:new Headers(),body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(++chunks <= 9 ? 1048576 : 0)}),cancel:async()=>{},releaseLock(){}})}};
  }},new AbortController().signal);
  await handle(route('https://public.example/huge'));
  assert.throws(network.check,/8 MiB/); assert.equal(signal.aborted,true); assert.equal(chunks,8);
});

function fakeBrowser({grow = false, wrong = false, failure} = {}) {
  let frozen = false, dimensions = {width:100,height:100}, options;
  const png = (width,height) => { const b = new Uint8Array(24); b.set([137,80,78,71,13,10,26,10]); b.set([73,72,68,82],12); const v = new DataView(b.buffer);v.setUint32(16,width);v.setUint32(20,height);return b; };
  const screenshot = async opts => {options=opts;const clip=opts.clip;return png(wrong ? 9000 : (clip?.width ?? dimensions.width), wrong ? 2 : (clip?.height ?? dimensions.height));};
  const page = {setDefaultTimeout(){},setDefaultNavigationTimeout(){},goto:async()=>{if(failure)throw failure;return null;},
    evaluate:async(fn)=> {if(String(fn).includes('scrollWidth')) {assert.ok(frozen,'freeze precedes measurement');const size={...dimensions};if(grow)dimensions={width:40000,height:40000};return size;} frozen=true;},
    $:async()=>({boundingBox:async()=>{assert.ok(frozen,'freeze precedes measurement');return {x:0,y:0,...dimensions};},screenshot}),
    setViewportSize:async()=>{if(grow)dimensions={width:40000,height:40000};},screenshot};
  const context={setOffline:async()=>{},addInitScript:async()=>{},routeWebSocket:async()=>{},newPage:async()=>page,route:async()=>{},close:async()=>{}};
  return {browser:{newContext:async()=>context},options:()=>options};
}
test('200 parallel one-MiB responses stay within the small pool and shared byte budget',async()=>{
  const core=await portable(new URL('../scripts/browser-core.js',import.meta.url));
  let handle, active=0, peak=0, received=0;
  const signals=[];
  const network=await core.addressRoutes({route:async(_,fn)=>{handle=fn;}},'https://public.example/page',{lookup,responseBody:bytes=>Buffer.from(bytes),fetch:async(url,{signal})=>{
    if(url.endsWith('/page'))return new Response(null);
    signals.push(signal);peak=Math.max(peak,++active);
    let sent=false,finished=false;
    const finish=()=>{if(!finished){finished=true;active--;}};
    return {status:200,headers:new Headers(),body:{getReader:()=>({read:async()=>{
      await new Promise(resolve=>setImmediate(resolve));
      if(signal.aborted){finish();throw new Error('aborted');}
      if(sent){finish();return {done:true};}
      sent=true;received+=1048576;return {done:false,value:new Uint8Array(1048576)};
    },cancel:async()=>{finish();},releaseLock(){}})}};
  }},new AbortController().signal);
  await Promise.all(Array.from({length:200},(_,i)=>handle(route(`https://public.example/image-${i}`))));
  assert.throws(network.check,/8 MiB/);assert.ok(peak<=4,`peak: ${peak}`);
  assert.ok(received<=12*1048576,`bytes read: ${received}`);assert.ok(signals.every(s=>s.aborted));
});
test('the 201st request cancels the shared transport and preserves the refusal',async()=>{
  const core=await portable(new URL('../scripts/browser-core.js',import.meta.url));
  let handle,count=0;const signals=[];
  const network=await core.addressRoutes({route:async(_,fn)=>{handle=fn;}},'https://public.example/page',{lookup,responseBody:bytes=>Buffer.from(bytes),fetch:async(_,{signal})=>{count++;signals.push(signal);return new Response(null);}},new AbortController().signal);
  await Promise.all(Array.from({length:210},(_,i)=>handle(route(`https://public.example/asset-${i}`))));
  assert.throws(network.check,/200 network requests/);assert.equal(count,200);assert.ok(signals.every(s=>s.aborted));
});
test('document Set-Cookie is stripped and asset fetches omit credentials',async()=>{
  const core=await portable(new URL('../scripts/browser-core.js',import.meta.url));
  let handle,headers;const options=[];
  const network=await core.addressRoutes({route:async(_,fn)=>{handle=fn;}},'https://public.example/page',{lookup,responseBody:bytes=>Buffer.from(bytes),fetch:async(_,opts)=>{options.push(opts);return new Response('ok',{headers:{'content-type':'text/html','set-cookie':'session=test'}});}},new AbortController().signal);
  const document=route('https://public.example/page');document.fulfill=async response=>{headers=response.headers;};
  await handle(document);await handle(route('https://public.example/asset'));network.check();
  assert.deepEqual(Object.keys(headers),['content-type']);
  assert.ok(options.every(o=>o.credentials==='omit'&&!Object.keys(o.headers).some(k=>k.toLowerCase()==='cookie')));
});
test('navigation timeout restores the documented requested millisecond sentence',async()=>{
  const core=await portable(new URL('../scripts/render-core.js',import.meta.url));
  const fake=fakeBrowser({failure:Object.assign(new Error('private timeout details'),{name:'TimeoutError'})});
  await assert.rejects(core.captureUrl({url:'https://public.example',timeout:1234},[],{...fake,lookup,fetch:async()=>new Response('x')}),error=>{
    assert.match(error.message,/within 1234 ms for https:\/\/public.example\//);assert.equal(error.message.includes('private timeout details'),false);return true;
  });
});
test('real HTML resize listener is inert before fitted capture',async()=>{
  const core=await portable(new URL('../scripts/render-core.js',import.meta.url)),browser=await launch();
  try {
    const bytes=new TextEncoder().encode('<body style="margin:0;width:100px;height:100px"><script>addEventListener("resize",()=>{document.body.style.width="9000px";document.body.style.height="9000px";});</script>x</body>');
    const out=await core.renderHtml({width:100},[{name:'index.html',bytes}],{browser});
    assert.equal(out.answer.width,100);assert.equal(out.answer.height,100);
  } finally {await browser.close();}
});
test('real full-page capture stays clipped when the document grows after measurement',async()=>{
  const core=await portable(new URL('../scripts/render-core.js',import.meta.url)),browser=await launch();
  try {
    const host={newContext:async options=>{
      const context=await browser.newContext(options);
      return new Proxy(context,{get(target,key){
        if(key==='newPage')return async()=>{
          const page=await target.newPage();
          return new Proxy(page,{get(target,key){
            if(key==='evaluate')return async(fn,arg)=>{
              const value=await target.evaluate(fn,arg);
              if(String(fn).includes('scrollWidth'))await target.evaluate(()=>{document.body.style.height='9000px';});
              return value;
            };
            const value=target[key];return typeof value==='function'?value.bind(target):value;
          }});
        };
        const value=target[key];return typeof value==='function'?value.bind(target):value;
      }});
    }};
    const out=await core.captureUrl({url:'https://public.example/page',width:100,height:80,fullPage:true},[],{browser:host,lookup,fetch:async()=>new Response('<body style="margin:0;width:100px;height:240px">x</body>',{headers:{'content-type':'text/html'}})});
    assert.equal(out.answer.width,100);assert.equal(out.answer.height,240);assert.equal(out.answer.fullPage,true);
  } finally {await browser.close();}
});
for(const url of [false,true]) {
  test(`${url?'URL full-page':'HTML fit'} capture clips the frozen accepted dimensions`,async()=>{
    const core=await portable(new URL('../scripts/render-core.js',import.meta.url)), fake=fakeBrowser({grow:true,fullPage:url});
    if(url)await core.captureUrl({url:'https://public.example',width:100,height:100,fullPage:true},[],{...fake,lookup,fetch:async()=>new Response('x')});
    else await core.renderHtml({width:100},[{name:'index.html',bytes:new Uint8Array()}],fake);
    assert.ok(fake.options().clip);assert.equal(fake.options().animations,'disabled');assert.notEqual(fake.options().fullPage,true);
  });
  test(`${url?'URL full-page':'HTML fit'} refuses an image outside accepted dimensions`,async()=>{
    const core=await portable(new URL('../scripts/render-core.js',import.meta.url)), fake=fakeBrowser({wrong:true});
    await assert.rejects(url ? core.captureUrl({url:'https://public.example',fullPage:true},[],{...fake,lookup,fetch:async()=>new Response('x')}) : core.renderHtml({width:100},[{name:'index.html',bytes:new Uint8Array()}],fake),/accepted|image size/);
  });
}
