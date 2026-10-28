#!/usr/bin/env node
// See standards/script-contract.md and tools/RUNNING.md. ask delegates its window to Browser Control.
import { openSync,readSync,closeSync,realpathSync,statSync } from 'node:fs';
import { isAbsolute,resolve,basename,dirname,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FORM_LIMITS,FONT_HOSTS,SAMPLE_FORM,checkForm,checkTemplate,fillTemplate,formJsonSchema } from './format.js';
export const HELP = `Usage: node scripts/form.js <command> [flags]
  help | --help                       Print usage, nothing installed
  check --form <absolute file>         Check a form or a template; exit 0 either way
  fill --template <absolute file> --values <absolute file>
                                      Fill a template; refusal exits 1
  schema                              Print {schema,limits,fontHosts}
  sample                              Print {form}
  serve (--form <absolute file> | --sample) [--ttl <seconds>]
                                      Serve on this computer; never opens a window
  ask (--form <absolute file> | --sample) [--ttl <seconds>] [--seconds <1..3600>]
      [--install] [--headless]         Show a window and wait (default 900 seconds)
                                      --headless is for checks; members get a visible window
  wait --port <n> --code <code> [--seconds <n>]
                                      Wait for answers (default 50 seconds)
  stop --port <n> --code <code>         Stop this form's listener
Flags: --help, --form <file>, --template <file>, --values <file>, --sample,
       --ttl <1..86400> (default 1800), --port <1..65535>,
       --code <32 lowercase hex characters>,
       --seconds <n> (ask: 1..3600, default 900; wait: 0..3600, default 50),
       --install (ask only: authorise Browser Control's install),
       Wiser asks once per person; a yes covers this install and later installs by any Wiser tool in any copy.
       --headless (ask only: checks without a window; members get a visible window).
Only ask starts Browser Control and creates a temporary profile, removed at the end.
Input files must be JSON, at most 262144 bytes. All paths must be absolute.
`;
const fail = cause => { throw new Error(`${cause} See node scripts/form.js help.`); };
function readJson(path,flag) {
  if (!isAbsolute(path)) fail(`${flag}: absolute path required: ${path}.`);
  let canonical;
  try {
    let parent = path; const tail = [];
    while (true) {
      try { canonical = join(realpathSync(parent),...tail.reverse()); break; }
      catch (e) { if (e.code !== 'ENOENT') throw e; const next = dirname(parent); if (next === parent) throw e; tail.push(basename(parent)); parent = next; }
    }
    if (canonical.split(/[\\/]/).includes('memory') || /^\.env(?:\.|$)/i.test(basename(canonical))) fail(`${flag}: refused private input path.`);
    if (!statSync(canonical).isFile()) fail(`${flag}: not a file: ${path}.`);
    if (statSync(canonical).size > FORM_LIMITS.inputFileBytesMax) fail(`${flag}: file exceeds 262144 bytes: ${path}.`);
    const fd = openSync(canonical,'r');
    let text;
    try { const buffer = Buffer.alloc(FORM_LIMITS.inputFileBytesMax+1); let n = 0, count; while (n < buffer.length && (count = readSync(fd,buffer,n,buffer.length-n,n)) > 0) n += count; if (n > FORM_LIMITS.inputFileBytesMax) fail(`${flag}: file exceeds 262144 bytes: ${path}.`); text = buffer.subarray(0,n).toString('utf8'); }
    finally { closeSync(fd); }
    try { return JSON.parse(text); } catch { fail(`${flag}: not JSON: ${path}.`); }
  } catch (e) {
    if (e.code === 'ENOENT') fail(`${flag}: missing file: ${path}.`);
    if (e.code) fail(`${flag}: cannot read file (${e.code}): ${path}.`);
    throw e;
  }
}
export function run(args) {
  const flags = {}, positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('-')) {
      if (!['--help','--form','--template','--values','--sample','--ttl','--port','--code','--seconds','--install','--headless'].includes(a)) fail(`Unknown flag: ${a}.`);
      if (Object.hasOwn(flags,a)) fail(`Repeated flag: ${a}.`);
      if (['--help','--sample','--install','--headless'].includes(a)) flags[a] = true;
      else { if (!args[i+1] || args[i+1].startsWith('-')) fail(`${a} needs a value.`); flags[a] = args[++i]; }
    } else positionals.push(a);
  }
  const command = positionals[0] ?? 'help';
  if (positionals.length > 1) fail(`Unexpected argument: ${positionals[1]}.`);
  if (!['help','check','fill','schema','sample','serve','ask','wait','stop'].includes(command)) fail(`Unknown command: ${command}.`);
  const allowed = {check:['--form'],fill:['--template','--values'],serve:['--form','--sample','--ttl'],ask:['--form','--sample','--ttl','--seconds','--install','--headless'],wait:['--port','--code','--seconds'],stop:['--port','--code']}[command] ?? [];
  for (const flag of Object.keys(flags)) if (flag !== '--help' && !allowed.includes(flag)) fail(`Flag ${flag} is not used by ${command}.`);
  if (command === 'help' || flags['--help']) return HELP;
  const number = (flag,fallback,min,max) => {
    const raw = flags[flag] ?? String(fallback ?? '');
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) fail(`${flag} must be a whole number from ${min} to ${max}.`);
    return value;
  };
  if (command === 'serve' || command === 'ask') {
    if (Boolean(flags['--form']) === Boolean(flags['--sample'])) fail(`${command} requires exactly one of --form or --sample.`);
    const ttl = number('--ttl',1800,1,86400);
    const seconds = command === 'ask' ? number('--seconds',900,1,3600) : undefined;
    const form = flags['--sample'] ? SAMPLE_FORM : readJson(flags['--form'],'--form');
    const checked = checkForm(form);
    if (!checked.ok) fail(checked.problems.map(p => `${p.path || '(form)'}: ${p.message}`).join('\n'));
    if (Object.hasOwn(process.env,'SSH_CONNECTION') || Object.hasOwn(process.env,'SSH_TTY')) return {status:'no-window',reason:'An SSH session cannot show a window on this computer.'};
    if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return {status:'no-window',reason:'Neither DISPLAY nor WAYLAND_DISPLAY is set on this computer.'};
    if (command === 'ask') return import('./ask.js').then(({ask}) => ask(form,{ttl,seconds,install:Boolean(flags['--install']),headless:Boolean(flags['--headless'])}));
    return import('./local.js').then(({serve}) => serve(form,ttl));
  }
  if (command === 'wait' || command === 'stop') {
    const port = number('--port',undefined,1,65535), code = flags['--code'];
    if (!/^[a-f0-9]{32}$/.test(code ?? '')) fail('--code must be 32 lowercase hex characters.');
    const seconds = command === 'wait' ? number('--seconds',50,0,3600) : 0;
    return import('./local.js').then(({localRequest}) => localRequest({port,code},command === 'wait' ? `result?wait=${seconds}` : 'stop',command === 'wait' ? 'GET' : 'POST',(seconds+5)*1000));
  }
  for (const flag of allowed) if (!flags[flag]) fail(`Missing required flag: ${flag}.`);
  if (command === 'sample') return {form:SAMPLE_FORM};
  if (command === 'schema') return {schema:formJsonSchema(),limits:FORM_LIMITS,fontHosts:FONT_HOSTS};
  if (command === 'check') {
    const form = readJson(flags['--form'],'--form');
    const kind = form && typeof form === 'object' && Object.hasOwn(form,'slots') ? 'template' : 'form';
    return {...(kind === 'template' ? checkTemplate(form) : checkForm(form)),kind};
  }
  const result = fillTemplate(readJson(flags['--template'],'--template'),readJson(flags['--values'],'--values'));
  if (!result.ok) fail(result.problems.map(p => `${p.path || '(form)'}: ${p.message}`).join('\n'));
  return result;
}
export async function main(args = process.argv.slice(2)) {
  try { const result = await run(args); process.stdout.write(typeof result === 'string' ? result : `${JSON.stringify(result)}\n`); return 0; }
  catch (error) { process.stderr.write(`${error.message}\n`); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) process.exitCode = await main();
