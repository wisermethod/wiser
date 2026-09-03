# Third-party notice: html-to-png

This tool installs the 3 packages below on the machine that calls it, into this tool's own directory on the first run that authorises it with `--install`. **This repository redistributes none of them.**

**Versions and licences are read from this tool's own `package-lock.json`**, on 2026-09-02, rather than from a list of names, because a licence obligation attaches to a version. A package marked optional is installed only where it applies to the machine doing the install, so a single install takes fewer packages than the table lists.

| Package | Version | Licence | |
|---------|---------|---------|--|
| `fsevents` | 2.3.2 | MIT | optional |
| `playwright` | 1.62.0 | Apache-2.0 | required |
| `playwright-core` | 1.62.0 | Apache-2.0 | required |

## The browser build is a separate download

`playwright` is the npm package. The Chromium build it drives is not an npm package and is not in the table above: it is fetched separately, by `playwright install chromium`, into whichever location `tools/AGENTS.md` names for this machine's platform and settings. That build is roughly half a gigabyte and carries its own licences, chiefly the BSD-style licence of the Chromium project. This repository redistributes neither the package nor the browser.
