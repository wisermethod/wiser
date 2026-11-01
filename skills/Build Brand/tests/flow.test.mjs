import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const skill=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFileSync(resolve(skill,path),'utf8');
const router=read('SKILL.md'), bank=read('questions.md'), sitting=read('paths/sitting.md'), lock=read('lock.md');
const paths=['brief','sitting','organisation','simple','record-my-look'];
const corpus=[bank,...paths.map(path=>read(`paths/${path}.md`))].join('\n');
const section=(text,name,next)=>text.split(`## ${name}\n`)[1]?.split(`## ${next}\n`)[0];
const hash=text=>createHash('sha256').update(text).digest('hex');

// Deliberately read the living spec, not a checked-in copy of its phrases. A
// moved/installed skill can name that file with BUILD_BRAND_JOURNEY. A missing
// source is a failure, so this check cannot silently pass without its spec.
const journeyPath=process.env.BUILD_BRAND_JOURNEY||fileURLToPath(new URL('../../../../journey.md',import.meta.url));
function sourceLines(source){
  const start=source.indexOf('## Step 1:'), end=source.indexOf('## What the lock writes');
  assert.ok(start>=0&&end>start,'journey must contain the whole step 1 to lock range');
  const steps=source.slice(start,end);
  const lines=[...steps.matchAll(/"([^"\n]+)"/g)].map(match=>match[1]);
  for(const line of steps.split('\n'))if(line.startsWith('> ')&&line.slice(2).trim())lines.push(line.slice(2));
  return [...new Set(lines)];
}
function missing(lines,target){return lines.filter(line=>!target.includes(line));}

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

test('every quoted phrase and every screen line in the living journey steps is verbatim',()=>{
  const lines=sourceLines(readFileSync(journeyPath,'utf8'));
  assert.ok(lines.length>80,'an unexpectedly empty source range must fail');
  assert.deepEqual(missing(lines,corpus),[]);
});

test('wording check detects drift on either side, including a multi-line screen',()=>{
  const lines=sourceLines(readFileSync(journeyPath,'utf8'));
  const literal='Setting up your colours and lettering for everything I make for you.';
  assert.ok(lines.includes(literal));
  assert.deepEqual(missing([literal],corpus.replaceAll(literal,'Different status.')),[literal]);
  const changed=readFileSync(journeyPath,'utf8').replace(literal,'A changed lock status.');
  assert.ok(missing(sourceLines(changed),corpus).includes('A changed lock status.'));
  assert.ok(lines.includes('And [three] words for your brand, each with what it isn\'t:'));
});

test('brief bank stays byte-for-byte unchanged',()=>{
  const retained='## The brief path\n'+section(bank,'The brief path','The five questions');
  assert.equal(hash(retained),'b2aa484db1ac61efa683b6357285e3894a6ca827bf8f10621490e8f01fb321c7');
});

test('nine taps retain incorporated wording and option order, without chat-only suffixes',()=>{
  const taps=JSON.parse(read('parts/taps.json'));
  for(const [index,question] of taps.questions.entries()){
    const chunk=bank.split(`### T${index+1}\n`)[1]?.split(/\n##/)[0];assert.ok(chunk,question.id);
    assert.ok(chunk.includes(question.question.replace(/ \([1-4] of 4\)$/,'')),question.id);
    let last=-1;for(const option of question.options){const at=chunk.indexOf(`- ${option.label}`);assert.ok(at>last,option.id);last=at;if(option.description)assert.ok(chunk.includes(option.description));}
  }
  for(const word of ['palette','Playbook','provisional','root','Creative Director'])assert.ok(section(bank,'Words never said','The brief path').includes(word));
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
