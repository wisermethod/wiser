# Book Publisher Setup

System dependencies are once per machine; package consent is once per person across plugin copies, as `system/templates/Script Contract.md` states. Skip setup when the relevant checks already pass.

Run every command below from this tool's directory. On Windows, use Git Bash; PowerShell and cmd quote arguments differently.

## 1. Node

```bash
node --version
```

22.13 or newer, because `pdfjs-dist` 6 requires it. If the runtime is missing or older, follow the Script Contract's System dependencies clause.

## 2. Packages

Nothing to install by hand. The first command needing packages asks for consent if it has not already been given. Answer with `--install` on that command, or `WISER_ALLOW_INSTALL=1` for an unattended run. It runs `npm ci`, installs the pinned dependency tree and completes the work in that invocation. You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.

```bash
node scripts/publish.js check --install
```

This tool holds no credentials, so there is no `--env` or account configuration. `tools/RUNNING.md` owns install behavior and recovery; `tools/AGENTS.md` lists writes and hosts.

## 3. System dependencies

```bash
node scripts/publish.js check
node scripts/publish.js check --config /path/to/book/book-config.yaml
```

The first command surveys local runtimes and packages without installing. The second also checks the book project when the YAML reader is available. TOOL.md's Dependencies section names pandoc, pdflatex, makeindex and Ghostscript, what needs each, and its presence command. Follow the Script Contract when one is missing; no install walkthrough lives here.

An EPUB-only build needs pandoc. Print needs pandoc, pdflatex and Ghostscript, plus makeindex only for its enabled index. PDF/X preflight is not a dependency: the structural checks and their limits are in TOOL.md.

## 4. Verify

Run TOOL.md's Success checks. `init --output /path/to/new/book` makes a project; `validate --config /path/to/new/book/book-config.yaml` checks it. Then build the requested edition and read its JSON, including every print structural check. A completed structural check is not PDF/X-1a certification; use the printer's upload preflight or Adobe Acrobat Pro's Preflight for conformance.

## Troubleshooting

**Node missing or too old:** check section 1 and the Script Contract's dependency guidance.

**Package installation fails:** use `tools/RUNNING.md` to recover, then repeat the authorized command. Confirm Node 22.13 or newer and that the tool directory is writable.

**A system runtime is false:** read its row in TOOL.md and follow the Script Contract's System dependencies clause.

**Validation or structural checks fail:** correct the input named on stderr, then validate or rebuild. TOOL.md describes Standing, index strategies and the advisory output profile result.
