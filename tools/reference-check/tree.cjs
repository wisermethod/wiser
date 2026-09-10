const fs = require('node:fs');
const path = require('node:path');
const within = (p, b) => p === b || p.startsWith(b + path.sep);
const sensitive = n => /^\.env(?:\.|$)/i.test(n) || /^(secrets?|credentials?)(?:\.|$)/i.test(n) || /api[-_]?key|token|password|private[-_]?key/i.test(n);
const inode = p => { const s = fs.statSync(p); return s.dev + ':' + s.ino; };
function canonical(p) {
 const abs = path.resolve(p);
 if (fs.existsSync(abs)) return fs.realpathSync(abs);
 if (fs.lstatSync(path.dirname(abs), {throwIfNoEntry:false})?.isSymbolicLink()) return path.join(fs.realpathSync(path.dirname(abs)), path.basename(abs));
 const parent = path.dirname(abs);
 if (parent === abs) throw Error('Cannot canonicalize path; choose an accessible path');
 return path.join(canonical(parent), path.basename(abs));
}
function inspect(root, {textOnly = false, declarations = true} = {}) {
 const files = [], dirs = [], skipped = [], deny = new Set(), bound = new Set();
 function walk(d, hidden = false) {
  for (const e of fs.readdirSync(d, {withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
   const p = path.join(d,e.name), rel = path.relative(root,p).split(path.sep).join('/');
   if(e.isSymbolicLink()) { if(!hidden) skipped.push({path:rel,reason:'symbolic-link'}); continue; }
   if(e.name === '.git') { if(!hidden) skipped.push({path:rel,reason:'repository-history'}); continue; }
   const secret = hidden || sensitive(e.name);
   if(secret && !hidden) skipped.push({path:rel+(e.isDirectory()?'/':''),reason:'credential-path'});
   if(e.isDirectory()) { if(!secret) dirs.push(rel); walk(p,secret); }
   else if(e.isFile()) { if(secret) deny.add(inode(p)); else files.push({p,rel}); }
   else if(!hidden) skipped.push({path:rel,reason:'special-file'});
  }
 }
 walk(root);
 const agents = path.join(root,'AGENTS.md');
 if(declarations && fs.lstatSync(agents,{throwIfNoEntry:false})?.isFile()) {
  if(deny.has(inode(agents))) throw Error('Root declaration is a credential hard link; choose a safe root; use help');
  const declaration = fs.readFileSync(agents,'utf8');
  const provides = declaration.match(/^## Provides\s*\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] || '';
  for(const m of provides.matchAll(/^\s*-\s+secrets:[^:\s]+:\s+(.+?)\s*$/gm)) {
   const spelling = m[1].replace(/^`|`$/g,'');
   const p = canonical(path.resolve(root,spelling));
   bound.add(p);
   const st=fs.statSync(p,{throwIfNoEntry:false});
   if(st?.isFile()) deny.add(inode(p));
   if(st?.isDirectory()) throw Error('Credential binding names a directory; bind one file before scanning');
   if(!within(p,root)) skipped.push({path:spelling,reason:'external-declared-credential'});
  }
 }
 const safe = files.filter(f=>{
  if(bound.has(f.p)) {skipped.push({path:f.rel,reason:'declared-credential'});return false;}
  if(deny.has(inode(f.p))) {skipped.push({path:f.rel,reason:'credential-hardlink'});return false;}
  if(textOnly && !/\.(md|mdc|txt)$/i.test(f.p)) {skipped.push({path:f.rel,reason:'unsupported-format'});return false;}
  return true;
 });
 return {files:safe,dirs,skipped,deny};
}
module.exports={within,sensitive,inode,canonical,inspect};
