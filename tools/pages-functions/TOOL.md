---
name: pages-functions
type: tool
category: web
description: The three files Cloudflare Pages takes for a site's functions folder, compiled offline
version: 0.1.0
---

# pages-functions

Compiles a site's `functions/` folder into the three files Cloudflare Pages takes, with Wrangler's own compiler, offline, with no Cloudflare sign-in.

## Context

Use it when a static site has a `functions/` folder and the next step is `cloudflare.pages.deploy_with_functions`. The command does not deploy, does not bind a database, and does not talk to Cloudflare. It writes the bundle, the routes file, and the routing config that the deploy action reads.

The output carries no bindings by design. A D1 binding belongs on the Pages project, through `cloudflare.pages.bind_d1`, not inside the bundle. A bundle that arrives with bindings is refused by that deploy action.

Classifier seam: none.

## Quick Start

```bash
node scripts/pages-functions.js help
```

Usage text, with nothing installed and nothing configured.

```bash
node scripts/pages-functions.js build --functions /abs/site/functions --assets /abs/site/dist --out /abs/work/functions-build
```

One JSON object on stdout, and four files in `--out`. The first run in a copy of the plugin that has not installed Wrangler stops and says what it would fetch. Re-run the same command with `--install`, or set `WISER_ALLOW_INSTALL=1`, and the install and the build finish in that run.

## Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `node scripts/pages-functions.js help` | Print usage and exit | No |
| `node scripts/pages-functions.js build --functions <dir> --assets <dir> --out <dir>` | Compile `functions/` against the static assets | Yes |

`help`, `--help`, and `-h` print usage and exit 0 before any other check.

| Option | Effect | Default |
|--------|--------|---------|
| `--functions <dir>` | The site's `functions/` folder. Absolute path. Must exist and be a directory | None; required |
| `--assets <dir>` | The static build the functions sit beside. Absolute path. Must exist and be a directory. Passed to Wrangler as `--build-output-directory` | None; required |
| `--out <dir>` | Where the three build files and `build.json` are written. Absolute path. Must not exist, or must be an empty directory. Must not resolve inside this tool, inside `--functions`, or inside `--assets`, and neither of those may resolve inside it | None; required |
| `--install` | Authorise the first install in this copy of the plugin. Without it, a missing Wrangler install stops after naming what it would fetch. `WISER_ALLOW_INSTALL=1` does the same for an unattended run | Off |
| `--help`, `-h` | Print usage and exit | Off |

An unknown flag or an unknown command is refused by name. Node.js older than 22 is refused, and the message names the requirement. No command takes `--env`.

## Output

One JSON object on stdout, exit 0.

| Field | Carries |
|-------|---------|
| `ok` | `true` |
| `out` | The canonical `--out` directory |
| `files` | `{ name, bytes }` for each file written |
| `routes` | `{ include, exclude }` read from `_routes.json` |
| `wrangler` | The installed Wrangler version |
| `sources` | How many function files were hashed into `build.json` |

A failure prints nothing on stdout. stderr names the problem, and the process exits 1. When Wrangler itself fails, stderr names the exit status and then Wrangler's own lines. A `functions` folder with no routes is that failure, passed through; this tool does not rewrite it.

## What it writes

In `--out`:

| File | Role |
|------|------|
| `_worker.bundle` | The compiled Pages Functions worker. Metadata bindings are empty |
| `_routes.json` | Include and exclude rules, version 1 |
| `functions-filepath-routing-config.json` | Wrangler's routing config |
| `build.json` | Provenance: tool name and version, Wrangler version, the canonical `--functions` and `--assets` paths, a sorted list of `{ path, sha256 }` for every regular file under `--functions` (skipping `node_modules` and hidden names), and `built_at` in UTC |

`cloudflare.pages.deploy_with_functions` sends the first three and requires `build.json`: its `assets` must be the directory being deployed and its `functions` must sit outside it. The deploy returns `build.json` as provenance and never uploads it.

The compiler runs in a fresh directory under the system temp directory, prefix `wiser-pages-functions-`. That directory is removed when the run ends, including when the build fails. A run killed from outside before it ends can leave it behind; it holds Wrangler's log, its working files, its update check's cache and the compiled output, never a credential, and the system clears its temporary directory. Wrangler is given no route to the network that this tool knows of: metrics are off, and the npm registry it would check for a newer version, under both the keys it reads, is a closed port on this machine, so an `.npmrc` above the working directory cannot redirect it; that holds on its error path as well as its success path, and was proved by logging every connection a build opened. On Windows, `USERPROFILE`, `APPDATA` and `LOCALAPPDATA` point inside the run too; the tool has not been run on Windows. An install writes `node_modules/` in this tool directory and, once, `.wiser-consent` at the plugin root.

## Dependencies

Node.js 22 or newer. The script checks the major version and refuses an older one by name.

Wrangler `4.136.3`, pinned. The install is about 210 MB, because Wrangler loads its `workerd` runtime even to compile. Nothing is fetched from Cloudflare, and the build is given no Cloudflare credential. The first install in a copy of the plugin needs `--install` or `WISER_ALLOW_INSTALL=1` or the plugin consent marker. After that, `npm ci` is not asked for again.

## Troubleshooting

**The command stops and names `wrangler 4.136.3`, `registry.npmjs.org`, and about 210 MB.** This copy has not authorised an install. Re-run with `--install`, or set `WISER_ALLOW_INSTALL=1`. Nothing is read from stdin.

**`Node.js 22 or newer is required`.** The script checked `process.versions.node` and the major version is below 22.

**`wrangler exited` and the next lines say there are no routes.** The `functions/` folder has no route Wrangler can compile. Add a route file, such as `functions/api/hello.js` exporting `onRequest`, and run the build again.

**A path is refused.** All three paths are absolute. `--functions` and `--assets` must already be directories. `--out` must be missing or empty, and it must sit outside this tool and outside the two inputs. A symbolic link in a spelling is resolved before those checks, so the real path is the one that is judged.

**The deploy says `bundle carries bindings`.** This tool does not put bindings in the bundle. Set them on the Pages project with `cloudflare.pages.bind_d1`, then deploy with `cloudflare.pages.deploy_with_functions`.
