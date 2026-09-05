# Third-party notice: video-edit

**This tool installs nothing.** No npm dependency is declared; no package is fetched, and FFmpeg is a system dependency named in `TOOL.md`.

## FFmpeg, which this tool requires and does not install

Every command in this tool is carried out by **FFmpeg**, a third-party program that is not part of this repository, is not installed by this tool, and is not fetched by it. The tool checks for FFmpeg, and when it is absent it stops and names the dependency and the command that proves it present.

FFmpeg is supplied and licensed by its own authors. **Which licence applies depends on the build a user has**, since FFmpeg is distributed under `LGPL-2.1-or-later` or `GPL-2.0-or-later` according to how it was compiled and which components were enabled. This repository redistributes no copy of it and takes no position on which build is installed; a user who needs to know theirs can ask it with `ffmpeg -version`, which prints the configuration it was built with.

**No version is pinned here** because this tool does not install FFmpeg and cannot determine in advance which build a machine carries.
