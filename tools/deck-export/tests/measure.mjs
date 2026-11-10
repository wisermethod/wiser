// Offline capped-job measurement, using the shared source fixture.
import { launch } from '../../lib/browser-runtime/browser-runtime.js';
import { portable } from './portable-loader.js';
import { upload } from './fixtures/upload.mjs';
import { revealAssets } from '../scripts/package-assets.js';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const core=await portable(new URL('../scripts/export-core.js',import.meta.url));
const file=await upload({slides:24}),browser=await launch(),directory=mkdtempSync(join(tmpdir(),'deck-measure-'));
try{
  const input=join(directory,'deck.zip');writeFileSync(input,file.bytes);
  for(const command of ['pdf','png']){
    const options={width:4096,height:4096,scale:1};
    let start=performance.now();const output=await core[command==='pdf'?'exportPdf':'exportPng'](options,[file],{browser,revealAssets:revealAssets(),responseBody:bytes=>Buffer.from(bytes)});const coreMs=Math.round(performance.now()-start);
    const destination=join(directory,command==='pdf'?'deck.pdf':'slides.zip');
    start=performance.now();const cli=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/deck.js',import.meta.url)),command,'--input',input,'--output',destination,'--width','4096','--height','4096','--scale','1'],{encoding:'utf8',timeout:65000,env:{...process.env,npm_config_offline:'true'}});
    if(cli.status!==0)throw new Error(cli.stderr);
    console.log(JSON.stringify({case:'24 slides, 16777216 pixels per slide',command,inputBytes:file.bytes.length,outputBytes:output.files[0].bytes.length,coreMs,cliMs:Math.round(performance.now()-start),...(command==='png'?{identical:Buffer.from(output.files[0].bytes).equals(readFileSync(destination))}:{})}));
  }
}finally{await browser.close();rmSync(directory,{recursive:true,force:true});}
