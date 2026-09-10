const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {within,sensitive,canonical,inspect}=require('./tree.cjs');
const own=fs.realpathSync(__dirname);
const HELP='Usage: node snapshot.cjs help | --help\n  take --root <dir> --snapshot <new-disjoint-dir> --changes <json-file>\n  verify|g3|restore --root <dir> --snapshot <dir>\nChanges JSON: {"paths":["relative/file.md","new/directory"]}. List all changed, removed and created paths, including ancestors.\nNode built-ins only; no install, configuration, network or stdin. See snapshot.md for the write contract.\n';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const stable=x=>JSON.stringify(x);
function safePath(p){const q=canonical(p);if(q.split(path.sep).some(sensitive)||within(q,own))throw Error('Refused credential or tool path; choose a working path outside the tool');return q;}
function relative(p){return typeof p==='string'&&p!==''&&!path.isAbsolute(p)&&p.split(/[\\/]/).every(x=>x!==''&&x!=='.'&&x!=='..'&&x!=='.git'&&!sensitive(x));}
function inventory(root,declarations=true){
 const t=inspect(root,{declarations});
 return {files:t.files.map(f=>({path:f.rel,size:fs.statSync(f.p).size,mode:fs.statSync(f.p).mode&511,sha256:hash(f.p)})),dirs:t.dirs,skipped:t.skipped.sort((a,b)=>a.path.localeCompare(b.path))};
}
function assertPaths(root,paths){
 for(const rel of paths){
  if(!relative(rel))throw Error('Unsafe change-set path; use exact relative non-credential paths');
  const p=canonical(path.join(root,rel));
  if(within(p,own)||!within(p,root)||p!==path.join(root,rel))throw Error('Change-set path crosses a link; resolve the plan before work');
  const st=fs.lstatSync(p,{throwIfNoEntry:false});
  if(st?.isFile()&&st.nlink>1)throw Error('Change-set file has hard-link aliases; resolve ownership before work');
 }
}
function validateSnapshot(root,snap){
 const mf=path.join(snap,'manifest.json');
 if(!fs.lstatSync(mf,{throwIfNoEntry:false})?.isFile()||fs.statSync(mf).nlink!==1)throw Error('Unsafe snapshot manifest; use the original snapshot');
 const m=JSON.parse(fs.readFileSync(mf,'utf8'));
 if(m.version!==1||m.root!==root||!Array.isArray(m.paths)||!Array.isArray(m.files)||!Array.isArray(m.dirs)||!Array.isArray(m.skipped))throw Error('Snapshot schema or root mismatch; use the matching snapshot');
 if(!m.files.every(f=>relative(f.path)&&/^[a-f0-9]{64}$/.test(f.sha256)&&Number.isInteger(f.mode))||!m.dirs.every(relative))throw Error('Unsafe snapshot manifest entries; do not restore');
 if(new Set(m.files.map(f=>f.path)).size!==m.files.length||new Set(m.dirs).size!==m.dirs.length)throw Error('Duplicate snapshot entry; do not restore');
 assertPaths(root,m.paths);
 const copies=path.join(snap,'copies');
 if(canonical(copies)!==copies)throw Error('Snapshot copies cross a link; do not restore');
 const actual=inventory(copies,false);
 if(stable(actual.files)!==stable(m.files)||stable(actual.dirs)!==stable(m.dirs)||actual.skipped.length)throw Error('Snapshot copies fail filesystem/hash comparison; do not restore');
 return m;
}
function main(){
 const args=process.argv.slice(2);
 if(args.length===1&&['help','--help'].includes(args[0])){process.stdout.write(HELP);return;}
 for(const a of args)if(a.startsWith('--')&&!['--root','--snapshot','--changes'].includes(a))throw Error('Unknown flag '+a+'; use help');
 const cmd=args.shift();if(!['take','verify','g3','restore'].includes(cmd))throw Error('Unknown command; use help');
 const opts={};while(args.length){const k=args.shift(),v=args.shift();if(!['--root','--snapshot','--changes'].includes(k)||!v||v.startsWith('--')||opts[k])throw Error('Missing, repeated or invalid option; use help');opts[k]=v;}
 if(!opts['--root']||!opts['--snapshot']||(cmd==='take')!==Boolean(opts['--changes']))throw Error('Incorrect command options; use help');
 const root=safePath(opts['--root']),snap=safePath(opts['--snapshot']);
 if(!fs.statSync(root).isDirectory()||within(root,snap)||within(snap,root))throw Error('Root and snapshot must be disjoint directories; choose another snapshot home');
 let out;
 if(cmd==='take'){
  if(fs.existsSync(snap))throw Error('Snapshot already exists; choose a new path');
  if(!fs.existsSync(path.dirname(snap)))throw Error('Snapshot parent must exist; name an approved evidence directory');
  const t=inspect(root),changes=safePath(opts['--changes']);
  if(fs.statSync(changes).nlink!==1||t.deny.has(require('./tree.cjs').inode(changes)))throw Error('Change-set is a credential or hard-link alias; choose a plain plan file');
  const data=JSON.parse(fs.readFileSync(changes,'utf8'));
  if(Object.keys(data).join(',')!=='paths'||!Array.isArray(data.paths)||new Set(data.paths).size!==data.paths.length)throw Error('Changes must contain unique paths only; use help');
  assertPaths(root,data.paths);
  for(const p of data.paths)if(t.skipped.some(s=>p===s.path.replace(/\/$/,'')||p.startsWith(s.path.replace(/\/$/,'')+'/')||s.path.replace(/\/$/,'').startsWith(p+'/')))throw Error('Change-set touches an excluded path; revise plan');
  const m={version:1,root,paths:data.paths,...inventory(root)};
  fs.mkdirSync(snap,{mode:448});const copies=path.join(snap,'copies');fs.mkdirSync(copies);
  for(const d of m.dirs)fs.mkdirSync(path.join(copies,d),{recursive:true});
  for(const f of m.files){const p=path.join(copies,f.path);fs.copyFileSync(path.join(root,f.path),p,fs.constants.COPYFILE_EXCL);fs.chmodSync(p,f.mode);}
  fs.writeFileSync(path.join(snap,'manifest.json'),JSON.stringify(m,null,2)+'\n',{flag:'wx',mode:384});
  validateSnapshot(root,snap);
  if(stable(inventory(root))!==stable({files:m.files,dirs:m.dirs,skipped:m.skipped}))throw Error('Root changed during snapshot; discard this snapshot and replan');
  out={command:cmd,snapshot:snap,files:m.files.length,directories:m.dirs.length,excluded:m.skipped,absentDestinations:m.paths.filter(p=>!fs.existsSync(path.join(root,p))),g3:{manifestExistedYes:m.files.length,filesystemCopies:m.files.length}};
 }else{
  const m=validateSnapshot(root,snap);
  if(cmd!=='g3'){
   const now=inventory(root),before={files:m.files,dirs:m.dirs,skipped:m.skipped};
   if(cmd==='restore'){
    if(stable(now.skipped)!==stable(m.skipped))throw Error('Excluded path inventory changed; stop for operator recovery');
    const old=new Map(m.files.map(f=>[f.path,f])),current=new Map(now.files.map(f=>[f.path,f]));
    const changed=new Set([...old.keys(),...current.keys()].filter(p=>stable(old.get(p))!==stable(current.get(p))));
    for(const d of [...m.dirs,...now.dirs])if(m.dirs.includes(d)!==now.dirs.includes(d))changed.add(d);
    if([...changed].some(p=>!m.paths.includes(p)))throw Error('Unapproved path changed; replan or recover with the operator');
    for(const p of changed)if(old.has(p)&&now.dirs.includes(p)||m.dirs.includes(p)&&current.has(p))throw Error('File/directory type swap; operator recovery required');
    // All validation precedes mutation; unexpected filesystem failure leaves the snapshot intact.
    for(const f of now.files)if(!old.has(f.path))fs.unlinkSync(path.join(root,f.path));
    for(const d of [...now.dirs].sort((a,b)=>b.split('/').length-a.split('/').length))if(!m.dirs.includes(d))fs.rmdirSync(path.join(root,d));
    for(const d of m.dirs)fs.mkdirSync(path.join(root,d),{recursive:true});
    for(const f of m.files)if(changed.has(f.path)){fs.copyFileSync(path.join(snap,'copies',f.path),path.join(root,f.path));fs.chmodSync(path.join(root,f.path),f.mode);}
   }
   if(stable(inventory(root))!==stable(before))throw Error('Root does not match snapshot hashes and path set; inspect or restore the approved transaction');
  }
  out={command:cmd,snapshot:snap,g3:{manifestExistedYes:m.files.length,filesystemCopies:m.files.length},...(cmd==='g3'?{}:{allHashesMatch:true,createdPathsGone:true})};
 }
 process.stdout.write(JSON.stringify(out)+'\n');
}
try{main();}catch(e){process.stderr.write((e instanceof SyntaxError?'Invalid JSON; repair the change-set or snapshot manifest':e.message)+'\n');process.exitCode=1;}
