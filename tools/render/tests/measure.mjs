// Offline capped-job measurement. Scratch uses this machine's default temp dir.
import { launch } from '../../lib/browser-runtime/browser-runtime.js';
import { portable } from './portable-loader.js';
import { network } from './fixtures/network.mjs';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const core=await portable(new URL('../scripts/render-core.js',import.meta.url));
const directory=mkdtempSync(join(tmpdir(),'render-measure-')),browser=await launch();
try{
  const shell='<html><body style="margin:0;background:#345;height:2048px"><!--';
  const tail='--></body></html>';
  const bytes=new TextEncoder().encode(shell+' '.repeat(8388608-shell.length-tail.length)+tail);
  const input={width:8192,height:2048};
  let start=performance.now();
  const output=await core.renderHtml(input,[{name:'large.html',bytes}],{browser,responseBody:bytes=>Buffer.from(bytes)});
  const coreMs=Math.round(performance.now()-start);
  const path=join(directory,'large.html'),destination=join(directory,'render.png');writeFileSync(path,bytes);
  start=performance.now();
  const cli=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/render.js',import.meta.url)),'html','--input',path,'--output',destination,'--width','8192','--height','2048'],{encoding:'utf8',timeout:65000,env:{...process.env,npm_config_offline:'true'}});
  if(cli.status!==0)throw new Error(cli.stderr);
  console.log(JSON.stringify({case:'8 MiB HTML, 16777216 pixels',inputBytes:bytes.length,outputBytes:output.files[0].bytes.length,coreMs,cliMs:Math.round(performance.now()-start),identical:Buffer.from(output.files[0].bytes).equals(readFileSync(destination))}));
  {
    const options={url:'https://public.example/start',width:8192,height:2048};
    const start=performance.now(); const output=await core.captureUrl(options,[],{browser,...network('large'),responseBody:bytes=>Buffer.from(bytes)}); const coreMs=Math.round(performance.now()-start);
    const cliStart=performance.now(),path=join(directory,'capture.png');
    const cli=spawnSync(process.execPath,['--import',fileURLToPath(new URL('./fixtures/cli-network.mjs',import.meta.url)),fileURLToPath(new URL('../scripts/render.js',import.meta.url)),'url','--url',options.url,'--output',path,'--width','8192','--height','2048'],{encoding:'utf8',timeout:65000,env:{...process.env,RENDER_NETWORK:'large',npm_config_offline:'true'}});
    if(cli.status!==0)throw new Error(cli.stderr);
    console.log(JSON.stringify({case:'8 MiB screened synthetic page, 16777216 pixels',coreMs,cliMs:Math.round(performance.now()-cliStart),outputBytes:output.files[0].bytes.length,identical:Buffer.from(output.files[0].bytes).equals(readFileSync(path))}));
  }
  for(const [method,file,options] of [['renderSvg','picture.svg',{}],['renderMermaid','graph.mmd',{scale:1}]]){
    start=performance.now();const output=await core[method](options,[{name:file,bytes:new Uint8Array(readFileSync(new URL('./fixtures/shared/'+file,import.meta.url)))}],{browser,mermaidScript:new Uint8Array(readFileSync(new URL('../node_modules/mermaid/dist/mermaid.min.js',import.meta.url)))});
    console.log(JSON.stringify({case:method,coreMs:Math.round(performance.now()-start),outputBytes:output.files[0].bytes.length}));
  }
}finally{await browser.close();rmSync(directory,{recursive:true,force:true});}
