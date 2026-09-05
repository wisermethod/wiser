---
name: web-screenshot
type: tool
category: media
description: Captures a PNG of a live web page at a caller-named viewport size and scale, either the visible viewport or the whole scrollable page
version: 0.2.0
---

# web-screenshot

One PNG of a web page as a browser renders it, plus a JSON record of the address that was actually reached, the status it returned, and the pixel dimensions written.

## Context

Use it when the page is live and the picture has to be of the real thing: a competitor's landing page for a teardown, a client's site before and after a change, a deployed preview a reviewer cannot open themselves, a page whose look is the evidence. It captures whatever the address serves at the moment it runs, logged out and unauthenticated.

Do not use it for anything that is not a live address. A local HTML file is rendered by `html-to-png`, a Mermaid diagram by `mermaid-to-png`, and an SVG by `svg-to-png`, not by pointing this one at a temporary server. Do not use it to read a page either: it returns an image, so the words in it are pixels. A caller that needs the text fetches the page as text. And do not expect it behind a login, a consent wall, or a paywall, because it carries no credential and no cookie and starts every run in a fresh browser: it captures the page a stranger sees.

It reaches the network by design, which sets it apart from most tools in this family. It navigates to the one address `--url` names and nothing else; every other request in a run is one the page itself issues, exactly as it would in the user's own browser. It authenticates to nothing, holds no credential, and writes only the one file `--output` names.

## Dependencies

Rendering is a real browser, so this tool needs a browser binary beyond Node and npm. It is Chromium, and `playwright` carries no postinstall script, so `npm ci` fetches the package and no browser: this tool runs Playwright's own installer under the same `--install` authorisation, in the same run, then proves it by a **trial launch** through the shared browser runtime at `tools/lib/browser-runtime/`.

| Dependency | Needed for | Present when |
|------------|------------|--------------|
| Chromium | `capture` and `check` | `node scripts/capture.js check` exits 0 with `"chromiumLaunch":true` |

Missing OS libraries are self-healed in userspace where a C compiler is present; otherwise `check` names the library and the one next step. The runtime also forwards `HTTPS_PROXY` / `HTTP_PROXY` into Chromium. Install steps are never written here. The binary lands where `tools/AGENTS.md` says it does, which depends on the platform and on `PLAYWRIGHT_BROWSERS_PATH`.

## Quick Start

```bash
node scripts/capture.js help
```

Usage text, with nothing installed.

```bash
node scripts/capture.js capture --url https://host.example/pricing --output /path/to/a/work/directory/pricing.png
```

The first real run reports what it would install and stops. With `--install` it installs `playwright` into `tools/lib/browser-runtime/` and its Chromium build where `tools/AGENTS.md` names, and finishes the work in the same run:

```
{"output":"/path/to/a/work/directory/pricing.png","url":"https://host.example/pricing","finalUrl":"https://host.example/pricing","status":200,"width":1280,"height":720,"scale":1,"fullPage":false}
```

Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Reaches the network |
|---------|---------|---------------------|
| `node scripts/capture.js help` | Print usage and exit | No |
| `node scripts/capture.js check` | Report whether the Chromium build is present | Only with `--install` |
| `node scripts/capture.js capture --url <address> --output <path>.png` | Load the page and write a PNG of it | Yes |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--url <address>` | The page to capture, `http` or `https`. Required by `capture` | None; required |
| `--output <path>` | Absolute path of the `.png` file to write, in a work directory in the owning root. Required by `capture` | None; required |
| `--width <n>` | Viewport width in whole pixels, which is what decides the responsive layout the page renders at | 1280 |
| `--height <n>` | Viewport height in whole pixels | 720 |
| `--scale <n>` | Device scale factor: how many image pixels the browser writes per viewport pixel. Need not be whole | 1 |
| `--timeout <n>` | Whole milliseconds to wait for the page's network activity to stop. Minimum 1000 | 30000 |
| `--full-page` | Capture the whole scrollable page instead of the viewport | Off; viewport only |
| `--overwrite` | Replace the file already at `--output` | Off; an existing file is refused |
| `--help` | Print usage and exit | Off |

One page per run. `--output` names a file, not a folder: there is no default destination and no default save folder, so a caller who does not know where the image belongs asks before running this. Missing parent directories along that path are created. A file already there is not: the run refuses, names the path, and names `--overwrite`, because a capture replaces its destination whole and the file standing there is somebody's earlier work.

Viewport size and image size are two different things. `--width` and `--height` are the browser window the page lays itself out in; `--scale` multiplies the pixels written without changing that layout, so `--scale 2` yields an image twice the size of a viewport that rendered identically, which is the retina capture. Without `--full-page` the image is `--width` by `--height`, times the scale. With it, the image is as tall as the document, again times the scale, and `--height` only decides what counts as "above the fold" while the page loads.

`--timeout` is the budget for step 3 below, the wait for network silence, and it is the only wait a caller can move. It is in milliseconds, the unit every tool in this family takes, so thirty seconds is `30000`; a value under 1000 is refused because it is almost always a caller who meant seconds. Raising it helps a page that is merely slow; it never helps a page that never goes quiet, which will spend whatever budget it is given and then fail.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## How a Capture Runs

The sequence matters, because two of its steps are the usual explanation for a surprising image.

1. Check the arguments, and check the destination: a file already at `--output` stops the run here, before a browser starts and before anything is fetched.
2. A fresh browser and a fresh page, at `--width` by `--height`, at `--scale` device pixels each. No profile, no cookies, no extensions, no stored session.
3. Navigate, and wait for the page's network activity to stop. That wait is capped at `--timeout` milliseconds, 30000 by default.
4. Wait one further second, which is what lets fonts swap in and entrance animations finish before the shutter.
5. Screenshot, encode as PNG, write the file, create the parent folder first if it is missing.

Step 3 is the one to know: waiting for network silence is what makes the image reliable on a normal page, and it is also why some pages cannot be captured at all. Two shapes never go quiet: a page that keeps issuing requests, which is a polling beacon or an ad and analytics loop, and a page waiting on a request nothing ever answers. Either spends the whole budget and fails even though it rendered seconds earlier. A stream whose response has already begun is not one of them: a page holding an open event stream settles and captures normally, so a live connection is not by itself a reason a capture will fail.

`--timeout` moves that budget and nothing else. It does not change what the tool waits for, so on a page that is never quiet a larger number buys a longer wait before the same failure; on a page that is merely slow, it is the fix.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before the dependency check, the consent-gated dependency install, the system-dependency check on the commands that need it, and the stdout and stderr rules. The sections above state what the commands do; the contract states how the script behaves getting there.

Two of its clauses do visible work here. The browser's own error text is read to classify a failure and never repeated, so every message below is this tool's own sentence about what went wrong. And an `--output` that resolves inside this tool's directory is refused, normalized first so a path that climbs out and back in is caught. The first-run install writes Playwright into `tools/lib/browser-runtime/`, not into this tool; `tools/AGENTS.md` lists every write.

A failed run writes no image, replaces nothing that was already at `--output`, and leaves nothing behind but a parent folder it may have created.

## Output

One JSON object on stdout, exit 0, when an image was written.

| Field | Carries |
|-------|---------|
| `output` | Absolute path of the PNG written |
| `url` | The address navigated to, normalized |
| `finalUrl` | Where the browser ended up, which differs from `url` after a redirect |
| `status` | HTTP status of the page's own response, `null` when the browser reported none |
| `width`, `height` | Pixel dimensions of the PNG as written, read back out of the file's own header. At a scale above 1 these are larger than the viewport that produced them |
| `scale` | The device scale factor the image was written at |
| `fullPage` | Whether the whole document was captured or only the viewport |

Read `finalUrl` and `status` before trusting the image. A capture that ran cleanly is not a capture of the page that was asked for: a redirect to a consent wall, a region gate, or a login page returns 200 and produces a perfectly valid screenshot of the wrong thing, and a 404 or a 503 page photographs exactly as well as the real one. The image is the answer to "what does this address serve right now", never to "does this address serve what I expect".

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `this tool is not installed yet and this run did not authorise an install` | First run in this copy, and no `--install` | Read what it says it would fetch and from where, then re-run the same command with `--install`, which installs and does the work in one run. `WISER_ALLOW_INSTALL=1` authorises an unattended run |
| `npm ci failed` | Node missing or older than 18, the directory is not writable, or `package-lock.json` is missing or out of step with `package.json` | Confirm `node --version` is 18 or newer and that the lockfile is present and matches the manifest, which `npm ci` requires and will not resolve around; then delete `node_modules/` in the directory the error names and run `npm ci` there by hand. `tools/AGENTS.md` lists those directories |
| `Error: Chromium cannot launch` / `chromiumLaunch:false` | Binary missing, launch blocked, or OS library gap | Read `remediation` on the check JSON; follow that single step. `check --install` and `capture --install` both take the install route it names. Never chase allowlist for a launch failure |
| `Error: --url is required` | `capture` ran with no address | Pass `--url` with the full address, scheme included |
| `Error: --url is not a web address` | The scheme is missing, so there is nothing to navigate to | Write it out in full, as in `https://host/path` |
| `Error: --url must use http or https` | A `file:`, `data:`, or other scheme was passed | Those are other tools' inputs: `html-to-png` for an HTML file, `mermaid-to-png` for a diagram, `svg-to-png` for an SVG. This one captures live pages |
| `Error: --output is required` | No destination was named | Name the absolute `.png` path; there is no default folder |
| `Error: --output must be absolute` | A relative path was passed | Pass the full path, which cannot be misread against a caller's working directory |
| `Error: --output must end in .png` | The extension disagrees with what is encoded | Rename the destination; only PNG is written |
| `Error: --output resolves inside this tool directory` | The destination landed in the shared root | Pass a work directory in the owning root |
| `Error: --output already exists` | A file is already at that path, and a capture replaces its destination whole | Pass `--overwrite` to replace it, or name a path that is not in use |
| `Error: --width must be a whole number of pixels`, or the same for `--height` | A decimal, a negative, or text reached it | Pass a positive whole number |
| `Error: --width needs a value`, or the same for any flag | The flag was written last with nothing after it, or its value was swallowed by another flag | Re-run with a value after the flag |
| `Error: --scale must be a positive number` | The value was zero, negative, text, or carried a unit such as `2x` | Pass a bare positive number, `1` or `2` or `1.5` |
| `Error: --timeout must be a whole number of milliseconds` | A decimal, a negative, or text reached `--timeout` | Pass a whole number |
| `Error: --timeout is in milliseconds and must be at least 1000` | The value was given in seconds, so the run would have failed before the page could load | Multiply by a thousand; thirty seconds is `30000`, which is also the default |
| `Error: the host in --url did not resolve` | The host does not exist, or DNS is unreachable from this machine | Check the spelling; confirm the machine has a DNS path to it |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| `Error: the host refused the connection` | Nothing is listening on that host and port | Common against a local preview that is not running; start it first |
| `Error: the TLS certificate was rejected` | Expired, self-signed, or wrong-host certificate | This tool trusts what a browser trusts; fix the certificate or capture the `http` address |
| `Error: the page did not finish loading within N ms` | The page never goes network-quiet, or is genuinely slow | Raise `--timeout` if it is slow. If it never goes quiet, no budget helps: capture a quieter page on the same site, or take the image another way |
| `Error: the page could not be captured` | The browser reached the page and something after that failed | Confirm the address renders in a browser on this machine |
| `Error: the page could not be reached` | A network failure outside the named cases: a blocked or unsafe port, a reset connection, a proxy refusing the request | Confirm the address loads in a browser on this machine; a port on the browser's restricted list cannot be captured |
| The image is a cookie banner or a consent wall | Expected: a fresh browser with no stored consent | The page a stranger sees is what this tool captures; dismissing the banner needs a driven browser, not this |
| The image is a login page, and `status` is 200 | The address redirected | Compare `finalUrl` to `url`; this tool carries no session |
| The layout is not the one the site shows in a browser | The page is responsive and rendered at the requested width | Pass the `--width` that matches the breakpoint being tested |
| The PNG is twice the pixels that were asked for | Expected at `--scale 2`: the scale multiplies the image, not the layout | Read `scale` in the output; pass `--scale 1` for one image pixel per viewport pixel |
| `--full-page` produced a very tall image, or a short one | The document is that tall, or an infinite scroll loaded only its first screen | Expected; a lazy page only ever yields what it had rendered when the shutter fired |
| Fonts or images are missing from the image | They arrived after the capture, or were never reachable | Usually a slow third-party asset; re-run, and treat a repeat as the page's own problem |

## Success

- `help` prints usage to stdout and exits 0 on a copy with no `node_modules/` and no browser installed.
- `check` exits 0 with one JSON object surveying every dependency: `packages` for the npm packages, `chromiumLaunch:true` when a trial launch of the Chromium build succeeds, and otherwise `chromiumLaunch:false` with the `remediation` for whatever stopped it. The exit code is 0 either way, the way `deck-export check` reports, so a caller reads `chromiumLaunch` for the verdict. Without `--install` it fetches nothing and opens no connection; with `--install` it installs the packages and the browser first, then reports on what it installed, so the `--install` the remediation names works on `check` itself as well as on `capture`.
- `capture` against a reachable page exits 0 with one parseable JSON object on stdout carrying `output`, `finalUrl`, `status`, `scale`, and the PNG's real dimensions, and the file at `output` opens as a PNG of that page.
- Every usage mistake, a missing or non-web `--url`, a missing, relative, non-`.png`, or inside-the-tool `--output`, a non-numeric `--width`, `--height`, `--scale`, or `--timeout`, and a `--timeout` under 1000 that was meant as seconds, exits 1 with the cause on stderr and stdout empty, before any install and before any connection is opened.
- A run naming an `--output` that already holds a file exits 1 naming that path and `--overwrite`, writes nothing, and starts no browser; the same run with `--overwrite` replaces the file.
- A run whose `--output` names directories that do not exist creates them and writes the file.
- An unreachable host, a refused connection, and a page that never settles each exit 1 with this tool's own sentence naming the address and what to do, never with the browser's own text; the settling failure names the budget in milliseconds, the caller's when one was set and 30000 when none was.
- A run without `--full-page` is `--width` by `--height` pixels, times `--scale`; a run with it is `--width` by the document's height, times `--scale`. The defaults, 1280 by 720 at scale 1, are what the tool has always done.
- No run reads a credential, sends a cookie or a stored session, navigates anywhere but the address `--url` names, or writes any file other than the one `--output` names and what `tools/AGENTS.md` lists a first run installing.
