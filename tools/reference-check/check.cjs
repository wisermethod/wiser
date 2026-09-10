// Read-only reference scan. Contract: wiser/standards/script-contract.md.
const fs=require('node:fs'),path=require('node:path');
const HELP='Usage: node check.cjs help | --help | scan --root <dir>\nNode built-ins only. No install, configuration, writes, network, or stdin.\n';
const own=fs.realpathSync(__dirname);
const within=(p,b)=>p===b||p.startsWith(b+path.sep);
const sensitive=n=>/^\.env(?:\.|$)/i.test(n)||/^(secrets?|credentials?)(?:\.|$)/i.test(n)||/api[-_]?key|token|password|private[-_]?key/i.test(n);
function main(){
 const args=process.argv.slice(2);
 if(args.length===1&&['help','--help'].includes(args[0])){process.stdout.write(HELP);return;}
 for(const a of args)if(a.startsWith('--')&&a!=='--root')throw Error('Unknown flag '+a+'; use help');
 if(args.length!==3||args[0]!=='scan'||args[1]!=='--root')throw Error('Expected scan --root <dir>; use help');
 const root=fs.realpathSync(args[2]);
 if(within(root,own))throw Error('Root is inside tool directory; choose a working directory outside it; use help');
 if(!fs.statSync(root).isDirectory())throw Error('Root must be a directory; use help');
 if(root.split(path.sep).some(sensitive))throw Error('Root is credential-bearing; choose a non-credential working directory; use help');
 const {files:safe,skipped,deny}=require('./tree.cjs').inspect(root,{textOnly:true});
 const inode=require('./tree.cjs').inode;
 const families=['skills','experts','tools','connectors'];const names=[];
 for(const fam of families){
  const dir=path.join(root,fam);
  if(fs.existsSync(dir)&&!fs.lstatSync(dir).isSymbolicLink()&&fs.statSync(dir).isDirectory())
   for(const e of fs.readdirSync(dir,{withFileTypes:true}))if(e.isDirectory()&&!sensitive(e.name))names.push({name:e.name,target:fam+'/'+e.name+'/'});
 }
 names.sort((a,b)=>b.name.length-a.name.length||a.name.localeCompare(b.name,'en'));
 function state(file,t){
  if(/^[a-z][a-z0-9+.-]*:/i.test(t)||t.startsWith('//'))return 'external';
  if(t.startsWith('#'))return 'anchor-only';
  const clean=t.split(/[?#]/)[0];
  let decoded;try{decoded=decodeURIComponent(clean);}catch{return 'invalid';}
  if(decoded.split(/[\\/]/).some(sensitive))return 'skipped';
  const candidates=[path.resolve(path.dirname(file),decoded),path.resolve(root,decoded.replace(/^\//,''))];
  for(const p of candidates){
   if(!within(p,root))continue;
   let q=root,link=false;
   for(const part of path.relative(root,p).split(path.sep)){q=path.join(q,part);if(fs.existsSync(q)&&fs.lstatSync(q).isSymbolicLink()){link=true;break;}}
   if(link)return 'skipped';
   if(fs.existsSync(p)){const real=fs.realpathSync(p);if(!within(real,root)||deny.has(inode(real)))return 'skipped';return 'resolved';}
  }
  return 'unresolved';
 }
 const references=[],fenced=[];
 const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 for(const file of safe.sort((a,b)=>a.rel<b.rel?-1:a.rel>b.rel?1:0)){
  let fence=null;
  fs.readFileSync(file.p,'utf8').split(/\r?\n/).forEach((line,ix)=>{
   const fm=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
   if(fm&&(!fence||fm[1][0]===fence.char&&fm[1].length>=fence.length&&fm[2].trim()==='')){
    if(fence)fence=null;else fence={char:fm[1][0],length:fm[1].length};return;
   }
   const occupied=[];
   function add(start,end,shape,target){
    if(occupied.some(([a,b])=>start<b&&end>a))return;
    occupied.push([start,end]);
    const entry={file:file.rel,line:ix+1,shape,target,state:shape==='bare-name'?'estimated-name-match':state(file.p,target)};
    (fence?fenced:references).push(entry);
   }
   for(const m of line.matchAll(/\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g))add(m.index,m.index+m[0].length,'markdown-link',m[1].replace(/^<|>$/g,''));
   for(const m of line.matchAll(/`([^`\n]+)`/g)){
    if(/[/\\]|\.[a-z0-9]{1,8}(?:[#?].*)?$/i.test(m[1]))add(m.index,m.index+m[0].length,m[1].endsWith('/')?'backticked-directory':'backticked-path',m[1]);
   }
   for(const n of names){const re=new RegExp('(?<![\\w-])'+esc(n.name)+'(?![\\w-])','gi');for(const m of line.matchAll(re))add(m.index,m.index+m[0].length,'bare-name',n.target);}
   if(fence)for(const m of line.matchAll(/(?:\.{0,2}\/)?[A-Za-z0-9_.-]+\/(?:[A-Za-z0-9_.-]+\/?)+(?:#[A-Za-z0-9_-]+)?/g))add(m.index,m.index+m[0].length,'fenced-path',m[0]);
  });
 }
 skipped.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 process.stdout.write(JSON.stringify({references,fenced,skipped,scope:{families:'family directories inside --root; no composed-root search',anchors:'path existence only; anchors not validated',formats:['md','mdc','txt'],manualInventoryRequired:true,manualInventory:'Caller supplies composed-plugin family indexes and reviews their names; no sibling discovery'}},null,2)+'\n');
}
try{main();}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}
