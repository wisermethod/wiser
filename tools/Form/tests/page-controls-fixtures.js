import {readFileSync} from 'node:fs';
const library=JSON.parse(readFileSync(new URL('../../../skills/Build Brand/parts/parts.json',import.meta.url)));
import {resolveBoards,stepBoard} from '../scripts/boards.js';
import {lookForm} from './board-fixtures.js';
const copy=structuredClone;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function overlayStep(step,depths,base) {
  const depth=Object.fromEntries(Object.entries(depths).map(([mode,fields])=>[mode,Object.fromEntries(Object.entries(fields).filter(([key,value])=>!equal(value,base?.[key])))]).filter(([,fields])=>Object.keys(fields).length));
  if(Object.keys(depth).length)step.depth=depth;else delete step.depth;
}
export function setOwnStep(o,step,mode) {
  const depths=o.steps.map(s=>Object.fromEntries(modes.map(m=>[m,copy({...o.board.depth,...s.depth?.[m]})])));
  const base=depths[o.steps.indexOf(step)][mode];
  o.value=step.value;if(step.label)o.label=step.label;o.board.palette=copy(step.palette);o.board.primaryMode=mode;o.board.depth=copy(base);
  o.steps.forEach((s,i)=>overlayStep(s,depths[i],base));
}
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
    if(view==='look')o.board.depth=depth(o.board.palette.id)[mode];else delete o.board.depth;
    o.steps=strengths.map(strength=>{
      const id=`${family}-${strength}`;
      const step={value:id===o.board.palette.id?o.value:`step-${i}-${strength}`,palette:{id}};
      if(view==='look')overlayStep(step,depth(id),o.board.depth);
      return step;
    }).filter(step=>{
      // A form supplies only boards the current library admits, in both modes.
      try {for(const m of modes)resolveBoards(form.brand,[{...o,board:stepBoard(o,step,view,m)}]);return true;}catch{return false;}
    });
    const own=o.steps.find(s=>s.value===o.value);
    if(!own)throw Error(`The selected option has no passing step: ${o.value}`);
    o.board.primaryMode=mode;
  }
  return form;
}
export function completeOptions(form) {return form.questions[0].options.filter(o=>o.steps.length===3);}
export function startAt(form,strength='balanced') {
  const mode=form.questions[0].controls?.mode??'light';
  for(const o of form.questions[0].options){
    const step=o.steps.find(s=>s.palette.id.endsWith(`-${strength}`));
    if(form.questions[0].view==='look')setOwnStep(o,step,mode);
    else {o.value=step.value;if(step.label)o.label=step.label;o.board.palette=copy(step.palette);o.board.primaryMode=mode;}
  }
  return form;
}

export function withStepLabels(form) {
  for(const o of form.questions[0].options) {
    const palette=library.palettes.find(p=>p.id===o.board.palette.id);
    for(const step of o.steps)step.label=o.label.replace(palette.name,library.palettes.find(p=>p.id===step.palette.id).name);
  }
  return form;
}
