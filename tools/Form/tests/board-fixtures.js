import {select} from '../../../skills/Build Brand/scripts/select.mjs';
import {operator,firstStrategy} from '../../../skills/Build Brand/tests/select-fixtures.mjs';
import {BOARD_KEYS} from '../scripts/boards.js';
export const tapSets={operator,firstStrategy};
export function formFromSelection(answers,selection,{pick=3,actions=true}={}) {
  const options=selection.boards.map(b=>({value:`board-${b.number}`,label:b.name,note:answers.words.map(w=>`${w.word}, not ${w.not}`).join('; '),...(b.recommendation?{recommendation:b.recommendation}:{}),
    board:Object.fromEntries(BOARD_KEYS.filter(k=>Object.hasOwn(b,k)).map(k=>[k,k==='content'?Object.fromEntries(Object.entries(b.content).filter(([key])=>!['brandName','sentence','body'].includes(key))):b[k]]))}));
  return {title:pick===0?'Step 6 of 6: locked':pick===3?'Step 4 of 6: your boards':'Step 5 of 6: blend and tune',
    brand:{name:answers.name,initials:selection.boards[0].initials,sentence:answers.sentence,body:answers.body,words:answers.words},
    questions:[{id:'boards',type:'boards',label:pick===0?'Locked. This is your brand.':pick===3?'Which feel most like you? Pick one to three.':'Which is closest?',pick,options}],
    ...(actions&&pick!==0?{actions:[{value:'round',label:'One more round',needs:'any'},{value:'lock',label:'Lock it',note:'Pick just one to lock it',needs:'one'},{value:'stop',label:'Stop for now',needs:'any'}]}:{})};
}
let cached;
export function boardForm() {
  if(!cached){const a=operator();cached=formFromSelection(a,select('round1',a,{check:true}).selection);}
  return structuredClone(cached);
}
