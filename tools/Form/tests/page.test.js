import test from 'node:test';
import assert from 'node:assert/strict';
import {composePage} from '../scripts/page.js';
test('page shell, titles, JSON less-than escaping and script closing escaping',()=>{
 const form={title:'<A & "B">',questions:[],intro:'</script><img>'};const p=composePage({script:'const s="</ScRiPt>";',form});
 assert.ok(p.startsWith('<!DOCTYPE html>'));assert.match(p,/<html lang="en">/);assert.match(p,/name="viewport"/);assert.match(p,/<main id="root"><\/main>/);assert.match(p,/<title>&lt;A &amp; &quot;B&quot;&gt;<\/title>/);
 const json=p.match(/id="wiser-form">([^<]*)<\/script>/)[1];assert.ok(json.includes('\\u003c'));assert.deepEqual(JSON.parse(json),form);assert.ok(p.includes('<\\/ScRiPt>'));
 assert.ok(composePage({script:''}).includes('<title>Wiser form</title>'));assert.ok(composePage({script:'',form,title:'Override'}).includes('<title>Override</title>'));
});
for(const text of ['innerHTML','outerHTML','insertAdjacentHTML','document.write','<script src="x">','<link>','<img src=x>','<a href=x>'])test(`page refuses ${text}`,()=>assert.throws(()=>composePage({script:text}),/Refused page/));
test('engine is classic, safe DOM only, stylesheet contains no external fetches',async()=>{
 const {readFileSync}=await import('node:fs');const engine=readFileSync(new URL('../engine/engine.js',import.meta.url),'utf8');const css=readFileSync(new URL('../engine/style.css',import.meta.url),'utf8');
 assert.doesNotMatch(engine,/\b(?:import|export)\s|innerHTML|outerHTML|insertAdjacentHTML|document\.write/);assert.match(engine,/globalThis.WiserForm/);assert.doesNotMatch(css,/@import|url\s*\(/i);
});
