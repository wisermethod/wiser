# render Setup

Once per machine. Skip it if packages are installed and the Chromium check named in TOOL.md Dependencies already passes.

**Once per machine covers the system dependencies below, not the packages.** A system dependency named below is installed once and every copy of this plugin then finds it; a tool's own packages install per copy of the plugin, after the first `--install` in this copy, and a plugin manager that keeps each version in its own directory needs that authorisation again after an update. `tools/AGENTS.md` lists everything a run of a tool writes and where, and is the only place this repository states it.

Run every command from this tool's directory.

## 1. Node

```bash
node --version
```

18 or newer.

## 2. Packages

Nothing to run by hand. The plugin asks once, on the first install in this copy; `--install` on that run is the answer, and later tools install without asking. Only `mermaid` installs `mermaid` into this tool's directory. Playwright for every subcommand that launches a browser installs into `tools/lib/browser-runtime/`. This tool holds no credentials.

## 3. Chromium

```bash
node scripts/render.js check
```

Expect `"chromiumLaunch":true`. Presence is a trial launch via the shared browser-runtime; missing OS libraries are self-healed where a C compiler is present. On failure, follow the `remediation` line, never a hard-coded install recipe here.

**Nothing here fetches the browser build, and nothing needs to.** `playwright` carries no postinstall script, so the package install fetches no browser. If this copy has not yet authorised an install, the first command that needs Chromium reports what it would fetch and stops; `--install` on that run authorises both the packages and the browser build and that one run does the work. Run `check` on its own to see what is already present; run `check --install` to make it present and then report on it. `check` never writes the consent marker.

## 4. Verify

```bash
node scripts/render.js help
```

Usage text, then a short successful command from TOOL.md Success when you want a full proof.
