# web-screenshot Setup

Once per machine. Skip it if packages are installed and the Chromium check named in TOOL.md Dependencies already passes.

**Once per machine covers the system dependencies below, not the packages.** A system dependency named below is installed once and every copy of this plugin then finds it; a tool's own packages install per copy of the plugin, on the first call, and a plugin manager that keeps each version in its own directory installs them again after an update. `tools/AGENTS.md` lists everything a run of a tool writes and where, and is the only place this repository states it.

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

First non-help command also installs and asks for a re-run. This tool holds no credentials.

## 3. Chromium

```bash
node scripts/capture.js check
```

Expect `"chromiumLaunch":true`. Presence is a trial launch via the shared browser-runtime; missing OS libraries are self-healed where a C compiler is present. On failure, follow the `remediation` line — never a hard-coded install recipe here.

## 4. Verify

```bash
node scripts/capture.js help
```

Usage text, then a short successful command from TOOL.md Success when you want a full proof.
