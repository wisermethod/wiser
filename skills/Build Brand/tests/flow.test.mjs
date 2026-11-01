import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {compareJourneyCopy} from './journey-copy.mjs';

const skill=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFileSync(resolve(skill,path),'utf8');
const router=read('SKILL.md'), bank=read('questions.md'), sitting=read('paths/sitting.md'), lock=read('lock.md');
const paths=['brief','sitting','organisation','simple','record-my-look'];
const section=(text,name,next)=>text.split(`## ${name}\n`)[1]?.split(`## ${next}\n`)[0];

// Deliberately read the living spec, not a checked-in copy of its phrases. A
// moved/installed skill can name that file with BUILD_BRAND_JOURNEY. A missing
// source is a failure, so this check cannot silently pass without its spec.
const journeyPath=process.env.BUILD_BRAND_JOURNEY||fileURLToPath(new URL('../../../../journey.md',import.meta.url));
const journey=readFileSync(journeyPath,'utf8');
const openingTaps=readFileSync(resolve(dirname(journeyPath),'2026-10-28-opening-taps.md'),'utf8');

test('router preserves identity and declares the one-sitting format change',()=>{
  assert.match(router,/^name: Build Brand$/m);assert.match(router,/^type: skill$/m);assert.match(router,/^category: onboarding$/m);
  assert.match(router,/^version: 0\.3\.0$/m);assert.match(router,/^description: .*one sitting.*without a Playbook/m);
  for(const key of ['design','voice','about'])assert.ok(router.includes(`  - ${key}`));
  for(const gap of ['naming a brand','trademark search','brand mark and logo creation'])assert.ok(router.includes(`  - ${gap}`));
  assert.ok(Buffer.byteLength(router)<58514/3,'router stays under a third of the original');
  assert.equal(read('../AGENTS.md').split('\n').filter(line=>line.startsWith('| `Build Brand/SKILL.md` |'))[0],`| \`Build Brand/SKILL.md\` | ${router.match(/^description: (.+)$/m)[1]} | Creative Director |`);
});

test('router names every carved path and all path files exist',()=>{
  for(const path of paths){assert.ok(router.includes(`paths/${path}.md`),path);assert.ok(existsSync(resolve(skill,`paths/${path}.md`)),path);}
  for(const file of ['lock.md','records.md','writing.md','parts/catalogue.md','paths/brief-boards.md'])assert.ok(existsSync(resolve(skill,file)),file);
  for(const answer of ['brief','full','simple','Not now'])assert.ok(router.includes(answer),answer);
  assert.match(router,/Not now: write nothing/);
});

test('whole member lines and options match both ways from Opening through Each app',()=>{
  assert.ok(compareJourneyCopy(journey,bank,openingTaps).length>150);
});

for(const [name,literal] of [
  ['opening', "Let's build your brand: a few quick taps, then brands made for you. About 12 minutes."],
  ['option','Starting fresh'],
  ['nested quotes', 'In a sentence, what do you do? For example: "I help small bakeries sell online."'],
  ['brand-folder receipt', 'Saved in your "brand" folder.'],
  ['board control', 'Close this board'],
  ['lock status','Setting up your colours and lettering for everything I make for you.']
])test(`copy gate rejects a one-character ${name} edit on either side`,()=>{
  assert.doesNotThrow(()=>compareJourneyCopy(journey,bank,openingTaps));
  const changed=literal.slice(0,-1)+'!';
  assert.throws(()=>compareJourneyCopy(journey,bank.replace(literal,changed),openingTaps));
  assert.throws(()=>compareJourneyCopy(journey.replace(literal,changed),bank,openingTaps));
});

test('old copy in source notes or unrelated path prose cannot satisfy a changed screen',()=>{
  const literal="Let's build your brand: a few quick taps, then brands made for you. About 12 minutes.";
  const changed=bank.replace(literal,'Changed opening.');
  assert.throws(()=>compareJourneyCopy(journey,changed+`\n## Source notes\n> ${literal}\n`,openingTaps));
  assert.throws(()=>compareJourneyCopy(journey,changed+'\nUnrelated path prose: '+literal,openingTaps));
  assert.throws(()=>compareJourneyCopy(journey,bank.replace('- Starting fresh','- Starting fresh!')+'\nSource notes: Starting fresh',openingTaps));
  const control=bank.replace('Close this board','Close this board!').replace('### Board copy','Source notes: \"Close this board\"\n\n### Board copy');
  assert.throws(()=>compareJourneyCopy(journey,control,openingTaps));
});

test('copy gate rejects an extra option or screen on either side',()=>{
  assert.throws(()=>compareJourneyCopy(journey,bank.replace('- Starting fresh','- Starting fresh\n- An invented option'),openingTaps));
  assert.throws(()=>compareJourneyCopy(journey.replace('- Starting fresh','- Starting fresh\n- A new source option'),bank,openingTaps));
  assert.throws(()=>compareJourneyCopy(journey.replace('## Each app','> A new source screen.\n\n## Each app'),bank,openingTaps));
});

test('four brand-set questions supply distinct question-tool copy beside paged copy',()=>{
  const taps=JSON.parse(read('parts/taps.json'));
  const turn=taps.questions.slice(4,8).map((question,index)=>{
    const chunk=bank.split(`### T${index+5}\n`)[1]?.split(/\n##/)[0];
    const lines=chunk.split('\n').filter(line=>line.startsWith('> ')).map(line=>line.slice(2));
    assert.equal(lines.length,2);assert.match(chunk,/Paged card:/);assert.match(chunk,/Chat buttons and the question tool:/);
    assert.equal(lines[1],`Choose the one brand that most reflects the direction you're going for (${index+1} of 4).`);
    return lines[1];
  });
  assert.equal(new Set(turn).size,4,'one question-tool turn has four unique questions');
  for(const word of ['palette','Playbook','provisional','root','Creative Director'])assert.ok(section(bank,'Words never said','The brief path').includes(word));
});

test('brand-folder path records received material, live gaps, read-back and complete write',()=>{
  const brief=read('paths/brief.md');
  for(const term of ['sources/brand/','sources/AGENTS.md','as received','every file','style declarations','at most five','G1 to G5','B8','complete','design-source','[V<n>]'])assert.ok(brief.includes(term),term);
  assert.match(brief,/no unified-brand read-back/);assert.match(brief,/Stop this coverage after B3/);
  assert.ok(!brief.includes('B9'));assert.ok(!brief.includes('The five questions` in words'));
  const retained=section(bank,'The brief path','The five questions');
  for(const term of ['silence does not accept it','[Not available: not yet supplied]','status skipped','status answered','records no preference on that axis','not an interview to ask in order'])assert.ok(retained.includes(term),term);
  assert.match(section(bank,'The five questions','Retained brief voice comparison'),/does not use P1 to P5/);
  assert.ok(!retained.includes('`SKILL.md` Step'));assert.ok(!retained.includes('Playbook'));
  assert.ok(!/B0 \|/.test(retained));
});

test('brief boards take one pick, the bank caption, no dark-screen question or later round',()=>{
  const briefBoards=read('paths/brief-boards.md');
  assert.match(briefBoards,/exactly one board/);assert.match(briefBoards,/record the pick and stop/);
  assert.match(briefBoards,/bank's initials caption/);assert.match(briefBoards,/No closing question/);
  assert.match(briefBoards,/no dark-screen question/);
  assert.ok(!/monogram|next round|Can the person see|End each full board by asking/i.test(briefBoards));
});

test('organisation overlay adds its step and all seven progress lines',()=>{
  const organisation=read('paths/organisation.md');
  for(const type of ['org','client','department'])assert.ok(organisation.includes(`\`${type}\``));
  const names=['what to keep',"who it's for",'what your brand says','how it should look','your boards','blend and tune','locked'];
  names.forEach((name,i)=>assert.ok(bank.includes(`Step ${i+1} of 7: ${name}`)));
  assert.equal((sitting.match(/load `organisation\.md`/g)||[]).length,1);
  for(const field of ['audience','promise','finalSay'])assert.ok(organisation.includes(field));
  assert.match(organisation,/never pauses the sitting/);
});

test('sitting uses scripts and unchanged form handoffs, histories and numeric comment steer',()=>{
  for(const call of ['select.mjs looks --answers','select.mjs round1 --answers','select.mjs variations --answers'])assert.ok(sitting.includes(call));
  for(const term of ['--check','formUnavailable','unchanged','shown','picks: []','steer','off','C14','paged: true','pick: 0'])assert.ok(sitting.includes(term),term);
  assert.match(sitting,/never send them to selection as prose/);assert.match(sitting,/second context before showing/);
  assert.match(sitting,/After every displayed page, write the bound design provisional/);
  assert.match(sitting,/no explicit stop button/i);assert.match(sitting,/about minute 6/);assert.match(sitting,/minute 15/);
});

test('lock fills the twelve existing headings, preserves G0, and checks words once',()=>{
  const expected=['Color','Typography','Layout Habits','Source Assets and Templates','Prohibitions','Foundation','Words','Visual Personality','Brand Board','Mark','Imagery and Illustration','Icons and Graphic Elements'];
  for(const heading of expected)assert.ok(lock.includes(`| ${heading} |`),heading);
  for(const term of ['scripts/lock.mjs','palette.css','typography.css','brand-direction.html','design-source','G0','complete','specSha256'])assert.ok(lock.includes(term),term);
  assert.match(lock,/at most three/);assert.match(lock,/replacing that section/);assert.match(lock,/Keep it/);assert.match(lock,/Drop it/);
  assert.match(lock,/Ghost Writer's check once/);assert.match(lock,/first time work needs it/);
  assert.match(lock,/Offers, only on the member's ask/);
});
