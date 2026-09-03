# html-to-png Setup

Once per machine. Skip it if packages are installed and the Chromium check named in TOOL.md Dependencies already passes.

**Once per machine covers the system dependencies below, not the packages.** A system dependency named below is installed once and every copy of this plugin then finds it; a tool's own packages install per copy of the plugin, on the first run that authorises them with `--install`, and a plugin manager that keeps each version in its own directory needs that authorisation again after an update. `tools/AGENTS.md` lists everything a run of a tool writes and where, and is the only place this repository states it.

Run every command from this tool's directory.

## 1. Node

```bash
node --version
```

18 or newer.

## 2. Packages

```bash
npm ci
```

The first non-help command reports what it would install and stops; `--install` authorises it and that run does the work. This tool holds no credentials.

## 3. Chromium

```bash
npm run check:chromium
```

Expect `"chromiumLaunch":true`. Trial launch via the shared browser-runtime; on failure follow the `remediation` line.

**Nothing here fetches the browser build, and nothing needs to.** `playwright` carries no postinstall script, so `npm ci` above installs the package and no browser. The first non-help command that needs Chromium reports what it would fetch and stops; `--install` authorises both the packages and the browser build and that one run does the work. Run this check to see what is already present, not to make it present.


## 4. Verify

```bash
node scripts/render.js help
```

Usage text, then a short successful command from TOOL.md Success when you want a full proof.
