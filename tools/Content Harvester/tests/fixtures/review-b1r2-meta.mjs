import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { harvest } from '../../scripts/harvest-core.js';

const html = '<meta ' + 'property="og:title" '.repeat(52000) + (workerData.complete ? '>' : '');
if (new TextEncoder().encode(html).length >= 1048576) throw Error('fixture must stay under 1 MiB');
const request = {name:'metadata deadline',consumer:'tests',timebox:{from:'2026-01-01',to:'2026-12-31'},topics:[],sources:[{type:'url',url:'https://feed.test/article'}]};
let ticks = 0;
try {
  await harvest({command:'run',request},[],async () => new Response(html),async () => ['93.184.216.34'], {
    // A closed tag gets past the first scan and expires inside its attributes.
    clock:() => ticks++ * (workerData.complete ? 20 : 200),
    hashId:value => createHash('sha256').update(value).digest('hex').slice(0,16)
  });
  parentPort.postMessage({message:'metadata unexpectedly completed',ticks});
} catch (error) { parentPort.postMessage({message:error.message,fatal:error.fatal,ticks}); }
