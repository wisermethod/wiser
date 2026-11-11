import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { toolCopy, PROXIES } from '../../lib/tests/carried-copy.js';
import { mainCli } from '../../lib/tests/main-cli.js';
import { spawnSync } from 'node:child_process';
const fake = `import dns from 'node:dns';
dns.promises.lookup = async () => [{address:'93.184.216.34',family:4}];
globalThis.fetch = async () => { const response = new Response('<script src="https://www.clarity.ms/tag/abc123"></script>'); Object.defineProperty(response,'url',{value:'https://page.test/'}); return response; };\n`;
function adapter(f) { const file = join(f.root,'network.mjs'); writeFileSync(file,fake); return file; }

test('audit without proxy packages, consent probes or npm returns the served tag report', t => {
  const f = toolCopy(t,'tag-audit'), network = adapter(f);
  for (const value of [undefined, ' \t ']) {
    const environment = { ...f.isolatedEnv };
    if (value) for (const key of PROXIES) environment[key] = value;
    const out = f.run(['audit','--url','https://page.test/'], { imports: [f.preload,network], environment });
    assert.equal(out.status,0,out.stderr); assert.equal(out.stderr,'');
    const report = JSON.parse(out.stdout);
    assert.equal(report.method,'served-html'); assert.equal(report.tags.clarity.id,'abc123');
    assert.equal(report.tags.clarity.present,true);
  }
});
for (const key of PROXIES) test(`proxied audit with ${key} retains its original full install question`, t => {
  const f = toolCopy(t,'tag-audit'), network = adapter(f), baseline = mainCli(t,'tag-audit');
  // The baseline helper links installed packages for compatibility tests. Remove
  // only that link so both missing-package runs ask the same question.
  // A copied baseline is private test output, never the source package tree.
  rmSync(join(dirname(dirname(baseline)), 'node_modules'), { recursive: true, force: true });
  const environment = { ...f.isolatedEnv, [key]: ' http://proxy.test:8080 ' };
  const args = ['audit','--url','https://page.test/'];
  const before = spawnSync(process.execPath,['--import',network,baseline,...args], { env: environment, encoding:'utf8',timeout:15000 });
  const after = f.run(args,{ imports:[network],environment });
  assert.equal(before.status,1,before.stderr); assert.equal(after.status,1,after.stderr); assert.equal(after.stdout,'');
  assert.equal(after.stderr,before.stderr.replaceAll(dirname(dirname(baseline)),f.tool));
  assert.match(after.stderr,/^This Wiser skill needs to download and install/);
});

for (const blankHigher of [false, true]) test(`proxy dispatcher is installed before fetch (blank higher=${blankHigher})`, t => {
  const f = toolCopy(t,'tag-audit');
  const pkg = join(f.tool,'node_modules/undici');
  mkdirSync(pkg,{recursive:true});
  writeFileSync(join(pkg,'package.json'),JSON.stringify({type:'module',main:'index.js'}));
  writeFileSync(join(pkg,'index.js'),`export class ProxyAgent { constructor(url) { this.url=url; } }
export function setGlobalDispatcher(agent) { globalThis.selectedProxy=agent.url; }`);
  const network = join(f.root,'proxy-network.mjs');
  writeFileSync(network, fake.replace('globalThis.fetch = async () => {', `globalThis.fetch = async () => { if(globalThis.selectedProxy !== 'http://proxy.test:8080') throw new Error('proxy dispatcher was not set');`));
  const environment = {...f.isolatedEnv,http_proxy:' http://proxy.test:8080 ', ...(blankHigher?{HTTPS_PROXY:' \t '}:{}), NO_PROXY:'*',no_proxy:'*'};
  let out;
  try { out = f.run(['audit','--url','https://page.test/'],{imports:[network],environment}); }
  finally { rmSync(join(f.tool,'node_modules'),{recursive:true,force:true}); }
  assert.equal(out.status,0,out.stderr);
  assert.equal(JSON.parse(out.stdout).tags.clarity.id,'abc123');
});
