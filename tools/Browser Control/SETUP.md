# Browser Control Setup

Once per machine. Skip it if `node scripts/browser.js session status` already answers after a successful `session start` on this host, or if `npm run check:chromium` already exits 0.

System dependencies are once per machine, packages once per copy (`tools/RUNNING.md`).

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
npm run check:chromium
```

Expect `"chromiumLaunch":true`. Presence is a trial launch through the shared runtime (`tools/AGENTS.md`). On failure, follow the `remediation` line, install walkthroughs are never written here.

A machine that already drives a browser for another primitive in this root usually has the build and any userspace stub cached and needs nothing here.

The Chromium build installs under the same consent; `tools/AGENTS.md` says where.

## 4. Profile directory

Sessions need an absolute `--profile` directory in the owning root (not inside this tool). Create an empty directory under that root's declared work location before `session start`. The profile holds cookies and sign-ins for that root only.

## 5. Verify

```bash
node scripts/browser.js help
```

Usage text with nothing configured. Then, with a profile path you chose:

```bash
node scripts/browser.js session start --profile [absolute dir]
node scripts/browser.js session status
node scripts/browser.js session stop
```

Status should report a live host after start. On a correctly set up copy, help, chromium check, and a short session cycle all pass.

## Troubleshooting

**`node: command not found`** Node is installed but not on this shell's PATH. Open a new shell; if it persists, reinstall Node and let it update PATH.

**Chromium check fails after the install** Read the `remediation` field from `npm run check:chromium`. Binary missing, launch blocked, and OS library gaps each name one next step there.

**Automation permission refused** On macOS, the terminal may need permission under System Settings, Privacy & Security, Automation, to control the browser host.
