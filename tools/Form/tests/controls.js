// Deliberately break a temporary copy, run the real guard tests, restore it and run again.
// The maintained tool is never edited by this proof.
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const source = new URL('../',import.meta.url);
const guardTests = fileURLToPath(new URL('./listener-guards.test.js',import.meta.url));
const directory = await mkdtemp(join(tmpdir(),'wiser-form-controls-'));
const cases = [
  ['Host','guard Host',text => text.replace('if (req.headers.host !== `127.0.0.1:${port}`)','if (false)')],
  ['once','guard once',text => text.replace("if (result) { json(res,409,","if (false) { json(res,409,").replace("if (result) return json(res,409,","if (false) return json(res,409,")],
  ['closing','guard closing',text => text.replace('Math.max(0,closes-Date.now())','Math.max(0,closes-Date.now())+60000')]
];
function run(pattern) {
  return new Promise((accept,reject) => {
    const child = spawn(process.execPath,['--test',`--test-name-pattern=${pattern}`,guardTests],{
      env:{...process.env,WISER_FORM_TEST_SCRIPT:join(directory,'scripts/form.js')},stdio:['ignore','pipe','pipe']
    });
    let output = '';
    child.stdout.on('data',chunk => { output += chunk; }); child.stderr.on('data',chunk => { output += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'),60000);
    child.on('error',reject); child.on('close',code => { clearTimeout(timer); accept({code,output}); });
  });
}
let passes = 0;
try {
  for (const name of ['scripts','engine']) await cp(new URL(name,source),join(directory,name),{recursive:true});
  await writeFile(join(directory,'package.json'),'{"type":"module"}\n');
  const listener = join(directory,'scripts/listener.js'),original = await readFile(listener,'utf8');
  for (const [name,pattern,mutate] of cases) {
    const changed = mutate(original); assert.notEqual(changed,original,'control must mutate code');
    let broken;
    try { await writeFile(listener,changed); broken = await run(pattern); }
    finally { await writeFile(listener,original); }
    const restored = await run(pattern);
    // Print the actual failing assertion and location, never fixture data.
    console.log(`${name}: broken run`);
    console.log(broken.output);
    console.log(`${name}: restored run`);
    console.log(restored.output);
    assert.equal(broken.code,1,`${name}: broken guard must fail`);
    assert.equal(restored.code,0,`${name}: restored guard must pass`);
    console.log(`PASS ${name}: deliberate defect detected, restored passes`);
    passes++;
  }
  assert.equal(await readFile(listener,'utf8'),original,'temporary source restored byte for byte');
} finally { await rm(directory,{recursive:true,force:true}); }
console.log(`Controls: ${cases.length} tests, ${passes} passes, ${cases.length-passes} failures, 0 skips`);
