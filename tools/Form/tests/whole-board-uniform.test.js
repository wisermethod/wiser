import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {browserKit} from './boards-harness.js';
import {wholeBoardForms} from './whole-board-fixtures.js';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});

for(const business of ['bakery','politician']){
 test(`${business}: every picture has the same box through resizing and mode changes`,async()=>{
  const h=await kit.open(wholeBoardForms(business).round1,734);
  try{
   for(const width of [734,390,560,734])for(const mode of ['light','dark']){
    await h.page.setViewportSize({width,height:900});
    await h.f.locator(`.board-controls [data-mode="${mode}"]`).click();
    const boxes=await h.f.locator('.thumbnail-surface').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height,background:getComputedStyle(n).backgroundColor,ground:getComputedStyle(n.querySelector('.brand-board')).backgroundColor};}));
    assert.equal(boxes.length,12);
    for(const box of boxes){assert.ok(Math.abs(box.height-boxes[0].height)<.1,JSON.stringify(boxes));assert.equal(box.width,boxes[0].width);assert.equal(box.background,box.ground);}
   }
  }finally{await h.context.close();}
 });
 test(`${business}: row cards, caption names and tick boxes align despite a longer caption`,async()=>{
  const form=wholeBoardForms(business).round1;
  form.questions[0].options[0].label='A longer board name that wraps across several lines while its neighbour stays short';
  const h=await kit.open(form,734);
  try{
   const cards=await h.f.locator('.boards-tile').evaluateAll(ns=>ns.map(n=>({card:n.getBoundingClientRect().toJSON(),name:n.querySelector('.tile-label>span').getBoundingClientRect().toJSON(),tick:n.querySelector('.tile-input').getBoundingClientRect().toJSON()})));
   for(let i=0;i<cards.length;i+=2)for(const key of ['height'])assert.ok(Math.abs(cards[i].card[key]-cards[i+1].card[key])<.1,JSON.stringify(cards.slice(i,i+2)));
   for(let i=0;i<cards.length;i+=2)for(const key of ['name','tick'])assert.ok(Math.abs(cards[i][key].top-cards[i+1][key].top)<.1,`${key}: ${JSON.stringify(cards.slice(i,i+2))}`);
   assert.ok(cards[0].card.height>cards[2].card.height,'the long caption grows its whole row');
  }finally{await h.context.close();}
 });
}

test('a much taller drawing shrinks to its unchanged box without cropping any row or text',async()=>{
 const h=await kit.open(wholeBoardForms('bakery').round1,390);
 try{
  const result=await h.f.locator('.thumbnail-surface').first().evaluate(surface=>{
   const board=surface.querySelector('.brand-board'),before=surface.getBoundingClientRect().height,zoom=parseFloat(getComputedStyle(board).zoom);
   board.querySelector('.rules').style.minHeight='5000px';
   WiserBoardView.fitLooks();
   const box=surface.getBoundingClientRect(),art=board.getBoundingClientRect(),cropped=[];
   const inside=r=>r.left>=box.left-.5&&r.right<=box.right+.5&&r.top>=box.top-.5&&r.bottom<=box.bottom+.5;
   for(const row of board.querySelectorAll('.board-row,.whole-foot,svg'))if(!row.closest('.page-pattern,.texture')&&!inside(row.getBoundingClientRect()))cropped.push(row.getAttribute('class'));
   const walker=document.createTreeWalker(board,NodeFilter.SHOW_TEXT);
   while(walker.nextNode()){if(!walker.currentNode.textContent.trim())continue;const r=document.createRange();r.selectNode(walker.currentNode);if([...r.getClientRects()].some(r=>!inside(r)))cropped.push(walker.currentNode.textContent);}
   return {before,after:box.height,zoomBefore:zoom,zoomAfter:parseFloat(getComputedStyle(board).zoom),fits:inside(art),cropped};
  });
  assert.equal(result.after,result.before);assert.ok(result.zoomAfter<result.zoomBefore);assert.ok(result.fits);assert.deepEqual(result.cropped,[]);
 }finally{await h.context.close();}
});
