# knowledge-memory setup

What has to be true before the first real run, and what that run does. `TOOL.md` is the contract; this is the walk-through.

## The interpreter

The script needs Python 3.11 or newer and below 3.15. A Mac's system `python3` is 3.9 and is refused by version. Run `check` with the interpreter you intend to use:

```bash
python3.11 scripts/knowledge_memory.py check
```

It lists the newer interpreters it can see on the path. Pick one and use the same one every time in a workspace, because the package cache is created with it.

## The first run

The first command that needs the engine reports what it would install and stops. Read the report: it names the packages, the hosts they come from, the directory they land in, and an estimate of the size, which is on the order of several hundred megabytes. Then re-run the same command with `--install`. That run creates a virtual environment beside the scripts, installs into it with pip's own download cache switched off, and finishes the command. Nothing is installed into the machine or your user environment, and nothing this repository ships is modified.

Everything a run writes, and where, is in `tools/AGENTS.md` and nowhere else.

## The credential

Every command but `help` and `check` takes `--env`, the file the workspace binds as `secrets:openai`. The script parses it directly, reads `OPENAI_API_KEY`, and hands the value to the engine in-process. The value never enters the environment, a log, or any output, and every report records `key_in_environ: false` as the check that it did not.

The engine is the one piece of this tool that reaches the network on an ordinary run: extraction and embedding call the provider on every ingest and every recall. A knowledge set is therefore not local in the sense of never leaving the machine, and the recipe's `provider_consent` records that its owner knows.

## The store

One per owning root, at `knowledge/store/`, created by `bootstrap`. It is engine data, rebuilt from the sets beside it, and it is ignored by git and by drive sync. Back up the sets, never the store: a set's `review/decided/` is part of what makes the store reconstructible, because a rebuild replays it. A store that holds a `.env` file is refused, because the engine would load it on import.

## The first set

`skills/Knowledge Set Onboarding/` creates a set. Done by hand, the order is: copy `templates/set.yaml` to `knowledge/<set>/set.yaml` and fill it; put the sources under `corpus/`; write `canon.md` with the confirmed canonical ideas, each with its quote; copy `templates/eval.questions.yaml` and fill at least the minimum it states; run `ingest` without `--proceed`, read the estimate, run it again with `--proceed`; run `healthcheck --eval`. A set whose eval does not exist is not built, whatever the graph holds.
