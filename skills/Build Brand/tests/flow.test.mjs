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
  {const v=router.match(/^version: (\d+)\.(\d+)\.(\d+)$/m);assert.ok(v,'a semantic version');assert.ok(+v[1]>0||+v[2]>=3,`the one-sitting format change arrived in 0.3.0; got ${v[0]}`);}assert.match(router,/^description: .*one sitting.*without a Playbook/m);
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
  ['opening', "Let's build your brand: a few quick taps, then brands made for you. About 15 minutes."],
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
  const literal="Let's build your brand: a few quick taps, then brands made for you. About 15 minutes.";
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

test('copy gate rejects a deleted opening',()=>{
  const opening="> Let's build your brand: a few quick taps, then brands made for you. About 15 minutes.\n";
  assert.ok(bank.includes(opening));
  assert.throws(()=>compareJourneyCopy(journey,bank.replace(opening,''),openingTaps));
});

test('copy gate rejects deleting every scoped bank or journey blockquote line',()=>{
  for(const [side,text,end] of [['bank',bank,'## The five questions\n'],['journey',journey,'## Words never said\n']]){
    const start=text.indexOf('## Opening\n'), stop=text.indexOf(end,start);
    assert.ok(start>=0&&stop>start,`${side} copy boundaries`);
    const quoted=[...text.slice(start,stop).matchAll(/^> \S.*$/gm)];
    assert.ok(quoted.length>40,`${side} has its complete copy range`);
    for(const line of quoted){
      const at=start+line.index, changed=text.slice(0,at)+text.slice(at+line[0].length);
      assert.throws(()=>compareJourneyCopy(side==='journey'?changed:journey,side==='bank'?changed:bank,openingTaps),`${side}: ${line[0]}`);
    }
  }
});

for(const [name,boundary] of [
  ['organisation progress','## Organisation: Progress and substitutions\n'],
  ['tap preamble','### T1\n']
])test(`copy gate rejects an invented screen in the ${name}`,()=>{
  assert.ok(bank.includes(boundary));
  const changed=name==='tap preamble'
    ?bank.replace(boundary,`> An invented screen.\n\n${boundary}`)
    :bank.replace(boundary,`${boundary}\n> An invented screen.\n`);
  assert.throws(()=>compareJourneyCopy(journey,changed,openingTaps),/bank blockquotes/);
});

test('four brand-set questions supply only distinct question-tool copy',()=>{
  const taps=JSON.parse(read('parts/taps.json'));
  const turn=taps.questions.slice(4,8).map((question,index)=>{
    const chunk=bank.split(`### T${index+5}\n`)[1]?.split(/\n##/)[0];
    const lines=chunk.split('\n').filter(line=>line.startsWith('> ')).map(line=>line.slice(2));
    assert.equal(lines.length,1);assert.doesNotMatch(chunk,/Paged card:/);assert.match(chunk,/Chat buttons and the question tool:/);
    assert.equal(lines[0],`Choose the one brand that most reflects the direction you're going for (${index+1} of 4).`);
    return lines[0];
  });
  assert.equal(new Set(turn).size,4,'one question-tool turn has four unique questions');
  assert.match(sitting,/Use the bank's four Chat buttons and the question tool lines word for word/);
  assert.match(sitting,/using `parts\/taps\.json` only for ids and nudges/);
  turn.forEach((question,i)=>assert.notEqual(question,taps.questions[i+4].question,'runtime data is not the question-tool copy'));
  for(const word of ['palette','Playbook','provisional','root','Creative Director'])assert.ok(section(bank,'Words never said','The brief path').includes(word));
});

test('brand-folder hosts use the whole drop line and retain their own computer fallback',()=>{
  const files=bank.split('### Brand files\n')[1].split('\n### Anything missing')[0], brief=read('paths/brief.md');
  assert.match(files,/show this sentence alone as the whole line, replacing the longer chat line:\n\n> Drop your brand files, or a folder of them, here in the chat\n/);
  assert.ok(!files.includes('replace the first clause'));
  assert.match(brief,/whole-folder variant as the entire line/);
  assert.match(brief,/otherwise name that location in words and continue with this branch's Brand files drop, website and empty-receipt lines and its same four options/);
  assert.match(brief,/keep step's Folder screens, Skip option and empty-folder line never run here/);
  for(const old of ["using the bank's Folder lines",'Skip this: build without them',"The folder's still empty. Put them in, or tap Skip."])assert.ok(!brief.includes(old),old);
});

test('brand-folder voice conflicts are recorded without a new question or gap slot',()=>{
  const brief=read('paths/brief.md'), comparison=bank.split('## Retained brief voice comparison\n')[1];
  assert.match(brief,/A voice conflict is not a gap question and uses none of these five slots/);
  assert.match(brief,/`\.\.\/writing\.md` Voice check records F9 without a member question or gap slot/);
  assert.match(router,/It records conflicts without a new question or a gap slot/);
  assert.match(comparison,/save both source passages at F9/);
  assert.match(comparison,/ask no new question and use none of G1 to G5/);
  assert.match(comparison,/permitted open-heading gap, or a correction the member gives at B8/);
  assert.match(comparison,/leave the disputed words unconfirmed and label the heading only if empty/);
  assert.ok(!/including (?:corrections and )?any F9 conflict question|including any voice-conflict question|conflict consumes one|counted within its five/.test(brief+bank));
});

test('industry entry runs only the folder step and offers no path-choice screen',()=>{
  const industry=read('paths/record-my-look.md'), entry=industry.split('\n\n')[1];
  assert.match(entry,/reusing a caller's answer without offering a path choice/);
  assert.match(entry,/caller's `brief`, or a direct ask with no caller answer, runs the folder step/);
  assert.match(entry,/Not now writes nothing, including no stub or answers record/);
  assert.match(entry,/caller's `full` or `simple` returns to that caller as outside the industry limit, writing nothing/);
  assert.match(entry,/No path-choice line is shown/);
  assert.ok(!/Offer brief and Not now|fixed industry-only path-choice line/.test(industry));
  assert.match(industry,/Stop the coverage after B3/);
  assert.match(industry,/Skip B8/);
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

test('recorded-brand samples use one page; only an absent colour and type takes a pick',()=>{
  const briefBoards=read('paths/brief-boards.md');
  const [samples,choice]=briefBoards.split('## Only when neither colour nor lettering was recorded');
  assert.match(samples,/one sample card and one banner/);
  assert.match(samples,/simple-brand caption/);assert.match(samples,/no board is locked/);
  assert.match(samples,/no dark-screen question/i);assert.match(samples,/closing question on a board/);
  assert.match(samples,/`design.md` stays complete/);assert.doesNotMatch(samples,/B11/);
  assert.match(choice,/no colour and no lettering at all/);
  assert.match(choice,/existing Step 4 pick question and B11/);
  assert.match(choice,/Record the one pick at B11/);assert.match(choice,/Ask no second choice/);
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
  for(const term of ['--check','formUnavailable','unchanged','shown','picks: []','steer','off','C14','question tool','pick: 0'])assert.ok(sitting.includes(term),term);
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

test('a place answered at the voice coach\'s P12 is carried, not asked again, and only on a personal root',()=>{
  const records=read('records.md'), taps=JSON.parse(read('parts/taps.json')).questions.find(q=>q.id==='place');
  for(const [label,id] of [['A coffee shop','coffee-shop'],['A nice hotel lobby','hotel-lobby'],['A design workshop','design-workshop'],['A calm spa','spa']]){
    assert.equal(taps.options.find(o=>o.id===id)?.label,label,id);
    assert.ok(sitting.includes(`${label} \`${id}\``),id);
    assert.ok(journey.includes(label),label);
  }
  for(const [text,phrase] of [[sitting,'On a personal root, find the newest voice answers file in `memory/answers/` that holds a P12 row'],[sitting,'`Build Voice bank 7` or a later bank, the row\'s shown cell holding P12\'s question word for word, "If your readers could sit down with you anywhere, where would feel most like you?", its status answered'],[sitting,'one of the places P12 shares with T9 word for word, or its letter in P12\'s own order (A a coffee shop, B a nice hotel lobby, D a calm spa, and from bank 8 C a design workshop)'],[sitting,'Bank 7\'s C, A workshop with tools on the wall, is not one of T9\'s options, so it asks T9'],[sitting,'including a skipped, in-between or typed P12'],[sitting,'T9 is not asked, on the question tool or in the lettered fallback'],[sitting,'Write no T9 row'],[sitting,'`carried.place`'],[sitting,'or eight with the place carried'],[sitting,'a screen was sent without a pick'],[sitting,'A carried place informs the taste description but is not listed in its correction question'],[bank,'Not asked where the place is carried'],[bank,'no T9 row where the place is carried'],[records,'with no T9 row'],[lock,'A place carried from P12 is left out of the note'],[journey,'is of bank 7 or later, still asks P12\'s question word for word, "If your readers could sit down with you anywhere, where would feel most like you?", and shows one of those four picked, question 9 is not asked'],[journey,'A skipped, in-between or typed P12 does not count'],[journey,'The read-back does not name a carried place'],[journey,'An organisation, a client or a department is always asked its own question 9'],[sitting,'the greatest V number, a name without one counting as V1'],[sitting,'Not quite cannot mark it off; where the member asks to change it, ask T9, write its row and drop `carried`'],[lock,'and `carried` where the place was carried'],[journey,'(eight where the place is carried, below)']])assert.ok(text.includes(phrase),phrase);
  for(const stale of ['or the last, the place, was sent','a carried place among them','or the row skipped, `place-none`','plainly match one of T9'])assert.ok(!sitting.includes(stale),stale);
  assert.ok(!lock.includes('already holds that answer\'s line'),'the voice note gives the true reason');
});

test('the voice coach\'s P12 offers the four places T9 shows, so places are asked once',()=>{
  const voice=readFileSync(resolve(skill,'../Build Voice/questions.md'),'utf8'),p12=voice.split('### P12.')[1].split('\n## ')[0];
  const offered=p12.split('Writes:')[0].split('\n').filter(l=>l.startsWith('- ')).map(l=>l.slice(2));
  const t9=JSON.parse(read('parts/taps.json')).questions.find(q=>q.id==='place').options.filter(o=>o.shown!==false).map(o=>o.label);
  assert.deepEqual([...offered].sort(),[...t9].sort());
  const bank = Number((voice.match(/Bank version for every row: `Build Voice bank (\d+)`\./) || [])[1]);
  assert.ok(bank >= 8, 'P12 offers A design workshop from bank 8 on');
  assert.ok(p12.includes('- A design workshop: "Works ideas out alongside the reader: inventive, hands-on, and open about the work in progress."'));
});

test('every tap the bank shows is the data\'s shown option, in order, and the hidden fills are never shown',()=>{
  const data=JSON.parse(read('parts/taps.json'));
  data.questions.forEach((q,i)=>{
    const tap=bank.split(`### T${i+1}\n`)[1].split(/\n##/)[0];
    const shown=tap.split('\n').filter(l=>l.startsWith('- ')).map(l=>l.slice(2));
    assert.deepEqual(shown,q.options.filter(o=>o.shown!==false && !(i>=4 && i<=7 && o.label==='None of these')).map(o=>o.description?`${o.label}: ${o.description}`:o.label),`T${i+1}`);
    assert.ok(shown.length<=4,`T${i+1} fits the question tool's four options`);
  });
  for(const stale of ['Mechanical','Subaru','Ethan Allen','A buzzing design studio','A workshop with tools on the wall'])assert.ok(!bank.split('## Step 3: Nine taps')[1].split('## Step 3: Reveal')[0].includes(stale),stale);
  assert.ok(sitting.includes('the T2 and T9 ones being fills the question tool never shows'));
  assert.ok(sitting.includes('each with its four brands only: None of these is left to the tool\'s own typed answer'),'T5 to T8 fit the question tool');
  assert.ok(bank.includes('On the question tool, T5 to T8 show their four brands only, None of these left to the tool\'s own typed answer.'),'the bank says so');
});

test('each approved gap line is used where its gap happens, and no file still calls it a gap',()=>{
  const org=read('paths/organisation.md'), boards=read('paths/brief-boards.md'), writing=read('writing.md'), industry=read('paths/record-my-look.md');
  for(const [text,phrase] of [[org,"organisation thin-record sentence"],[sitting,'already saved the thin-record answer at `organisation.md` Who it\'s for'],[sitting,"own-words line"],[sitting,"`mode-either`, `feel-unsure`, `history-unsure`, `strength-unsure`, `technology-none`, `style-none`, `posture-none`, `mood-none` or `place-none`"],[sitting,"As it is is 0, and so is a tap left unanswered"],[sitting,"every-look line"],[sitting,"every-direction line"],[sitting,"own-page line"],[sitting,"design-check line"],[boards,"design-check line"],[router,"design-check line"],[lock,"one-word line"],[lock,"organisation offers line"],[lock,"saying nothing of it to the member"],[writing,"Say nothing of it to the member"],[industry,"Record my look close"]])assert.ok(text.includes(phrase),phrase);
  for(const [text,stale] of [[org,'keep that as a gap'],[sitting,'missing-tap recovery'],[sitting,'disclosure sentence'],[boards,'no fixed disclosure'],[lock,'core word has no fixed'],[lock,'flag the missing offer'],[writing,'voice-absence disclosure line'],[industry,'no fixed industry close'],[bank,'not a full alternate offer']])assert.ok(!text.includes(stale),stale);
  for(const heading of ['### Record my look close'])assert.ok(bank.includes(heading),heading);
  for(const [text,phrase] of [[sitting,'not appended to the looks history a second time'],[sitting,'not appended to board `shown` a second time and does not take Review again'],[sitting,'a check problem on `brand.logo`'],[sitting,'"logo and fonts" only where the font-file refusal comes with a kept logo the card would refuse too'],[sitting,'sent without a pick (`null`)'],[sitting,'never a no-preference fill'],[org,'Can answered about not support the audience draft or the promise draft?'],[org,"bank's organisation offers line"],[lock,'A changed pair alone says no sentence line']])assert.ok(text.includes(phrase),phrase);
  for(const [text,stale] of [[sitting,'Do not turn a skipped answer into a preference'],[org,'page-to-share phrase in the bank'],[lock,'go to Done after recording any pair-only correction'],[router,'under the retained rule']])assert.ok(!text.includes(stale),stale);
});

test('brief gaps without a B row keep their G number and Review retries use the selector',()=>{
 for(const text of [read('paths/brief.md'),bank])assert.match(text,/no B row, including Layout Habits and Foundation, is recorded and cited at its G number/);
 assert.match(sitting,/full blocked `selection.boards` records in `avoid`/);
 assert.match(read('records.md'),/optional `avoid` on a Review retry/);
 assert.match(sitting,/never in `shown`, since none was displayed/);
});

test('industry Record my look keeps the brand-files screen without a progress line across its instructions',()=>{
 for(const text of [read('paths/brief.md'),bank])assert.match(text,/no progress line, since it has no step 2 or 3/);
 assert.match(read('paths/record-my-look.md'),/no progress line: an industry has no step 2 or 3/);
 assert.match(read('paths/brief.md').split('\n')[2],/An industry's Record my look shows the Brand files screen with no progress line/);
 assert.match(bank.split('\n')[2],/industry Record my look exception in `paths\/brief\.md`/);
});

const rf5Drafts=[
 "Let's build your brand: a few quick taps, then brands made for you. About 15 minutes.",
 "Let's build [org]'s brand: a few quick taps, then brands made for [org]. About 15 minutes.",
 "Getting your looks ready. The first time takes a few minutes while I get set up.",
 'I couldn\'t get your looks ready just now. Say "build my brand" any time and we\'ll pick up from here.',
 'Making your boards now. A couple minutes.',
 'Checking the words on your board. A minute or two.',
 'To lock a board in, leave just that one ticked.',
 "Drop your brand files here in the chat: a brand guide, your logo, slides or a document in your style. Or type your website's address. Either works, or both.",
 'Type the address here.',
 "I don't see any files yet. Drop them in, or type your website's address.",
 "I don't have them: build one with me",
 'Leave this for later',
 "Your looks can't show in this card, so I'll open them on their own page instead.",
 "Your boards can't show in this card, so I'll open them on their own page instead.",
 'Your looks can\'t show in this app until Wiser is reconnected. Reconnect it in the app\'s settings, then say "build my brand" and we\'ll pick up from here.',
 'Your boards can\'t show in this app until Wiser is reconnected. Reconnect it in the app\'s settings, then say "build my brand" and we\'ll pick up from here.',
 'I couldn\'t get your boards ready just now. Say "build my brand" any time and we\'ll pick up from here.',
 'I couldn\'t get your looks ready: this computer couldn\'t reach the internet to fetch the lettering. Check you\'re online, then say "build my brand" and we\'ll pick up from here.',
 'I couldn\'t get your looks ready: your network blocked the lettering download. If you\'re on a work or school network, try another one, then say "build my brand" and we\'ll pick up from here.',
 'I couldn\'t get your looks ready: the lettering download isn\'t answering right now. That\'s on our side, not yours. Say "build my brand" in a little while and we\'ll pick up from here.',
 'I couldn\'t get your looks ready: the lettering download was taking too long. A steadier connection helps. Say "build my brand" any time and we\'ll pick up from here.',
 'I couldn\'t get your looks ready: there wasn\'t room on this computer to save the lettering. Free up some space, then say "build my brand" and we\'ll pick up from here.',
 ...['looks','boards'].flatMap(k=>[
  `Your ${k} didn't show in this card. Reconnecting Wiser in the app's settings usually fixes it. Then say "build my brand" and we'll pick up from here.`,
  `Your ${k} couldn't open in a browser window on this computer. Say "build my brand" to try again, and we'll pick up from here.`,
  `I couldn't get your ${k} ready: something went wrong on our side while making them. Say "build my brand" any time and we'll pick up from here.`])
];
for(const [i,line] of rf5Drafts.entries())test(`RF5 draft ${i+1} is marked in the journey and a copy change fails on either side`,()=>{
 assert.ok(bank.includes(line),line);
 const at=journey.indexOf(line);assert.ok(at>=0,line);
 const tail=journey.slice(at+line.length);
 // Blockquotes/options have a separate marker; inline variants carry it on
 // that line. The marker must immediately follow this draft, not another.
 // Every RF5 line was approved on 2026-11-06, relayed by the first run session.
 const marker=/\(the operator's (?:yes|wording) of 2026-11-06/;
 assert.match(tail,new RegExp('^(?:"?\\s*)?(?:as a plain message )?'+marker.source));
 const changed=line.slice(0,-1)+'!';
 assert.throws(()=>compareJourneyCopy(journey,bank.replace(line,changed),openingTaps));
 assert.throws(()=>compareJourneyCopy(journey.replace(line,changed),bank,openingTaps));
});

test('RF5 reasons: no draft marker remains, and the sitting names its cause lines',()=>{
 assert.doesNotMatch(journey,/\(draft, 2026-11-05, for the operator's approval\)/);
 assert.match(sitting,/line for the cause shown, R1 to R5 there, or its plain failure line where no listed cause is shown/);
 assert.match(sitting,/reconnect-to-fix line for looks or boards/);
 assert.match(sitting,/could-not-open line for looks or boards; where assembly, the design check or a script failed, its on-our-side line/);
 assert.match(bank,/never guess a cause/);
});
