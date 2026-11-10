import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portable } from './portable-loader.js';
const boundary=await portable(new URL('../scripts/browser-core.js',import.meta.url));
const core=await portable(new URL('../scripts/export-core.js',import.meta.url));
test('portable import graph, ZIP-only boundary and whole output caps',async()=>{
  await assert.rejects(core.exportPdf({},[]),/one ZIP/);
  await assert.rejects(core.exportPng({},[{name:'deck.html',bytes:new Uint8Array()}]),/one ZIP/);
  assert.throws(()=>boundary.result({text:'a'.repeat(48000)},[]),/48000-character/);
  assert.throws(()=>boundary.result({},[{bytes:new Uint8Array(4194304)}]),/4 MiB/);
});
test('the host retains ownership of its browser on failure',async()=>{
  let closed=false;
  await assert.rejects(boundary.withPage({newContext:async()=>({addInitScript:async()=>{},setOffline:async()=>{},routeWebSocket:async()=>{},newPage:async()=>({setDefaultTimeout(){},setDefaultNavigationTimeout(){}}),close:async()=>{closed=true}})}, {},async()=>{throw new Error('input failed')}),/input failed/);
  assert.equal(closed,true);
});
