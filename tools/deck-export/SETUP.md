# deck-export Setup

Once per machine. Skip it if `node scripts/deck.js check` already reports every field true.

System dependencies are once per machine; a tool's packages are per copy of the plugin, and `tools/AGENTS.md` says what every install writes (`tools/RUNNING.md`).

Run every command below from this tool's directory. On Windows, use Git Bash; PowerShell and cmd quote arguments differently.

## 1. Node

```bash
node --version
```

18 or newer. Missing or older: install the current LTS from nodejs.org, open a new shell, and check again.

## 2. Packages

Nothing to run by hand. Consent is once per copy of the plugin (`tools/RUNNING.md`). This tool holds no credentials, so there is nothing else to configure and no `--env` to resolve.

## 3. The browser build

```bash
node scripts/deck.js check
```

`chromium: false` is the one system dependency `pdf` and `png` stop on; `scaffold` never needs it. Presence is a trial launch via the shared browser runtime at `tools/lib/browser-runtime/`, which also self-heals the known headless-safe missing-library case where a C compiler is present and forwards `HTTPS_PROXY` / `HTTP_PROXY` into Chromium. When launch still fails, `check` carries a `remediation` line, follow that single step. Install walkthroughs are never written here.

A machine that already drives a browser for another primitive in this root usually has the build cached and needs nothing here.

The Chromium build installs with the packages under the same consent, and `tools/AGENTS.md` says where it lands.

## 4. Verify

Run the checks in TOOL.md's Success section. On a correctly set up copy, `help`, `check`, and a `scaffold` into a work directory all pass, and rendering that scaffolded deck writes the PDF and the images it names.

## Troubleshooting

**`node: command not found`** Node is installed but not on this shell's PATH. Open a new shell; if it persists, reinstall Node and let it update PATH.

**The package install fails** Usually Node older than 18, a directory this account cannot write to, or a `package-lock.json` that is missing or out of step with `package.json`. `npm ci` installs exactly what the lockfile records and will not resolve around a mismatch, so check the lockfile first: a mismatch is a defect in this copy of the plugin rather than something a re-run fixes. Then delete `node_modules/` so a half-finished install cannot mask the retry, check step 1, and confirm the tool directory is writable.

**`chromium: false` / `Chromium cannot launch`** Read the `remediation` field on `node scripts/deck.js check` (or the error line). It names the gap and one next step. Missing OS libraries are self-healed where possible; otherwise the base image or a C compiler is the next step, never a root-only `install-deps` recipe from this tree.

**Proxy-only egress / CDN decks stall** Export `HTTPS_PROXY` or `HTTP_PROXY` in the process environment; the shared runtime forwards them into Chromium automatically.

**Shared browser cache (optional)** To keep the Chromium build on a shared writable volume, and avoid re-fetching it for every fresh copy of this plugin, set `PLAYWRIGHT_BROWSERS_PATH` to that directory before install and render. Leave it unset for Playwright's own default. `tools/AGENTS.md` names where each setting puts the build.
