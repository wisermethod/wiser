---
name: Browser Control
type: tool
category: automation
description: Drives a persistent Chromium session to read, navigate, and act on pages that need a real browser, answering every command with the page state that followed
version: 0.1.2
---

# Browser Control

A run of one command acts on a browser that is already open and returns what the page became.

## Context

Use when the work needs a real browser: a form to fill, a workflow behind a sign-in, content a page builds in JavaScript, a layout to look at, or any sequence of act-then-check steps against a live site.

Do not use when a plain fetch of a static page would answer, when the question is answerable without a page at all, or when a connector already covers the platform; a connector is faster, survives redesigns, and does not need a window. Reaching a platform through its own site instead of its connector is a last resort, not a shortcut.

This tool holds a session and drives it. Deciding what to do with a page belongs to the skill or expert that called it.

## Quick Start

```bash
node scripts/browser.js help
```

Usage text, with nothing installed and nothing configured.

```bash
node scripts/browser.js session start --profile [absolute dir]
node scripts/browser.js navigate --url [address]
node scripts/browser.js snapshot --format interactive
node scripts/browser.js session stop
```

The first session start installs dependencies and asks for a re-run; the second opens the browser. Every command prints one JSON object:

```
{"url":"[address]","title":"[page title]"}
```

Anything else, see Troubleshooting.

## Driving a Session

A page is not a function call. It redraws, it redirects, it shows a consent banner over the thing you meant to click, and it answers a click with a different page than the one you predicted. Every command here therefore returns the page state after the action, so that checking costs one read instead of one round trip.

- **Snapshot before acting.** Read the page before the first action and after anything that could change it. `--format interactive` numbers what can be clicked or typed into; act by index rather than by a selector guessed from a screenshot.
- **One action, then one check.** Never chain actions on the strength of what the page looked like two steps ago. A stale index is the single most common failure, and a fresh snapshot costs less than an action aimed at the wrong element.
- **Verify against the page, not the exit code.** `check` exits 0 whenever the assertion ran; whether it held is the `passed` field. A caller that reads only the exit code will report a failed assertion as a pass.
- **Never repeat an action that just failed.** Snapshot, work out what the page actually shows, and try a different route. Two or three failed routes is the point to stop and report the blocker rather than a fourth.
- **Hand a human what only a human can do.** A sign-in, a CAPTCHA, a second factor, or an operating-system dialog cannot be driven from here. Say what is blocking and let the person act in the window; a signed-in session stays in the profile directory afterwards.
- **Report what the page did.** Close with what was found, where, and what was changed on the site. An automation whose effects nobody can name is not finished.

The pattern that reads a site-specific playbook before improvising travels with the root that owns the site, not with this tool; a shared root ships no account's navigation notes.

## Dependencies

| Dependency | Needed for | Present when |
|------------|------------|--------------|
| The Chromium build Playwright drives | `session start` | `npm run check:chromium` exits 0 with `"chromiumLaunch":true` |

The Playwright package itself installs on first run. Presence is a **trial launch** via the shared browser-runtime (`scripts/lib/browser-runtime.js`), not a path on disk. Missing OS libraries are self-healed in userspace where a C compiler is present; otherwise the check names the library and the one next step. The runtime also forwards `HTTPS_PROXY` / `HTTP_PROXY` into Chromium. Install steps are never written here.

## Session State

This tool reads no credentials and takes no `--env`. What it keeps instead is a browser profile: cookies, storage, and sign-ins, in the directory passed as `--profile [absolute dir]` when a session starts.

Resolve that directory in the owning root, per `standards/conventions.md`. This tool never picks a location and never falls back to one, because a machine-wide default would silently pool one person's sign-ins across every root they work in.

- The directory holds live session material. It belongs where the owning root keeps its own state, and it is never shared between roots.
- `--unattended` additionally denies geolocation, microphone, and camera by default, so a permission prompt cannot stall a run nobody is watching. Attended runs leave them at the site default.
- Native browser prompts (save-password bubbles, autofill, translate bars, restore-session nags) are suppressed in the profile before launch, because nothing on the page can dismiss them. JavaScript dialogs are a different surface and are handled at runtime by `dialog`.

## Usage

One entry script, one command per line, subcommands where a command has modes.

| Command | Purpose |
|---------|---------|
| `session start\|stop\|status\|restart` | Manage the browser host; `start` and `restart` need `--profile` |
| `navigate` | Go to `--url`, or `back`, `forward`, `reload` |
| `snapshot` | Read the page: `--format accessibility\|text\|html\|interactive` |
| `click` | Click by `--index`, `--selector`, `--text`, or `--coords` |
| `type` | Enter `--text` into a target, or press `--key` |
| `wait` | Block on `--selector`, `--text`, `--time`, or `--network` |
| `scroll` | `--to top\|bottom\|[selector]`, `--by [px]`, or `--infinite` |
| `mouse hover\|move\|drag\|wheel` | Pointer actions a click cannot express |
| `select list\|option` | Read or set a dropdown |
| `frame list\|switch\|main\|current` | Move in and out of an iframe |
| `tabs list\|new\|switch\|close` | Manage tabs |
| `dialog accept\|dismiss\|prompt\|off\|status` | Standing answer for JavaScript dialogs |
| `check` | Assert element state; the verdict is `passed` |
| `console start\|stop` | Capture page console output |
| `network start\|stop\|block\|unblock` | Capture requests, or abort ones matching `--pattern` |
| `emulate set\|reset` | Viewport, device viewport, or geolocation |
| `execute` | Run `--code` in the page and return its value |
| `screenshot` | Write a PNG to `--output` |
| `download` | Save `--url` to `--output`, or click `--selector` into `--output-dir` |
| `upload` | Attach `--file` to `--selector`; needs `--confirm` |
| `cookies list\|get\|set\|delete\|clear` | Cookie metadata and page-state cookies |
| `storage list\|get\|set\|delete\|clear` | Local or session storage |
| `trace start\|stop\|status` | Record a replayable trace for debugging a failed run |

A trace is a zip that Playwright's own trace viewer opens; it replays the run with a screenshot, the page state, and the network activity at every step, which is what makes a run that failed once diagnosable afterwards.

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--profile [dir]` | Where session state lives, absolute, resolved in the owning root | None; required by `session start` and `session restart` |
| `--port [n]` | Host port | 4390 |
| `--headless` | No visible window | Off |
| `--unattended` | Deny geolocation, microphone, and camera by default | Off |
| `--confirm` | Opt in to a destructive command | Off; nothing runs without it |
| `--output [file]`, `--output-dir [dir]` | Where an artifact is written, absolute, outside this tool | None |
| `--file [path]` | A file `upload` attaches to a form, absolute, outside this tool | None; required by `upload` |
| `--timeout [ms]` | Per-action budget where the command takes one | 5000 to 30000 by command |
| `--help` | Print usage and exit | Off |

## Destructive Actions

| Command | Effect | Undoable? |
|---------|--------|-----------|
| `cookies delete` / `cookies clear` | Removes one cookie or all cookies in the profile for matching sites | No; re-auth or re-accept is the only path back |
| `storage delete` / `storage clear` | Removes one key or all keys from local or session storage on the current origin | No for that origin's stored state |
| `upload` | Attaches a local file to a form control and may trigger a real server-side write when the form submits | Depends on the site; treat as a real upload |

Each of these requires `--confirm`. The gate is checked before anything is read, sent, or opened. An agent never supplies `--confirm` on its own initiative.

## What This Tool Will Not Do

- **Cookie values never leave the browser.** `cookies list` and `cookies get` return name, domain, path, expiry, flags, and the value's length; the value itself is a live credential, and no command prints it and no command copies it out of the browser, per the constitution's Irreversibles. Chromium's own profile store under `--profile` is where cookie values live, `cookies set` and `cookies delete` change what is in it, and nothing here moves a value out of it. There is no export. `storage get` does return a named key's value, because stored page state is ordinary data and the caller has named exactly what it wants; `storage list` still returns keys alone rather than dumping everything a page has saved.
- **Sign-ins are not injected.** `cookies set` is for page state such as a consent or locale cookie. Authenticate by having the person sign in in the visible window; the profile keeps it.
- **Nothing is overwritten.** A screenshot, download, or trace whose target path already exists is refused, not replaced.
- **Locale, timezone, and touch emulation are not offered.** They are fixed when the context is created and cannot be changed on a live session; a command that appeared to set them would be reporting a change that never happened.

`execute` runs whatever code it is handed, in a page carrying the profile's sign-ins. It is the widest surface here and it is not gated, because its effect is entirely the caller's own code and a gate that fires on every call teaches the caller to ignore it. Blast radius is the caller's to name before running it.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`: self-contained imports, the dependency check, help without configuration, and the stdout and stderr rules. The sections here state what the commands do; the contract states how every script behaves getting there.

Two scripts ship. `scripts/browser.js` is the only one a caller runs. `scripts/server.js` is the session host it starts, which holds the browser open so that separate invocations act on the same page; it takes no instruction from anywhere but loopback and is not run by hand.

## Output

Success is one JSON object on stdout and exit 0. Most commands return the page's `url` and `title` after the action, plus whatever they were asked for: `content` for a snapshot, `passed` for a check, `result` for executed code, a written path for an artifact.

`check` is the one to read carefully. It exits 0 when the assertion ran and reports the verdict in `passed`; an assertion that did not hold is a finding to report, never something to work around by loosening the assertion.

Failure prints to stderr, leaves stdout empty, and exits 1. Files are written where a command's `--output` or `--output-dir` names, and a first run also installs what `tools/AGENTS.md` lists, including a Chromium build outside this plugin, which `Script Contract.md` requires to be outside this tool directory.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `Dependencies installed. Re-run the command.` | First run in this copy | Run the same command again |
| `Chromium cannot launch` / `chromiumLaunch:false` | Binary missing, launch blocked, or OS library gap | Follow the `remediation` line from `npm run check:chromium` |
| `no browser host answering on port [n]` | No session, or it was started on another port | `session status`, then `session start --profile [dir]` |
| `a browser host is already running on port [n]` | A session from earlier work | `session stop`, or pass a different `--port` |
| `session [start\|restart] needs --profile` | No location was resolved | Resolve a work directory in the owning root; do not guess one. `restart` resolves it before it stops anything, so a refusal leaves the running session standing |
| `--output must be absolute` | A relative path resolves against whichever directory the caller was in | Pass the resolved absolute path |
| `--output resolves inside this tool directory` | The path landed in the shared root | Pass a work directory in the owning root |
| `--file resolves inside this tool directory` | An `upload` named this tool's own directory or something in it | Pass a file in a work directory in the owning root |
| `already exists and this tool never overwrites a file` | The artifact path is taken | Name a path that does not exist yet |
| `needs --confirm` | A destructive command was run without opting in | Re-run with `--confirm` once the effect is intended |
| `element index [n] is not in the current list` | The page changed since the last interactive snapshot | Snapshot again and use the new index |
| `no element matched this selector` | The element is absent, or is inside an iframe | `snapshot --format interactive`, and `frame list` if the content sits in an iframe |
| `the browser host did not come up` | The browser could not launch or the host process died | Confirm `npm run check:chromium` (read `remediation` if launch fails), then retry with `--headless` to rule out a blocked window |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/` and no session.
- `session start --profile [dir]` exits 0, and `session status` then reports that host and profile.
- `session restart` resolves `--profile` before it stops anything: one that names none, or names a relative path or a file, exits 1 with the running session still answering `session status`.
- A page command with no session running exits 1 naming the port and the start command, stdout empty.
- Every destructive command run without `--confirm` exits 1 naming the missing confirmation, before it reads a file or contacts the host.
- No command prints a cookie value, and no file this tool writes at a caller-named output path contains one. `--profile` is not such a path: it is a live Chromium profile and holding cookies, storage, and sign-ins on disk is what it is for, which is the row `tools/AGENTS.md` gives it. A verifier checking that no credential material reaches disk should check every path this tool writes except that one, and should treat that one as the sign-in store it is.
- A caller-named path that is relative, inside this tool directory, or already taken is refused rather than written.
- Acting on an element found by an interactive snapshot changes the page, and the next snapshot shows it.
