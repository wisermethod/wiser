#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { sequence } from './sequence.mjs';
import { prepareRuntime } from './dependencies.mjs';

const VALUE_FLAGS = new Set(['--project', '--output', '--width', '--height', '--fps', '--duration', '--workers', '--gpu', '--capture']);
const INSTALL_HELP = `  --install                Authorise packages and the pinned Chrome, then finish this run.
                           WISER_ALLOW_INSTALL=1 also authorises work commands.
  --help                   Show help before checking dependencies.`;

export const HELP = `video-render - render one local project to a numbered PNG sequence

Usage:
  node scripts/video-render.mjs help [sequence|check]
  node scripts/video-render.mjs sequence --project <abs dir> --output <abs dir>
    --width N --height N --fps N --duration S [--workers N|auto]
    [--gpu hardware|software] [--capture screenshot|fast] [--install]
  node scripts/video-render.mjs check [--install]

Options:
  --project <abs dir>       Required. Directory containing index.html and local assets.
  --output <abs dir>        Required. New directory outside this tool and the project.
  --width N                Required. Frame width in pixels, a positive integer.
  --height N               Required. Frame height in pixels, a positive integer.
  --fps N                  Required. Positive frame rate in frames per second.
  --duration S             Required. Positive duration in seconds.
  --workers N|auto         Positive integer or auto (default: auto).
  --gpu hardware|software  Browser GPU mode (default: hardware).
  --capture screenshot|fast Capture mode (default: screenshot).
${INSTALL_HELP}

Exactly one data-video-root element is required. All assets must be local.
Requires Node >=22 (node --version), FFmpeg (ffmpeg -version), HyperFrames 0.8.134
and chrome-headless-shell 152.0.7977.30. System dependencies are never installed.
check surveys without fetching or retaining files; --install permits installation.
Success prints one JSON object; failure prints to stderr and exits 1.
check exits 0 either way; read ready in its JSON result.
help installs nothing and refuses --install. Each command accepts help and --help.
`;

export const CHECK_HELP = `video-render check - survey this machine and this tool's pinned runtime

Usage:
  node scripts/video-render.mjs check [--install]
  node scripts/video-render.mjs check help

Options:
${INSTALL_HELP}

Reports Node's version and whether it is >=22, FFmpeg's version line and presence,
HyperFrames' installed version and whether it is exactly 0.8.134, and Chrome's
actual build and headless launch result. ready is true only when all four hold.
Without --install it ignores install consent, fetches nothing and retains no files.
A Chrome trial uses a temporary profile and removes it before returning.
With --install it may install packages and Chrome, then reports in the same run.
Always prints one JSON object and exits 0; read ready, not the exit code.
`;

export function parseArguments(argv) {
  let command = argv[0] ?? 'help';
  if (command === '--help') command = 'help';
  if (!['help', 'sequence', 'check'].includes(command)) throw new Error(`Unknown ${command.startsWith('-') ? 'flag' : 'command'} ${command}; see video-render.mjs help.`);
  const options = {};
  let help = command === 'help';
  const seen = new Set();
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === 'help' || flag === '--help') { help = true; continue; }
    if (command === 'help' && ['sequence', 'check'].includes(flag)) { command = flag; continue; }
    if (flag !== '--install' && !(command === 'sequence' && VALUE_FLAGS.has(flag))) throw new Error(`Unknown flag ${flag}; see video-render.mjs help.`);
    if (seen.has(flag)) throw new Error(`Duplicate flag ${flag}; pass it once. See video-render.mjs help.`);
    seen.add(flag);
    if (flag === '--install') continue;
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) {
      if (value?.startsWith('--') && !VALUE_FLAGS.has(value) && !['--help', '--install'].includes(value)) throw new Error(`Unknown flag ${value}; see video-render.mjs help.`);
      throw new Error(`${flag} needs a value; see video-render.mjs help.`);
    }
    options[flag.slice(2)] = value;
  }
  if (help && seen.has('--install')) throw new Error('Unknown flag --install for help: help installs nothing; see video-render.mjs help.');
  return { command, options, help };
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const parsed = parseArguments(argv);
    if (parsed.help) { process.stdout.write(parsed.command === 'check' ? CHECK_HELP : HELP); return; }
    const { parsedInstallFlag } = await import('../../lib/consent.js');
    const install = parsedInstallFlag(argv, VALUE_FLAGS);
    const result = parsed.command === 'check' ? await prepareRuntime({ install, survey: true })
      : await sequence(parsed.options, { install });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`video-render: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await main();
