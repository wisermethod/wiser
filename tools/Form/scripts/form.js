#!/usr/bin/env node
// See standards/script-contract.md and tools/RUNNING.md. No packages, writes or installs.
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
Flags: --help, --form <file>, --template <file>, --values <file>.
No --install: this command installs nothing and writes nothing.
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
      if (!['--help','--form','--template','--values'].includes(a)) fail(`Unknown flag: ${a}.`);
      if (Object.hasOwn(flags,a)) fail(`Repeated flag: ${a}.`);
      if (a === '--help') flags[a] = true;
      else { if (!args[i+1] || args[i+1].startsWith('-')) fail(`${a} needs a file.`); flags[a] = args[++i]; }
    } else positionals.push(a);
  }
  const command = positionals[0] ?? 'help';
  if (positionals.length > 1) fail(`Unexpected argument: ${positionals[1]}.`);
  if (!['help','check','fill','schema','sample'].includes(command)) fail(`Unknown command: ${command}.`);
  const allowed = command === 'check' ? ['--form'] : command === 'fill' ? ['--template','--values'] : [];
  for (const flag of Object.keys(flags)) if (flag !== '--help' && !allowed.includes(flag)) fail(`Flag ${flag} is not used by ${command}.`);
  if (command === 'help' || flags['--help']) return HELP;
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
export function main(args = process.argv.slice(2)) {
  try { const result = run(args); process.stdout.write(typeof result === 'string' ? result : `${JSON.stringify(result)}\n`); return 0; }
  catch (error) { process.stderr.write(`${error.message}\n`); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) process.exitCode = main();
