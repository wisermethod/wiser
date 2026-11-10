import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portable } from './portable-loader.js';
const boundary = await portable(new URL('../scripts/browser-core.js', import.meta.url));
const core = await portable(new URL('../scripts/render-core.js', import.meta.url));
test('answer and file caps reject the whole result, including exact boundary', () => {
  assert.throws(() => boundary.result({text:'a'.repeat(48000)}, []), /48000-character/);
  assert.throws(() => boundary.result({}, [{bytes:new Uint8Array(4194304)}]), /4 MiB/);
});
test('graph executes without Node globals, file count and geometry are bounded', async () => {
  await assert.rejects(core.renderHtml({}, []), /exactly one file/);
  await assert.rejects(core.renderHtml({}, [{bytes:new Uint8Array(),name:'x.html'},{bytes:new Uint8Array(),name:'y.html'}]), /exactly one file/);
  assert.throws(() => boundary.pixels(8192,8192), /pixels in total/);
});
test('screen rejects mixed DNS, unknown DNS results, credentials and non-web schemes', async () => {
  for (const addresses of [[{address:'93.184.216.34'},{address:'10.0.0.1'}], [{address:'bad'}], []]) await assert.rejects(boundary.screen('https://public.example', async () => addresses));
  await assert.rejects(boundary.screen('https://user:password@public.example', async () => []), /credentials/);
  await assert.rejects(boundary.screen('file:///etc/passwd', async () => []), /http or https/);
});
test('host fetch may not follow redirects on its own', async () => {
  await assert.rejects(boundary.addressRoutes({}, 'https://public.example/start', { lookup: async () => ['93.184.216.34'], fetch: async () => ({redirected:true,body:null,url:'http://127.0.0.1/',status:200}) }, new AbortController().signal), /automatically/);
});
test('job timeout closes its context, aborts host fetch, and returns no partial result', async () => {
  // A controlled clock drives the real timeout path without spending a minute.
  const { readFileSync } = await import('node:fs');
  const { SourceTextModule, createContext } = await import('node:vm');
  let expire, closed=false, signal;
  const context = createContext({URL,Uint8Array,TextEncoder,TextDecoder,DataView,AbortController,setTimeout:fn=>{expire=fn;return 1},clearTimeout:()=>{}});
  const module = new SourceTextModule(readFileSync(new URL('../scripts/browser-core.js',import.meta.url),'utf8'),{context,identifier:new URL('../scripts/browser-core.js',import.meta.url).href});
  const dependencies=new Map();
  await module.link((name,parent)=>{const url=new URL(name,parent.identifier);if(!dependencies.has(url.href))dependencies.set(url.href,new SourceTextModule(readFileSync(url,'utf8'),{context,identifier:url.href}));return dependencies.get(url.href)});await module.evaluate();
  const promise=module.namespace.withPage({newContext:async()=>({addInitScript:async()=>{},setOffline:async()=>{},routeWebSocket:async()=>{},newPage:async()=>({setDefaultTimeout(){},setDefaultNavigationTimeout(){}}),close:async()=>{closed=true}})}, {}, async (_,__,s)=>{signal=s;return new Promise(()=>{})});
  while(!signal) await Promise.resolve(); expire();
  await assert.rejects(promise,/60 seconds/);assert.equal(closed,true);assert.equal(signal.aborted,true);
});
test('deadline also bounds context creation and closes a context arriving late', async () => {
  let expire, completeContext, closed=false;
  const core=await portable(new URL('../scripts/browser-core.js',import.meta.url),{setTimeout:fn=>{expire=fn;return 1},clearTimeout:()=>{}});
  const result=core.withPage({newContext:()=>new Promise(resolve=>{completeContext=resolve})},{},async()=>{throw new Error('late work must not run')});
  expire();await assert.rejects(result,/60 seconds/);
  completeContext({close:async()=>{closed=true}});
  for(let i=0;i<5;i++)await Promise.resolve();
  assert.equal(closed,true);
});
test('a stuck close cannot turn a completed render into an unbounded job', async () => {
  let expire, closing=false;
  const core=await portable(new URL('../scripts/browser-core.js',import.meta.url),{setTimeout:fn=>{expire=fn;return 1},clearTimeout:()=>{}});
  const result=core.withPage({newContext:async()=>({addInitScript:async()=>{},setOffline:async()=>{},routeWebSocket:async()=>{},newPage:async()=>({setDefaultTimeout(){},setDefaultNavigationTimeout(){}}),close:()=>{closing=true;return new Promise(()=>{})}})},{},async()=>({finished:true}));
  while(!closing)await Promise.resolve();
  expire();await assert.rejects(result,/60 seconds/);
});
