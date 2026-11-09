import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extname} from 'node:path';
import {validateBrandBoards} from '../scripts/brand-boards.js';
import {renderBrandBoards} from '../scripts/brand-board-view.js';
import {launch} from '../../lib/browser-runtime/browser-runtime.js';

async function open(t,width=1280){
 const spec=JSON.parse(readFileSync(new URL('fixtures/brand-boards.json',import.meta.url)));
 spec.groups=[spec.groups[0]];for(const b of spec.boards)b.group=spec.groups[0].id;
 spec.boards[0].name='A longer board name that wraps across several lines beside its shorter neighbour';
 const valid=validateBrandBoards(spec,{add(path){const extension=extname(path),bytes=readFileSync(new URL('fixtures/'+path,import.meta.url));return {extension,uri:`data:${extension==='.svg'?'image/svg+xml':'font/ttf'};base64,${bytes.toString('base64')}`};}},()=>{});
 const browser=await launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width,height:900}});await page.route('**/*',r=>r.abort());
 await page.setContent(renderBrandBoards(valid));await page.evaluate(()=>document.fonts.ready);
 return page;
}
test('own-page pictures have equal boxes at desktop, card and phone widths',async t=>{
 const page=await open(t);
 for(const width of [1280,734,390,1280]){
  await page.setViewportSize({width,height:900});await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
  const sizes=await page.locator('.thumbnail-surface').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height,colour:getComputedStyle(n).backgroundColor,ground:getComputedStyle(n.querySelector('.brand-board')).backgroundColor};}));
  for(const size of sizes){assert.equal(size.width,sizes[0].width);assert.ok(Math.abs(size.height-sizes[0].height)<.1,JSON.stringify(sizes));assert.equal(size.colour,size.ground);}
 }
});
test('own-page cards in a row share height and names share a top with unequal captions',async t=>{
 const page=await open(t),cards=await page.locator('.board-option').evaluateAll(ns=>ns.map(n=>({height:n.getBoundingClientRect().height,top:n.querySelector('h2').getBoundingClientRect().top})));
 assert.equal(cards[0].height,cards[1].height);assert.equal(cards[0].top,cards[1].top);
});
test('own-page taller art fits the unchanged box without cropping, including after a whole-view round trip',async t=>{
 const page=await open(t,390);
 const result=await page.locator('.thumbnail-surface').first().evaluate(surface=>{
  const board=surface.querySelector('.brand-board'),before=surface.getBoundingClientRect().height,zoom=parseFloat(getComputedStyle(board).zoom);
  board.querySelector('.rules').style.minHeight='5000px';window.dispatchEvent(new Event('resize'));
  const box=surface.getBoundingClientRect(),inside=r=>r.left>=box.left-.5&&r.right<=box.right+.5&&r.top>=box.top-.5&&r.bottom<=box.bottom+.5;
  const cropped=[...board.querySelectorAll('.board-row,.whole-foot,img')].filter(n=>!inside(n.getBoundingClientRect())).map(n=>n.className);
  const walker=document.createTreeWalker(board,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){if(!walker.currentNode.textContent.trim())continue;const r=document.createRange();r.selectNode(walker.currentNode);if([...r.getClientRects()].some(r=>!inside(r)))cropped.push(walker.currentNode.textContent);}
  return {before,after:box.height,box:box.toJSON(),art:board.getBoundingClientRect().toJSON(),fits:inside(board.getBoundingClientRect()),shrunk:parseFloat(getComputedStyle(board).zoom)<zoom,cropped};
 });
 assert.equal(result.after,result.before);assert.ok(result.fits&&result.shrunk,JSON.stringify(result));assert.deepEqual(result.cropped,[]);
 await page.locator('.board-thumbnail').first().click();await page.locator('.whole-view:target .board-nav a').first().click();
 assert.equal(await page.locator('.thumbnail-surface').first().evaluate(n=>n.getBoundingClientRect().height),result.before);
});
