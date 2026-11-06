import {inputElements} from '../../../skills/Build Brand/tests/form-budget.mjs';

// Time just the twelve DOM drawings separately from the synchronous render/layout.
// Re-render the exact hosted input, and compare its serialized value and element
// count inside the browser as well as at the caller.
export async function measureWholeBoard(h,form,mode) {
 const result=await h.frame.evaluate(({form,mode})=>{
  const before=JSON.stringify({form}),count=value=>value&&typeof value==='object'?Object.values(value).length+Object.values(value).reduce((n,v)=>n+count(v),0):0;
  const elementsBefore=count({form}),draw=WiserBoardView.draw;
  let thumbnails=0,drawMs=0;
  WiserBoardView.draw=(...args)=>{const start=performance.now();try{return draw(...args);}finally{if(args[2]?.compact){thumbnails++;drawMs+=performance.now()-start;}}};
  let start=performance.now();
  try{
   WiserForm.render(form);
   const button=document.querySelector(`.board-controls .board-mode-switch[data-mode="${mode}"]`);
   if(button&&button.getAttribute('aria-pressed')!=='true'){
    thumbnails=0;drawMs=0;start=performance.now();button.click();
   }
  }finally{WiserBoardView.draw=draw;}
  const root=document.getElementById('root'),height=Math.ceil(root.getBoundingClientRect().height);
  const renderLayoutMs=+(performance.now()-start).toFixed(2),clippedText=[];
  for(const n of root.querySelectorAll('.board-thumbnail')){
   const bounds=n.getBoundingClientRect(),walker=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);
   while(walker.nextNode()){
    const text=walker.currentNode;if(!text.textContent.trim())continue;
    const range=document.createRange();range.selectNode(text);
    if([...range.getClientRects()].some(r=>r.left<bounds.left-.5||r.right>bounds.right+.5||r.top<bounds.top-.5||r.bottom>bounds.bottom+.5))
     clippedText.push({board:n.querySelector('.brand-board').dataset.board,text:text.textContent.slice(0,60)});
   }
  }
  return {height,thumbnails,drawMs:+drawMs.toFixed(2),renderLayoutMs,clippedText,
   elementsBefore,elementsAfter:count({form}),unchanged:before===JSON.stringify({form}),
   domInputs:root.querySelectorAll('input').length,thumbnailHeights:[...root.querySelectorAll('.board-thumbnail')].map(n=>+n.getBoundingClientRect().height.toFixed(2)),
   bannerSentences:[...root.querySelectorAll('.board-thumbnail .banner-copy>p')].map(n=>n.getClientRects().length),
   splits:[...root.querySelectorAll('.board-thumbnail .brand-board')].map(n=>[...n.querySelectorAll('.thumbnail-column')].map(c=>c.children.length)),
   patches:[...root.querySelectorAll('.thumbnail-surface')].map(n=>{
    const patch=n.querySelector('.thumbnail-patch'),box=patch.getBoundingClientRect();
    return {width:+box.width.toFixed(2),height:+box.height.toFixed(2),badge:!!patch.querySelector('.thumbnail-badge'),swatches:[...patch.querySelectorAll('.thumbnail-swatch')].filter(s=>!s.hidden).map(s=>s.dataset.swatch),
     overlayOnly:n.getBoundingClientRect().height===n.querySelector('.brand-board').getBoundingClientRect().height};
   }),
   overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};
 },{form,mode});
 return {...result,inputElements:inputElements({form})};
}
