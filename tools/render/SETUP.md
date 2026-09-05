# render Setup

Once per machine. Skip it if packages are installed and the Chromium check named in TOOL.md Dependencies already passes.

System dependencies are once per machine; a tool's packages are per copy of the plugin, and `tools/AGENTS.md` says what every install writes (`tools/RUNNING.md`).

Run every command from this tool's directory.

## 1. Node

```bash
node --version
```

18 or newer.

## 2. Packages

Nothing to run by hand. Consent is once per copy of the plugin (`tools/RUNNING.md`). Only `mermaid` installs `mermaid` into this tool's directory. Playwright for every subcommand that launches a browser installs into `tools/lib/browser-runtime/`. This tool holds no credentials.

## 3. Chromium

```bash
node scripts/render.js check
```

Expect `"chromiumLaunch":true`. Presence is a trial launch through the shared runtime (`tools/AGENTS.md`). On failure, follow the `remediation` line, never a hard-coded install recipe here.

The Chromium build installs with the packages under the same consent, and `tools/AGENTS.md` says where it lands.

## 4. Verify

```bash
node scripts/render.js help
```

Usage text, then a short successful command from TOOL.md Success when you want a full proof.
