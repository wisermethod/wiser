import '../../lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {checkForm,formJsonSchema,fillTemplate} from '../scripts/format.js';
import {BOARD_DEFAULT_KEYS,resolveBoards} from '../scripts/boards.js';
import {boardForm,lookForm} from './board-fixtures.js';
const ok=form=>assert.deepEqual(checkForm(form),{ok:true,problems:[]});
function shared(){
 const form=boardForm(),options=form.questions[0].options;
 form.boardDefaults=Object.fromEntries(BOARD_DEFAULT_KEYS.map(k=>[k,structuredClone(options[0].board[k])]));
 for(const o of options)for(const k of BOARD_DEFAULT_KEYS)delete o.board[k];
 return form;
}
test('shared board fields merge before all per-board checks and model construction, without changing the input',()=>{
 const full=boardForm(),slim=shared(),before=structuredClone(slim);ok(slim);
 assert.deepEqual(resolveBoards(slim.brand,slim.questions[0].options,slim.boardDefaults),resolveBoards(full.brand,full.questions[0].options));
 assert.deepEqual(slim,before);assert.equal(z.fromJSONSchema(formJsonSchema()).safeParse(slim).success,true);
 const filled=fillTemplate({...slim,title:'{{title}}',slots:{title:{about:'Progress',max:80}}},{title:'Your boards'});
 assert.equal(filled.ok,true);assert.deepEqual(filled.form.boardDefaults,slim.boardDefaults);
});
test('option fields win, including null and zero; nested fields replace the entire shared object',()=>{
 const slim=shared(),options=slim.questions[0].options;
 options.length=1;slim.boardDefaults.buttonRadius=12;options[0].board.buttonRadius=0;
 slim.boardDefaults.handwriting='Kalam';options[0].board.handwriting=null;
 slim.boardDefaults.content={smallPrint:'Shared small print',photoRules:'Shared photograph rule'};
 options[0].board.content={smallPrint:'Only this board'};
 const expanded=structuredClone(slim);delete expanded.boardDefaults;
 for(const o of expanded.questions[0].options)o.board={...slim.boardDefaults,...o.board};
 ok(slim);assert.deepEqual(resolveBoards(slim.brand,options,slim.boardDefaults),resolveBoards(expanded.brand,expanded.questions[0].options));
});
test('malformed shared copy is checked on every merged board; a complete option override wins first',()=>{
 const slim=shared();slim.boardDefaults.sample=null;
 const result=checkForm(slim);assert.equal(result.ok,false);
 for(let i=0;i<12;i++)assert.ok(result.problems.some(p=>p.path===`questions[0].options[${i}].board`));
 const sample=boardForm().questions[0].options[0].board.sample;
 for(const o of slim.questions[0].options)o.board.sample=structuredClone(sample);
 ok(slim);assert.equal(z.fromJSONSchema(formJsonSchema()).safeParse(slim).success,true);
 const missing=shared();delete missing.questions[0].options[1].board.pairing;
 assert.ok(checkForm(missing).problems.some(p=>p.path==='questions[0].options[1].board.pairing'));
});
for(const key of ['pairing','palette','graphicSet','container','primaryMode','unknown'])test(`boardDefaults refuses defining reference or unknown field: ${key}`,()=>{
 const slim=shared();slim.boardDefaults[key]=boardForm().questions[0].options[0].board[key]??'extra';
 assert.ok(checkForm(slim).problems.some(p=>p.path===`boardDefaults.${key}`));
 assert.equal(z.fromJSONSchema(formJsonSchema()).safeParse(slim).success,false);
 assert.throws(()=>resolveBoards(slim.brand,slim.questions[0].options,slim.boardDefaults),/boardDefaults/);
});
test('boardDefaults refuses malformed containers, no boards and look views, including empty defaults',()=>{
 for(const defaults of [null,[],false,1,'copy']){const f=boardForm();f.boardDefaults=defaults;assert.ok(checkForm(f).problems.some(p=>p.path==='boardDefaults'));}
 const ordinary={title:'Question',questions:[{id:'answer',type:'text',label:'Your answer'}]};
 for(const f of [ordinary,lookForm()])for(const defaults of [{},{buttonRadius:4}])assert.ok(checkForm({...f,boardDefaults:defaults}).problems.some(p=>p.path==='boardDefaults'));
});
test('defaults retain display-only board support and the compact-input byte ceiling',()=>{
 const f=shared();f.questions[0].pick=0;delete f.actions;ok(f);
 // Shared text is checked once on the wire; expansion is not charged twelve times.
 f.boardDefaults.content.smallPrint='x'.repeat(6000);ok(f);
 f.boardDefaults.content.smallPrint='x'.repeat(65536);
 assert.ok(checkForm(f).problems.some(p=>p.path===''&&/65536/.test(p.message)));
});
