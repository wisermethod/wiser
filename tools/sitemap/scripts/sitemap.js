#!/usr/bin/env node
/**
 * sitemap - a snapshot of the URLs a site publishes, and a diff of two snapshots
 *
 * Usage:
 *   node scripts/sitemap.js help
 *   node scripts/sitemap.js fetch --domain <host> [options]
 *   node scripts/sitemap.js fetch --url <sitemap url> [--url ...] [options]
 *   node scripts/sitemap.js fetch --file <path> [--file ...] [options]
 *   node scripts/sitemap.js diff --previous <path> --current <path> [--output <path>] [--pretty]
 *
 * Node built-ins, this tool's own files, and tools/lib/. fetch checks for
 * undici; diff does not. The rules every shipped script follows are stated
 * once, in system/templates/Script Contract.md.
 */

const SUBCOMMANDS = new Set(['fetch', 'diff']);
const DEFAULT_MAX_URLS = 50000;

const USAGE = `sitemap - a snapshot of the URLs a site publishes, and a diff of two snapshots

Usage:
  node scripts/sitemap.js help
  node scripts/sitemap.js fetch --domain <host> [options]
  node scripts/sitemap.js fetch --url <sitemap url> [--url ...] [options]
  node scripts/sitemap.js fetch --file <path> [--file ...] [options]
  node scripts/sitemap.js diff --previous <path> --current <path> [--output <path>] [--pretty]

Commands:
  fetch            Collect the site's sitemaps into one snapshot object
  diff             Compare two snapshots and report added URLs, removed URLs,
                   lastmod changes, and path segments that are new
  help             Print this message

Run "node scripts/sitemap.js <command> help" for that command's options.

  --install   Authorise the first install in this copy of the plugin.
              Without it, the first command that needs a package this
              copy has not installed reports what it would fetch, and
              from where, and stops. That answer covers every later
              tool in this copy. WISER_ALLOW_INSTALL=1 does the same
              for an unattended run.
  --help, -h       Print this message

fetch writes a snapshot file only when --output names a directory. diff writes
the report only when --output names a file. Needs no credentials and no
configuration file, so no command takes --env. Success prints one JSON object
to stdout; a usage mistake goes to stderr with exit 1.`;

const FETCH_USAGE = `sitemap fetch - a deterministic snapshot of the URLs a site publishes in its sitemaps

Usage:
  node scripts/sitemap.js fetch help
  node scripts/sitemap.js fetch --domain <host> [options]
  node scripts/sitemap.js fetch --url <sitemap url> [--url ...] [options]
  node scripts/sitemap.js fetch --file <path> [--file ...] [options]

Commands:
  fetch            Collect the site's sitemaps into one snapshot object
  help             Print this message

Options:
  --domain <host>  Discover sitemaps from the host's robots.txt, then from
                   /sitemap.xml and /sitemap_index.xml
  --url <url>      An http or https sitemap or sitemap-index URL. Repeatable.
                   Given, it replaces discovery
  --file <path>    A local sitemap or sitemap-index XML file, absolute path.
                   Repeatable. Offline mode: no network. Mutually exclusive
                   with --domain and --url
  --max <n>        Stop after this many URLs and set "truncated" (default ${DEFAULT_MAX_URLS})
  --date <date>    YYYY-MM-DD stamped as "fetchedAt" (default: today)
  --output <dir>   Also write the snapshot to a file in this directory, an
                   absolute path that must sit outside this tool directory
  --install Authorise the first install in this copy of the plugin.
          Without it, the first command that needs a package this
          copy has not installed reports what it would fetch, and
          from where, and stops. That answer covers every later
          tool in this copy. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help           Print this message

Success prints one JSON object to stdout. Errors go to stderr with exit 1.`;

const DIFF_USAGE = `sitemap diff - what changed between two sitemap snapshots of one site

Usage:
  node scripts/sitemap.js diff help
  node scripts/sitemap.js diff --previous <path> --current <path> [--output <path>] [--pretty]

Commands:
  diff              Compare two snapshots and report added URLs, removed URLs,
                    lastmod changes, and path segments that are new
  help              Print this message

Options:
  --previous <path> The earlier snapshot, an absolute path. Required
  --current <path>  The later snapshot, an absolute path. Required
  --output <path>   Also write the result to this file, an absolute path
                    outside this tool directory
  --pretty          Indent the JSON
  --help, -h        Print this message

Each snapshot is a JSON object carrying a urls array whose entries each have a
loc string, and optionally lastmod and segment. Reads the two files named and
nothing else: no network call, no credential, no configuration file.

Success prints one JSON object to stdout. Errors go to stderr with exit 1.`;

const SUB_USAGE = {
  fetch: FETCH_USAGE,
  diff: DIFF_USAGE,
};

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || command === '--help' || command === '-h') {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!SUBCOMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/sitemap.js help" for usage.`);
}

if (argv[1] === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${SUB_USAGE[command]}\n`);
  process.exit(0);
}

if (command === 'fetch') {
  const { runFetch } = await import('./fetch-core.js');
  await runFetch(argv);
} else if (command === 'diff') {
  const { runDiff } = await import('./diff-core.js');
  runDiff(argv);
}
