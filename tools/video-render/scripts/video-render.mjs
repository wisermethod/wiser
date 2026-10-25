#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { sequence } from './sequence.mjs';

export const HELP = `video-render - render one local project to a numbered PNG sequence

Usage:
  node scripts/video-render.mjs help
  node scripts/video-render.mjs sequence --project <abs dir> --output <abs dir>
    --width N --height N --fps N --duration S [--workers N|auto]
    [--gpu hardware|software] [--capture screenshot|fast]

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
  --help                   Show this help before checking dependencies.

Exactly one data-video-root element is required. All assets must be local.
Requires Node >=22, HyperFrames 0.8.134 and cached chrome-headless-shell 152.0.7977.30.
Installs nothing. Success prints one JSON object; failure prints to stderr and exits 1.
`;

export function parseArguments(argv) {
  if (!argv.length || argv[0] === 'help' || argv.includes('--help') || argv[1] === 'help') return null;
  if (argv[0] !== 'sequence') throw new Error(`Unknown command ${argv[0]}; see video-render.mjs help.`);
  const allowed = new Set(['--project', '--output', '--width', '--height', '--fps', '--duration', '--workers', '--gpu', '--capture']);
  const options = {};
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    if (!allowed.has(flag)) throw new Error(`Unknown flag ${flag}; see video-render.mjs help.`);
    const name = flag.slice(2);
    if (Object.hasOwn(options, name)) throw new Error(`Duplicate flag ${flag}; pass it once. See video-render.mjs help.`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) {
      if (value?.startsWith('--') && !allowed.has(value)) throw new Error(`Unknown flag ${value}; see video-render.mjs help.`);
      throw new Error(`${flag} needs a value; see video-render.mjs help.`);
    }
    options[name] = value;
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv);
    if (options === null) { process.stdout.write(HELP); return; }
    process.stdout.write(`${JSON.stringify(await sequence(options))}\n`);
  } catch (error) {
    process.stderr.write(`video-render: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await main();
