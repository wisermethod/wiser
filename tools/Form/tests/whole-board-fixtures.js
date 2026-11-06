import {select} from '../../../skills/Build Brand/scripts/select.mjs';
import {bakery,operator} from '../../../skills/Build Brand/tests/select-fixtures.mjs';
import {fullKeptPalette} from '../../../skills/Build Brand/tests/form-budget.mjs';

// The politician and look picks used for the operator's board-card comparison.
export const politician=()=>({...operator(),name:'Dana Reyes for City Council',
 sentence:"I'm running for City Council so every street in our neighbourhood gets the care it's owed.",heroPhrase:'every street',
 words:[{word:'Steady',not:'stiff'},{word:'Local',not:'small'},{word:'Honest',not:'harsh'}],
 taps:{mode:'light',feel:'suit-and-tie',history:'rooted',strength:'strong-solid',technology:'craftsman',style:'brooks-brothers',posture:'porsche',mood:'restoration-hardware',place:'hotel-lobby'}});
export function wholeBoardForms(business,kept=false) {
 const a=business==='bakery'?bakery():politician();
 if(kept)a.kept={palette:fullKeptPalette()};
 const looks=select('looks',a,{check:true});
 const answers={...a,looks:(business==='politician'&&!kept?[0,1]:[0,4]).map(i=>looks.options[i].value),looksShown:looks.options};
 const round=select('round1',answers,{check:true});
 const variations=select('variations',{...answers,picks:round.selection.boards.slice(0,3),shown:round.selection.boards},{check:true});
 return {round1:round.form,variations:variations.form};
}
