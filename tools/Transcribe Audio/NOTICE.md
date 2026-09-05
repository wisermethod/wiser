# Third-party notice: Transcribe Audio

This tool installs the packages below on the machine that calls it, into a Python virtual environment inside this tool's own directory, on the first run that authorises it with `--install`. **The speech model weights are a second, separately authorised download**, described below. **This repository redistributes none of them.**

**These versions are a snapshot, not a pin.** `requirements.txt` declares floors (`openai-whisper>=20231117`, `torch>=2.0.0`, `torchaudio>=2.0.0`) and is deliberately left that way, because `torch` publishes wheels specific to a platform, an architecture and a Python version, and an exact pin resolved on one machine can have no matching wheel on another. **What is recorded here is what those floors actually resolved to on one occasion**, so that a licence obligation has a version to attach to.

**Resolved 2026-09-02, on a macOS arm64 machine with the system Python 3.9**, by the tool's own first-run install. The command that produced this list was `.venv/bin/python3 -m pip list --format=freeze`, and the licences were read from each installed distribution's own metadata. **pip writes no lockfile**, which is why this record names the resolution rather than pointing at a committed one; a different machine will resolve differently and should read its own environment.

| Package | Version | Licence |
|---------|---------|---------|
| `certifi` | 2026.7.22 | MPL-2.0 |
| `charset-normalizer` | 3.5.1 | MIT |
| `filelock` | 3.19.1 | Unlicense |
| `fsspec` | 2025.10.0 | BSD-3-Clause |
| `idna` | 3.19 | BSD-3-Clause |
| `Jinja2` | 3.1.6 | BSD License |
| `llvmlite` | 0.43.0 | BSD |
| `MarkupSafe` | 3.0.3 | BSD-3-Clause |
| `more-itertools` | 10.8.0 | MIT |
| `mpmath` | 1.3.0 | BSD |
| `networkx` | 3.2.1 | BSD License |
| `numba` | 0.60.0 | BSD |
| `numpy` | 2.0.2 | BSD License |
| `openai-whisper` | 20250625 | MIT |
| `pip` | 21.2.4 | MIT |
| `regex` | 2026.1.15 | Apache-2.0 AND CNRI-Python |
| `requests` | 2.32.5 | Apache-2.0 |
| `setuptools` | 58.0.4 | UNKNOWN |
| `sympy` | 1.14.0 | BSD |
| `tiktoken` | 0.14.0 | see package metadata |
| `torch` | 2.8.0 | BSD-3-Clause |
| `torchaudio` | 2.8.0 | BSD License |
| `tqdm` | 4.70.0 | MPL-2.0 AND MIT |
| `typing_extensions` | 4.16.0 | PSF-2.0 |
| `urllib3` | 2.6.3 | MIT |

**`setuptools` 58.0.4 records its licence as `UNKNOWN` in its own metadata, and `tiktoken` 0.14.0 carries a licence field too long to reproduce as a name.** Both are stated as found rather than tidied, and a reader who needs either should read that package's own metadata in the installed environment.

## FFmpeg and the model weights, neither of which is installed by this list

- **FFmpeg** decodes the audio. It is a third-party program, not in this table, not installed by this tool, and licensed by its own authors under `LGPL-2.1-or-later` or `GPL-2.0-or-later` depending on the build. The tool stops and names it when it is absent.
- **The speech model weights** are downloaded on first use of a given model, into the directory the caller passes as `--model-cache`, not into this tool. They are supplied by the model's own publisher under its own terms. The base model is roughly 145MB; the five selectable models run from roughly 75MB for `tiny` to about 3.1GB for `large`.
