#!/usr/bin/env node
// Integration harness: assemble explicit selections and build with Contact Sheet.
import { readFileSync, writeFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, LIBRARY, canonical } from '../scripts/assemble.mjs';
import { runContactSheet } from '../../../tools/Contact Sheet/scripts/contact-sheet.js';
import { board, selection, energies, matchingPairing } from './selections.mjs';
const HELP='Usage: node tests/specimens.mjs --output-dir <absolute existing work directory>\nBuilds four HTML specimens, selection and spec JSON, and checks.json. Never overwrites. No network or installs. --help and -h print this usage.';
export function specimens(argv=process.argv.slice(2)) {
  for(const arg of argv)if(arg.startsWith('-')&&!['--output-dir','--help','-h'].includes(arg))throw Error(`Unknown option ${arg}; see --help.`);
  if(!argv.length||argv.includes('--help')||argv.includes('-h')||argv[0]==='help')return HELP;
  if(argv.length!==2||argv[0]!=='--output-dir'||!isAbsolute(argv[1]))throw Error(HELP);
  const out=canonical(argv[1]), skill=resolve(fileURLToPath(new URL('..',import.meta.url)));
  if(!relative(skill,out).startsWith('..'))throw Error('Use a work directory outside this skill.');
  const library=JSON.parse(readFileSync(LIBRARY));
  const compatible=['warm-grotesque','newspaper','warm-grotesque','friendly-serif','sharp-serif','chunky','marker','poster','condensed','humanist','high-contrast','expressive'];
  const sets=['drawn','drafting','marker','marker','geometric','marker','marker','riso','geometric','stitch','riso','geometric','drafting','drafting','geometric','geometric','geometric','riso','geometric','stamp','drafting','editorial','marker','geometric','stitch'];
  const containers=['drafting-box','drafting-box','filled-square','double-ring','filled-square','filled-circle','marker-swash','drawn-ring','filled-square','oval','rule-box','filled-square'];
  const paletteBoards=library.palettes.map((p,i)=>{
    const pairing=compatible[i]||matchingPairing(library,p);
    return board(library,{number:i+1,palette:p.id,pairing,graphic:sets[i],container:containers[i%containers.length],handwriting:library.pairings.find(x=>x.id===pairing).handwriting[0].family});
  });
  const pairingBoards=library.pairings.map((p,i)=>{
    const palette=p.tags.typeLoudness===1?'stone-cobalt':p.tags.typeLoudness===2?'white-oxblood':p.tags.typeCut==='period'?'ink-amber':'navy-gold';
    const b=board(library,{number:i+1,palette,pairing:p.id,graphic:palette==='white-oxblood'?'editorial':'drafting',container:library.containers[i%8].id,handwriting:p.handwriting[0].family});
    b.name=p.name;b.why=p.character;return b;
  });
  const graphicBoards=library.graphics.flatMap((g,i)=>['light','dark'].map((mode,j)=>{
    const b=board(library,{number:i*2+j+1,palette:'green-black',pairing:'quiet-sans',graphic:g.id,container:library.containers[i].id,mode,handwriting:'Covered By Your Grace'});
    b.group=g.id;b.name=`${g.name} in ${mode}`;b.energy=`${mode} surface`;b.why=`${g.description} Container: ${library.containers[i].name}.`;return b;
  }));
  const wholeIds=['paper-orange','white-oxblood','gold-pink','cobalt-yellow','navy-coral'];
  const wholeBoards=wholeIds.map((id,i)=>board(library,{number:i+1,palette:id,pairing:['warm-grotesque','warm-grotesque','chunky','lively','sharp-serif'][i],graphic:['drawn','geometric','marker','drafting','editorial'][i],container:['drafting-box','filled-square','filled-circle','double-ring','rule-box'][i],handwriting:i===0?'Kalam':null}));
  // Each strengthened pattern is also inspected on a complete dark-first board.
  wholeBoards[4].name='Editorial marks on navy';
  for(const [i,id] of ['marker','geometric','stitch','stamp'].entries()){
    const b=board(library,{number:6+i,palette:'green-black',pairing:'quiet-sans',graphic:id,container:['marker-swash','filled-circle','oval','double-ring'][i],mode:'dark',handwriting:'Covered By Your Grace'});
    b.name=`${library.graphics.find(g=>g.id===id).name} on green-black`;wholeBoards.push(b);
  }
  const selections={palettes:selection(paletteBoards,library),pairings:selection(pairingBoards,library),graphics:{...selection(graphicBoards,library),groups:library.graphics.map(g=>({id:g.id,label:g.name}))},whole:selection(wholeBoards,library)};
  const outputs=Object.keys(selections).flatMap(name=>[`${name}.selection.json`,`${name}.spec.json`,`${name}.html`]);outputs.push('checks.json');
  for(const filename of outputs)if(existsSync(resolve(out,filename)))throw Error(`${filename} already exists. Choose a new output directory.`);
  const checks={};
  for(const [name,s]of Object.entries(selections)){
    const input=resolve(out,`${name}.selection.json`),spec=resolve(out,`${name}.spec.json`),html=resolve(out,`${name}.html`);
    writeFileSync(input,JSON.stringify(s,null,2)+'\n',{flag:'wx'});
    run(['--selection',input,'--output',spec]);
    const result=runContactSheet(['build','--spec',spec,'--output',html]);checks[name]=result.boards;
    let page=readFileSync(html,'utf8');
    if(name==='whole')page=page.replace('</head>','<style>.board-collection>.index-page{display:none}.board-collection>.whole-view{display:block}.mode-sheet.primary{display:block}.whole-view:has(.mode-sheet:target)>.mode-sheet.primary{display:none}.whole-view:has(.mode-sheet:target)>.mode-sheet:target{display:block}</style></head>');
    if(name==='graphics'){
      // Reuse only Contact Sheet's already-validated, embedded drawings.
      const byNumber=new Map();
      for(const match of page.matchAll(/<div class="mode-sheet( primary)?" id="whole-(\d+)-(light|dark)">([\s\S]*?)(?=<div class="mode-sheet|<\/section>\n|<\/main>)/g)){
        if(match[1]){const detail=match[4].match(/<section class="graphic-language"[\s\S]*?<\/section>/)?.[0];if(detail)byNumber.set(Number(match[2]),detail);}
      }
      if(byNumber.size!==graphicBoards.length)throw Error('Cannot locate every primary graphic specimen.');
      page=page.replace(/(<div class="brand-board tile" data-board="(\d+)"[\s\S]*?)(<div class="open-space">)/g,(_,start,n,end)=>start+byNumber.get(Number(n))+end);
      page=page.replace('</head>','<style>.tile .graphic-language{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:0 0 28px;padding:18px}.tile .sample-page{padding:0 14px 18px;min-height:330px}.tile .sample-rule{margin-left:-14px;width:calc(100% + 28px)}.tile .sample-body{display:block}.tile .sample-body aside{margin-top:12px}.tile .sample-title{font-size:22px!important}.tile .legend h3{font-size:20px!important}.tile .legend li{grid-template-columns:32px 1fr;font-size:12px}.tile .legend-mark{width:32px}.tile .legend>.label{font-size:12px}.tile .sample-kicker{font-size:10px}.tile .sample-close{width:20px;height:24px}.tile .sample-body>p{font-size:13px}.tile .sample-steps{width:100%}.tile .open-space{margin-top:auto}@media(max-width:600px){.tile .graphic-language{grid-template-columns:1fr}}</style></head>');
    }
    writeFileSync(html,page);
  }
  writeFileSync(resolve(out,'checks.json'),JSON.stringify(checks,null,2)+'\n',{flag:'wx'});
  return {outputDirectory:out,pages:Object.keys(selections),boards:Object.values(checks).reduce((n,b)=>n+b.length,0)};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url))try{const result=specimens();process.stdout.write((typeof result==='string'?result:JSON.stringify(result))+'\n');}catch(e){process.stderr.write(JSON.stringify({error:e.message})+'\n');process.exitCode=1;}
