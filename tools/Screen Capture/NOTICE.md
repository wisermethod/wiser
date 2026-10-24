# Third-party notice: Screen Capture

This tool installs its pinned packages into a Python virtual environment in its own directory when an authorized command needs them, under the consent in `tools/RUNNING.md`. **This repository redistributes none of these packages.** It downloads no OCR model weights; Vision is a macOS framework and Tesseract is a system dependency.

**Resolved environments inspected 2026-10-23 on macOS arm64, using Python 3.9.6, 3.11.15 and 3.14.7.** Each environment was read with `.venv/bin/python3 -m pip list --format=freeze`; licenses below come from each installed distribution's own metadata, including `License-Expression`, `License`, classifiers and the declared license file where noted.

`requirements.txt` pins all seven runtime distributions exactly. NumPy's pin depends on the interpreter: 2.0.2 below Python 3.11, 2.3.5 from Python 3.11 onward. pip and setuptools are environment bootstrap packages, not runtime requirements; their versions are snapshots of these copies. A different bootstrap may differ, and no setuptools distribution was installed in the Python 3.14.7 copy. pip writes no lockfile here.

| Package | Python 3.9.6 | Python 3.11.15 | Python 3.14.7 | License stated by installed metadata |
|---------|--------------|----------------|---------------|--------------------------------------|
| `numpy` | 2.0.2 | 2.3.5 | 2.3.5 | BSD License classifier; long license field includes bundled-component terms listed below |
| `pillow` | 11.3.0 | 11.3.0 | 11.3.0 | MIT-CMU (`License-Expression`) |
| `pip` | 21.2.4 | 24.0 | 26.2.1 | MIT (`License` in the first two; `License-Expression` in 26.2.1) |
| `pyobjc-core` | 11.1 | 11.1 | 11.1 | MIT |
| `pyobjc-framework-Cocoa` | 11.1 | 11.1 | 11.1 | MIT |
| `pyobjc-framework-CoreML` | 11.1 | 11.1 | 11.1 | MIT |
| `pyobjc-framework-Quartz` | 11.1 | 11.1 | 11.1 | MIT |
| `pyobjc-framework-Vision` | 11.1 | 11.1 | 11.1 | MIT |
| `setuptools` | 58.0.4 | 79.0.1 | Not installed | 58.0.4: `License: UNKNOWN`, MIT classifier. 79.0.1: no License, License-Expression or license classifier; its declared `License-File: LICENSE` contains the MIT permission text |

The NumPy metadata's full license field is longer than a license label. Its main text is the three-clause BSD permission, and the field separately names these components and licenses. These are recorded as found, including the differing LAPACK and GCC labels; the installed metadata and license files remain the full notices.

| Component named by NumPy's license field | NumPy 2.0.2 | NumPy 2.3.5 |
|-----------------------------------------|-------------|-------------|
| lapack-lite | BSD-3-Clause | BSD-3-Clause |
| dragon4 | MIT | MIT |
| libdivide | Zlib | Zlib |
| Meson | Apache 2.0 | Apache 2.0 |
| spin | BSD-3 | BSD-3 |
| tempita | Not named in this field | MIT |
| OpenBLAS | BSD-3-Clause | BSD-3-Clause |
| LAPACK | BSD-3-Clause-Attribution | BSD-3-Clause-Open-MPI |
| GCC runtime library | GPL-3.0-with-GCC-exception | GPL-3.0-or-later WITH GCC-exception-3.1 |
| libquadmath | LGPL-2.1-or-later | LGPL-2.1-or-later |

## System programs, none installed by this tool

- **Tesseract** supplies the second OCR check. It is a third-party system program under Apache-2.0, outside the Python package list. The tool runs it and stops by name when it is absent; it does not install it.
- **FFmpeg and ffprobe** decode, encode and inspect recordings. They are third-party system programs outside the package list, licensed under LGPL-2.1-or-later or GPL-2.0-or-later depending on the build. The tool runs them and stops by name when needed and absent; it does not install them. The selected build's bundled codecs and notices govern that build.
- **screencapture and the macOS frameworks** ship with macOS under its own terms. The tool calls screencapture for raw capture and accesses the frameworks through the separately installed PyObjC packages; it installs neither the program nor the frameworks.
