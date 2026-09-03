# Third-party notice: image-overlay

This tool installs the 30 packages below on the machine that calls it, into this tool's own directory on the first run that authorises it with `--install`. **This repository redistributes none of them.**

**Versions and licences are read from this tool's own `package-lock.json`**, on 2026-09-02, rather than from a list of names, because a licence obligation attaches to a version. A package marked optional is installed only where it applies to the machine doing the install, so a single install takes fewer packages than the table lists.

| Package | Version | Licence | |
|---------|---------|---------|--|
| `@emnapi/runtime` | 1.11.3 | MIT | optional |
| `@img/sharp-darwin-arm64` | 0.33.5 | Apache-2.0 | optional |
| `@img/sharp-darwin-x64` | 0.33.5 | Apache-2.0 | optional |
| `@img/sharp-libvips-darwin-arm64` | 1.0.4 | LGPL-3.0-or-later | optional |
| `@img/sharp-libvips-darwin-x64` | 1.0.4 | LGPL-3.0-or-later | optional |
| `@img/sharp-libvips-linux-arm` | 1.0.5 | LGPL-3.0-or-later | optional |
| `@img/sharp-libvips-linux-arm64` | 1.0.4 | LGPL-3.0-or-later | optional |
| `@img/sharp-libvips-linux-s390x` | 1.0.4 | LGPL-3.0-or-later | optional |
| `@img/sharp-libvips-linux-x64` | 1.0.4 | LGPL-3.0-or-later | optional |
| `@img/sharp-libvips-linuxmusl-arm64` | 1.0.4 | LGPL-3.0-or-later | optional |
| `@img/sharp-libvips-linuxmusl-x64` | 1.0.4 | LGPL-3.0-or-later | optional |
| `@img/sharp-linux-arm` | 0.33.5 | Apache-2.0 | optional |
| `@img/sharp-linux-arm64` | 0.33.5 | Apache-2.0 | optional |
| `@img/sharp-linux-s390x` | 0.33.5 | Apache-2.0 | optional |
| `@img/sharp-linux-x64` | 0.33.5 | Apache-2.0 | optional |
| `@img/sharp-linuxmusl-arm64` | 0.33.5 | Apache-2.0 | optional |
| `@img/sharp-linuxmusl-x64` | 0.33.5 | Apache-2.0 | optional |
| `@img/sharp-wasm32` | 0.33.5 | Apache-2.0 AND LGPL-3.0-or-later AND MIT | optional |
| `@img/sharp-win32-ia32` | 0.33.5 | Apache-2.0 AND LGPL-3.0-or-later | optional |
| `@img/sharp-win32-x64` | 0.33.5 | Apache-2.0 AND LGPL-3.0-or-later | optional |
| `color` | 4.2.3 | MIT | required |
| `color-convert` | 2.0.1 | MIT | required |
| `color-name` | 1.1.4 | MIT | required |
| `color-string` | 1.9.1 | MIT | required |
| `detect-libc` | 2.1.2 | Apache-2.0 | required |
| `is-arrayish` | 0.3.4 | MIT | required |
| `semver` | 7.8.5 | ISC | required |
| `sharp` | 0.33.5 | Apache-2.0 | required |
| `simple-swizzle` | 0.2.4 | MIT | required |
| `tslib` | 2.8.1 | 0BSD | optional |

## One binary is selected per platform

`sharp` ships its native image library as a set of per-platform packages, `@img/sharp-*`, and npm installs only the one that matches the machine doing the install. Every one of them is marked optional for that reason, so a single install takes one of the twenty listed above and skips the other nineteen.

**Eleven of those platform packages are licensed `LGPL-3.0-or-later`, alone or in combination**, because they carry a build of the libvips image library. They are named individually in the table rather than summarised, since which one lands depends on the machine and a reader is entitled to know which licence reached theirs. **This repository redistributes none of them**: they are fetched from the npm registry by the user's own `npm ci`, at the moment this tool is first called.
