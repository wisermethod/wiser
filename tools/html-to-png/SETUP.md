# html-to-png Setup

Once per machine. Skip it if packages are installed and the Chromium check named in TOOL.md Dependencies already passes.

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
npm run check:chromium
```

Expect `"chromiumLaunch":true`. Trial launch via the shared browser-runtime; on failure follow the `remediation` line.

## 4. Verify

```bash
node scripts/render.js help
```

Usage text, then a short successful command from TOOL.md Success when you want a full proof.
