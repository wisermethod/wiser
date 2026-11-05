import {readFileSync} from 'node:fs';
const library=JSON.parse(readFileSync(new URL('../../../skills/Build Brand/parts/parts.json',import.meta.url)));
import {resolveBoards,stepBoard} from '../scripts/boards.js';
import {lookForm} from './board-fixtures.js';
const copy=structuredClone;
export const modes=['light','dark'];
export const strengths=['muted','balanced','bold'];
let cached;
export function controlsForm(view='look',mode='light') {
  if(!cached)cached=lookForm();
  const form=copy(cached),q=form.questions[0];
  q.view=view;q.controls={mode,strength:true};
  for(const [i,o]of q.options.entries()) {
    const style=library.styles.find(s=>s.id===o.board.pairing.id);
    const family=o.board.palette.id.replace(/-(muted|balanced|bold)$/,'');
    const depth=id=>Object.fromEntries(modes.map(m=>[m,copy({...style.depth,...library.cardDepth.find(d=>d.palette===id&&d.style===style.id&&d.mode===m)?.depth})]));
    o.steps=strengths.map(strength=>{
      const id=`${family}-${strength}`;
      return {value:id===o.board.palette.id?o.value:`step-${i}-${strength}`,palette:{id},...(view==='look'?{depth:depth(id)}:{})};
    }).filter(step=>{
      // A form supplies only boards the current library admits, in both modes.
      try {for(const m of modes)resolveBoards(form.brand,[{...o,board:stepBoard(o,step,view,m)}]);return true;}catch{return false;}
    });
    const own=o.steps.find(s=>s.value===o.value);
    if(!own)throw Error(`The selected option has no passing step: ${o.value}`);
    o.board.primaryMode=mode;
    if(view==='look')o.board.depth=copy(own.depth[mode]);else delete o.board.depth;
  }
  return form;
}
export function completeOptions(form) {return form.questions[0].options.filter(o=>o.steps.length===3);}
export function startAt(form,strength='balanced') {
  const mode=form.questions[0].controls?.mode??'light';
  for(const o of form.questions[0].options){
    const step=o.steps.find(s=>s.palette.id.endsWith(`-${strength}`));
    o.value=step.value;o.board.palette=copy(step.palette);o.board.primaryMode=mode;
    if(form.questions[0].view==='look')o.board.depth=copy(step.depth[mode]);
  }
  return form;
}
