import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {launch} from '../../lib/browser-runtime/browser-runtime.js';
import {composePage} from '../scripts/page.js';
import {FONT_HOSTS} from '../scripts/format.js';
import {PUBLIC_FONT_FILES} from '../engine/boards-lib.js';
const options={bundle:true,format:'iife',target:'es2022',minify:true,write:false,legalComments:'none'};
export async function browserKit({nativeScrollbars=false}={}) {
 const [chat,host]=await Promise.all([build({...options,entryPoints:[fileURLToPath(new URL('../engine/chat.js',import.meta.url))]}),build({...options,entryPoints:[fileURLToPath(new URL('./host-harness.js',import.meta.url))]})]);
 const html=composePage({script:chat.outputFiles[0].text}),browser=await launch({headless:true,timeout:30000,...(nativeScrollbars?{ignoreDefaultArgs:['--hide-scrollbars']}:{})});
 const parts=JSON.parse(readFileSync(new URL('../../../skills/Build Brand/parts/parts.json',import.meta.url)));
 const fonts=new Map();for(const [family,files]of Object.entries(PUBLIC_FONT_FILES))for(const f of files){
  const weight=Array.isArray(f.weight)?f.weight[0]:f.weight;
  const local=parts.fonts[family].files.find(x=>{const r=Array.isArray(x.weight)?x.weight:[x.weight,x.weight];return r[0]<=weight&&r[1]>=weight;})??parts.fonts[family].files[0];
  fonts.set(f.url,new URL('../../../skills/Build Brand/parts/'+local.path,import.meta.url));
 }
 return {browser,html,pageBytes:Buffer.byteLength(html),async open(form,width=734,theme='light',{failFonts=false,touch=false,containerDimensions,name='chatgpt',autoSize=false}={}){
  const context=await browser.newContext({viewport:{width,height:900},screen:{width,height:900},colorScheme:theme,hasTouch:touch}),requests=[],errors=[];
  await context.route('**/*',async route=>{const url=route.request().url();requests.push(url);if(fonts.has(url)&&!failFonts)await route.fulfill({body:readFileSync(fonts.get(url)),contentType:'font/woff2',headers:{'access-control-allow-origin':'*'}});else await route.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(`<!DOCTYPE html><body style="margin:0"><script>${host.outputFiles[0].text}</script>`);
  await page.evaluate(([html,form,theme,containerDimensions,name,autoSize])=>window.startHost(html,{form},{},{theme,containerDimensions,name,autoSize}),[html,form,theme,containerDimensions,name,autoSize]);
  const frame=page.frames()[1],f=page.frameLocator('iframe');await f.locator('#form').waitFor();await frame.evaluate(()=>document.fonts.ready);
  return {context,page,frame,f,requests,errors};
 }};
}
export function onlyFonts(requests){return requests.every(url=>FONT_HOSTS.includes(new URL(url).origin)&&Object.values(PUBLIC_FONT_FILES).flat().some(f=>f.url===url));}
