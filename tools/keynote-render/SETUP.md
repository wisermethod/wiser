# keynote-render Setup

Once per machine. Skip it if `themes` already prints a list of theme names.

**Once per machine covers the system dependencies below, not the packages.** A system dependency named below is installed once and every copy of this plugin then finds it; a tool's own packages install per copy of the plugin, on the first run that authorises them with `--install`, and a plugin manager that keeps each version in its own directory needs that authorisation again after an update. `tools/AGENTS.md` lists everything a run of a tool writes and where, and is the only place this repository states it.

Run every command below from this tool's directory. macOS only: the tool drives Keynote through JXA, which exists nowhere else.

## 1. Node

```bash
node --version
```

18 or newer. Missing or older: install the current LTS from nodejs.org, open a new shell, and check again.

## 2. Dependency

```bash
npm ci
```

The entry script will do this on the first build that reads a brand file, given `--install`, and reports what it would fetch rather than installing without one; doing it here means that build works the first time. A build with no brand file needs nothing installed. This tool holds no credentials, so there is nothing else to configure and no `--env` to resolve.

## 3. Runtimes

```bash
node scripts/render.js check
```

Both fields report `true` on a machine that can render. A `false` is a runtime the tool needs; TOOL.md's Dependencies section names what each one is for and the command that proves it present. When one is missing, the agent follows the Script Contract's System dependencies clause: it reads that dependency's own current documentation, runs whatever install the host can run itself, and hands you only the smallest step it cannot. Install steps are deliberately not written in this repository; they rot as the platforms change.

## 4. Automation permission

macOS blocks one program from controlling another until you allow it, per terminal application. This is the one step no agent and no script can take.

```bash
node scripts/render.js themes
```

The first run raises a macOS prompt asking whether your terminal may control Keynote; allow it, and the command prints the installed theme names. If no prompt appears and the command reports that automation is not permitted, open System Settings, Privacy & Security, Automation, find your terminal in the list, and enable Keynote under it. A terminal that was already denied never prompts again, so the setting is the only way back.

The grant belongs to the terminal application, not to this tool, so a different terminal, or one reinstalled, asks again.

## 5. Verify

Run the checks in TOOL.md's Success section. On a correctly set up copy, `help`, `check`, and `themes` all pass, and a `build` over a real spec writes the deck it names.

Smoke sequence for the edit workstream (paths outside this tool directory):

```bash
# Greenfield
node scripts/render.js build --spec /tmp/deck.json --brand /tmp/brand.yaml --out /tmp/deck.key

# In-place update archives first
node scripts/render.js update-slide --deck /tmp/deck.key --slide 1 --title "New" --confirm
# → /tmp/zArchive/YY-MM-DD V1 - deck.key  (see standards/conventions.md § Archives)

# Primary agent path
node scripts/render.js sync --md /tmp/slides.md --deck /tmp/deck.key --brand /tmp/brand.yaml --confirm
```

`sync` against an existing deck must not rebuild untouched slides; custom shapes on those slides remain. Every mutator JSON includes `archivePath` when the `.key` already existed.

## Troubleshooting

**`node: command not found`** Node is installed but not on this shell's PATH. Open a new shell; if it persists, reinstall Node and let it update PATH.

**`npm ci failed`** Usually Node older than 18, a directory this account cannot write to, or a `package-lock.json` that is missing or out of step with `package.json`. `npm ci` installs exactly what the lockfile records and will not resolve around a mismatch, so check the lockfile first: a mismatch is a defect in this copy of the plugin rather than something a re-run fixes. Then delete `node_modules/` so a half-finished install cannot mask the retry, check step 1, and confirm the tool directory is writable.

**`missing Keynote`** Neither Keynote bundle name is in `/Applications`. Install Keynote from the App Store, open it once so its themes register, then run `check` again.

**`Keynote automation is not permitted for this terminal`** Step 4, and note that it is per terminal application.
