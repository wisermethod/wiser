import '../../lib/tests/isolated-home.js';
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
test('a member\'s words that name a sink, in the title or the form, are not refused as page code',()=>{
 const form={title:'Do not use innerHTML',questions:[{id:'q',type:'text',label:'Say href=x or document.write'}]};
 const page=composePage({script:'1',form});assert.ok(page.includes('<title>Do not use innerHTML</title>'));assert.ok(page.includes('document.write'));
 assert.throws(()=>composePage({script:'document.write(1)',form}),/Refused page/);
});
test('a title holding any text cannot move the form or the script out of place',()=>{
 const p=composePage({script:'ok',form:{title:'Hi',questions:[]},title:'\u0000DATA\u0000 </title><script>x</script>'});
 const body=p.slice(p.indexOf('<body>'));assert.ok(body.includes('<script type="application/json" id="wiser-form">'));
 assert.ok(p.includes('<title>\u0000DATA\u0000 &lt;/title&gt;&lt;script&gt;x&lt;/script&gt;</title>'));assert.equal((p.match(/<script\b/g)||[]).length,2);
});
test('local transport is a classic script and the closing timestamp is numeric JSON',async()=>{
 const {readFileSync}=await import('node:fs');const local=readFileSync(new URL('../engine/local.js',import.meta.url),'utf8');
 assert.doesNotMatch(local,/\b(?:import|export)\s|innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
 const p=composePage({script:local,closes:1793000000000});
 assert.equal(JSON.parse(p.match(/id="wiser-form-closes">([^<]*)<\/script>/)[1]),1793000000000);
 for(const closes of ['1793000000000',NaN,Infinity,null])assert.throws(()=>composePage({script:local,closes}),/finite number/);
 assert.ok(!composePage({script:local}).includes('id="wiser-form-closes"'));
});
