import {select} from '../../../skills/Build Brand/scripts/select.mjs';
import {operator,firstStrategy} from '../../../skills/Build Brand/tests/select-fixtures.mjs';
import {BOARD_KEYS} from '../scripts/boards.js';
export const tapSets={operator,firstStrategy};
export function lookForm(answers=operator(),result=select('looks',answers,{check:true})) {
  return {title:answers.name==='Sample Organisation'?'Step 4 of 7: how it should look':'Step 3 of 6: how it should look',
    brand:{name:answers.name,initials:result.selection.boards[0].initials,sentence:answers.sentence,body:answers.body??answers.sentence,words:answers.words},
    questions:[{id:'looks',type:'boards',view:'look',label:'Which of these feel like you? Pick two or three.',pick:3,min:2,options:result.options}]};
}
export function formFromSelection(answers,selection,{pick=3,actions=true}={}) {
  const options=selection.boards.map(b=>({value:`board-${b.number}`,label:b.name,note:answers.words.map(w=>`${w.word}, not ${w.not}`).join('; '),...(b.recommendation?{recommendation:b.recommendation}:{}),
    board:Object.fromEntries(BOARD_KEYS.filter(k=>Object.hasOwn(b,k)).map(k=>[k,k==='content'?Object.fromEntries(Object.entries(b.content).filter(([key])=>!['brandName','sentence','body'].includes(key))):b[k]]))}));
  return {title:pick===0?'Step 6 of 6: locked':pick===3?'Step 4 of 6: your boards':'Step 5 of 6: blend and tune',
    brand:{name:answers.name,initials:selection.boards[0].initials,sentence:answers.sentence,body:answers.body,words:answers.words},
    questions:[{id:'boards',type:'boards',label:pick===0?'Locked. This is your brand.':pick===3?'Select the board(s) that feel most like you':'Which is closest?',pick,options}],
    ...(actions&&pick!==0?{actions:[{value:'more',label:'Show me more',needs:'any',notes:{none:'None of these work',one:'Show me variations of this board',several:'Show me variations of these boards'}},{value:'lock',label:'Lock this board in',note:'and finish my brand',needs:'one'}]}:{})};
}
let cached;
export function boardForm() {
  if(!cached){const a=operator();cached=formFromSelection(a,select('round1',a,{check:true}).selection);}
  return structuredClone(cached);
}
