// Diagnostic only: run shared install fixtures with the original CLI text.
// It changes only a fixture's copied script, never the repository or assertions.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const copy=fs.cpSync;
fs.cpSync=function(source,destination,...args){
  const result=copy.call(this,source,destination,...args);
  if(String(source)===join(root,'tools/render/scripts'))fs.writeFileSync(join(destination,'render.js'),execFileSync('git',['show','1f810776:tools/render/scripts/render.js'],{cwd:root}));
  return result;
};
syncBuiltinESMExports();
