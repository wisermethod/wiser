import { readFileSync } from 'node:fs';
import { writeZip } from '../../../lib/archive-core.js';
import { revealAssets } from '../../scripts/package-assets.js';
export async function upload(c) {
  if (c.file?.endsWith('.zip')) return {name:c.file,mediaType:'application/zip',bytes:new Uint8Array(readFileSync(new URL('./shared/'+c.file,import.meta.url)))};
  if (c.oversize) return { name:'deck.zip',mediaType:'application/zip',bytes:new Uint8Array(8388609) };
  const assets = revealAssets();
  let html = readFileSync(new URL('./shared/'+(c.file || 'deck.html'), import.meta.url),'utf8');
  if (c.slides) html = html.replace(/<div class="slides">[\s\S]*<\/div><\/div><script/, '<div class="slides">'+Array.from({length:c.slides},(_,i)=>`<section><h1>Conclusion ${i+1}</h1></section>`).join('')+'</div></div><script');
  if (c.noise) {
    html = html.replace('width:320,height:180','width:1500,height:1500');
    const canvas = '<canvas width="1500" height="1500"></canvas>';
    html = html.replace('<h1>First conclusion</h1>',canvas).replace('</body>', `<script>const ctx=document.querySelector('canvas').getContext('2d'),data=ctx.createImageData(1500,1500);let seed=12345;for(let i=0;i<data.data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data.data[i]=i%4===3?255:seed>>>24}ctx.putImageData(data,0,0)</script></body>`);
  }
  const files=[...(c.input?.entry ? [{name:'other.html',bytes:new TextEncoder().encode('<html></html>')}] : []),{name:c.input?.entry || 'deck.html',bytes:new TextEncoder().encode(html)},...Object.entries(assets).map(([name,bytes])=>({name:'Deck Assets/'+name,bytes:c.replaceRuntime&&name==='reveal.js'?new TextEncoder().encode('throw new Error("uploaded runtime should not run")'):bytes}))];
  return { name:'deck.zip',mediaType:'application/zip',bytes:await writeZip(files,{maxBytes:8388608}) };
}
