#!/usr/bin/env node
/**
 * seo-data - an audit dataset from Search Console and Analytics rows,
 * and a keyword report from Search Console query rows
 *
 * Usage:
 *   node scripts/seo-data.js help
 *   node scripts/seo-data.js audit --input <path>
 *   node scripts/seo-data.js keywords --queries <path> --start <YYYY-MM-DD> --end <YYYY-MM-DD>
 *   node scripts/seo-data.js previous-window --start <YYYY-MM-DD> --end <YYYY-MM-DD>
 *
 * Node built-ins only; nothing here imports a package or reaches outside this
 * tool directory. No command checks for or installs a dependency. The rules
 * every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

const SUBCOMMANDS = new Set(['audit', 'keywords', 'previous-window']);

const USAGE = `seo-data - an audit dataset from Search Console and Analytics rows, and a keyword report from Search Console query rows

Usage:
  node scripts/seo-data.js help
  node scripts/seo-data.js audit --input <path>
  node scripts/seo-data.js keywords --queries <path> --start <YYYY-MM-DD> --end <YYYY-MM-DD>
    [--query-pages <path>] [--previous-queries <path>] [--targets <path>]
    [--min-impressions <n>] [--site <url>] [--output <dir>]
  node scripts/seo-data.js previous-window --start <YYYY-MM-DD> --end <YYYY-MM-DD>
    [--output <dir>]

Commands:
  audit            Read the input bundle and print the audit dataset
  keywords         Build the keyword report from the row files supplied
  previous-window  Print the earlier window the trend comparison expects
  help             Print this message

Run "node scripts/seo-data.js <command> help" for that command's options.

  --help, -h       Print this message

Reads only the files the caller names. keywords and previous-window write a file
only when --output names a directory. Needs no credentials and no configuration
file, so no command takes --env. No package is installed. Success prints one JSON
object to stdout; a usage mistake or an unreadable file goes to stderr with exit 1.`;

const AUDIT_USAGE = `seo-data audit - consolidate Search Console and Analytics results into one audit dataset

Usage:
  node scripts/seo-data.js audit help
  node scripts/seo-data.js audit --input <path>

Commands:
  audit            Read the input bundle and print the audit dataset
  help             Print this message

Options:
  --input <path>   Audit input bundle, a JSON file (absolute path), outside
                   this tool directory. Required.
  --help, -h       Print this message

The bundle carries results the caller already fetched: site, dateRange,
searchConsole.topQueries, searchConsole.topPages, searchConsole.sitemaps,
analytics.trafficOverview, analytics.acquisitionChannels, analytics.topPages,
analytics.organicTraffic, and an optional targetKeywords list. Each analytics
section is passed through as the reporting API returned it, headers included;
TOOL.md names the metric and dimension each one must carry.

Reads one file the caller names and writes nothing. Fetches nothing: it makes no
network call and holds no credential, so no command takes --env. Success prints
one JSON object to stdout; a bad option or an input the contract does not accept
goes to stderr with exit 1.`;

const KEYWORDS_USAGE = `seo-data keywords - turn Search Console query rows into a keyword report

Usage:
  node scripts/seo-data.js keywords help
  node scripts/seo-data.js keywords --queries <path> --start <YYYY-MM-DD> --end <YYYY-MM-DD>
    [--query-pages <path>] [--previous-queries <path>] [--targets <path>]
    [--min-impressions <n>] [--site <url>] [--output <dir>]

Commands:
  keywords         Build the keyword report from the row files supplied
  help             Print this message

Options:
  --queries <path>            Search Console rows for the reporting window,
                              one "query" dimension. Required.
  --query-pages <path>        Rows for the same window with the "query" and
                              "page" dimensions. Feeds cannibalization and the
                              page column of target tracking.
  --previous-queries <path>   Rows with one "query" dimension for the earlier
                              window. Feeds the growing and declining sections.
  --targets <path>            Target keywords, one per line. Feeds target tracking.
  --start <YYYY-MM-DD>        First day of the reporting window. Required.
  --end <YYYY-MM-DD>          Last day of the reporting window. Required.
  --min-impressions <n>       Drop rows below this many impressions before
                              ranking. Default 10.
  --site <url>                Label echoed into the report. Not used in any
                              computation.
  --output <dir>              Also write the result to a file in this directory,
                              an absolute path that must sit outside this tool
                              directory.
  --help, -h                  Print this message

A section whose input was not supplied comes back null, never as an empty list.

Reads only the files the caller names and writes nothing else. Needs no
credentials and no configuration file, so no command takes --env, and no run
opens a network connection. Success prints one JSON object to stdout; a usage
mistake or an unreadable file goes to stderr with exit 1.`;

const PREVIOUS_WINDOW_USAGE = `seo-data previous-window - print the earlier window the trend comparison expects

Usage:
  node scripts/seo-data.js previous-window help
  node scripts/seo-data.js previous-window --start <YYYY-MM-DD> --end <YYYY-MM-DD>
    [--output <dir>]

Commands:
  previous-window  Print the earlier window the trend comparison expects
  help             Print this message

Options:
  --start <YYYY-MM-DD>        First day of the reporting window. Required.
  --end <YYYY-MM-DD>          Last day of the reporting window. Required.
  --queries <path>            Accepted; unused. Same flag set as keywords.
  --query-pages <path>        Accepted; unused. Same flag set as keywords.
  --previous-queries <path>   Accepted; unused. Same flag set as keywords.
  --targets <path>            Accepted; unused. Same flag set as keywords.
  --min-impressions <n>       Accepted; unused. Same flag set as keywords.
  --site <url>                Accepted; unused. Same flag set as keywords.
  --output <dir>              Also write the result to a file in this directory,
                              an absolute path that must sit outside this tool
                              directory.
  --help, -h                  Print this message

The earlier window ends the day before the reporting window and covers the same
number of days. Reads no file unless --output is also given, in which case it
writes the window object. Needs no credentials and no configuration file, so no
command takes --env. Success prints one JSON object to stdout; a usage mistake
goes to stderr with exit 1.`;

const SUB_USAGE = {
  audit: AUDIT_USAGE,
  keywords: KEYWORDS_USAGE,
  'previous-window': PREVIOUS_WINDOW_USAGE,
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
  fail(`Error: unknown command "${command}". Run "node scripts/seo-data.js help" for usage.`);
}

if (argv[1] === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${SUB_USAGE[command]}\n`);
  process.exit(0);
}

if (command === 'audit') {
  const { runAudit } = await import('./audit-core.js');
  runAudit(argv);
} else {
  const { runKeywords } = await import('./keywords-core.js');
  runKeywords(argv);
}
