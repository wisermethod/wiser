# Getting Wiser's own files onto this computer

Use when a skill needs a file or a program that is Wiser's own and this session cannot read it from an installed Wiser plugin, by its commands or by its file tools: the app lists no Wiser skill of its own and the skill came through the Wiser connector, or the plugin is installed where this session's tools cannot open it. The skill names the file set it needs and which way it wants it; this page is how the session gets it. Where the session can read the plugin's own files, read them there, as `tools/AGENTS.md`, Finding an installed tool, says, and do not use this page.

Not for a file that is the member's: where a file a member asks for lands is `standards/conventions.md`, Working Files. Not for a tool that runs on Wiser's side on a member's file: that is `tools/HOSTING.md`. Not a way to install the plugin.

The steps are the same in every app. They were measured in Claude Cowork; anywhere a step cannot be done, it ends at Step 7.

## What you end with

One of two things: the named set on this computer, every byte checked, and your own copy of the archive removed once the skill is done; or one line said to the member, your copy removed, and nothing written from memory.

## Steps

Run every command on this page in the one place that can write where the skill wants the files. Quote each path in single quotes, writing every `'` inside it as `'\''`, with `~` and any variable already expanded. Paste the paths as text: one command does not remember another's variables.

1. **Ask for the set by name.** Call the Wiser connector's `execute` with `action` set to `wiser.delivery.get` and `input` set to `{"name": "<the name the skill gave>"}`. Did the answer carry one file named `wiser-<that name>-` and an id, ending `.tar.gz`, with `bytes` and `sha256`? Yes: go on. This session has no `execute`, the answer was a status, it carried no such file, or the member said no when the app asked: Step 7. Do not call it a second time unless Step 3 sends you back.

2. **Make a directory of your own.** Run `d=$(mktemp -d) && printf '%s\n' "$d"`. The line it prints is `<d>` in every step below. From here on, every way out of this page passes through Step 6's command.

3. **Put the archive there, and check it before you open it.** Write the answer's file as one new file, `<d>/set.tar.gz`, and nowhere else. `execute`'s own description speaks of saving a file into the member's project: that is for a member's file and does not apply to this one. Where the app saved the file to a path, read that file's bytes into the new file, and never copy or move the app's own file. Where the answer carries the bytes instead, decode them into the new file by code, without printing them. Where the app asks the member to let you use a file, wait for their answer; on a no, Step 7.

   Then run `sha256sum '<d>/set.tar.gz'`, or `shasum -a 256 '<d>/set.tar.gz'` where that is the program this computer has. Does the first field equal the answer's `sha256`, character for character? Yes: go on. It differs: run Step 6's command, then go back to Step 1 once; on a second difference, Step 7. Neither program ran, or the file is not there: Step 7.

4. **Unpack it the way the skill asked.**
   - **Into the folder the skill names,** as a first set-up does. Whether that folder counts as empty is the skill's to decide before it sends you here, not this page's. Run `tar -tzf '<d>/set.tar.gz' >/dev/null && tar -xmzf '<d>/set.tar.gz' -C '<the folder>'`. It writes over a file an earlier try left there, so delete nothing first.
   - **Beside the work, to read, compare with or run.** Run `mkdir '<d>/set' && tar -xmzf '<d>/set.tar.gz' -C '<d>/set'`. Never use this way's files to write over a folder that holds the member's work: what changes there is the skill's own step, on the member's approval.

   The paths inside are the set's own. A set of a new folder's files is laid out as that folder is. A set of the plugin's programs keeps the plugin's own paths under `<d>/set`, and for the commands the skill or a tool's page gives, `<d>/set` is then the plugin's root. A program in it needs Node 18 or later: where `node --version` does not print one, Step 7.

   Did the command succeed? Yes: go on. No: Step 7. Where it was the first way, tell the skill the folder may hold part of the set, so its own stop says so.

5. **Hand back to the skill.** Tell it where the files are: the folder, or `<d>/set`. The skill does its work now. Whatever it makes for the member goes where it says, by `standards/conventions.md`, Working Files; nothing the member keeps stays under `<d>`. Come back for Step 6 when the skill has read or run the last thing it needs, and not before.

6. **Remove your copy.** Run `rm -rf '<d>' && [ ! -e '<d>' ] && echo removed`. It must print `removed`. Where it does not, run it once more; where it still does not, tell the member the path, in one sentence, and go on. End every check that something is gone this way, with a command that succeeds when it is gone: an app shows a step as failed when its command fails, and a member then sees a failure on a run that went right.

7. **Where the set did not arrive, stop.** Run Step 6's command if Step 2 printed a path. Write nothing the set would have held: not from memory, not from this page, not from the skill's text. Do not fetch the files another way. Say to the member, word for word, with the skill's own words for what it was doing in place of the bracket:

   "I couldn't get the files I need from Wiser onto this computer, so [your folder isn't set up yet]. Nothing of yours is lost. If your app asked whether I could use a file and you'd like to allow it, open a new chat and ask me again. If it ends the same way, write to support@wisermemory.com and say what you saw."

   Then stop.

## What goes wrong

- **The app saved the file where one of your tools can read it and your commands cannot.** Read its bytes with the tool that can, and write them to `<d>/set.tar.gz` with the tool that reaches `<d>`.
- **Two places can run a command.** Make `<d>`, check the archive and unpack it in the same one, the one that can write where the skill wants the files. A path from one is not a path in the other. Where `mktemp` prints a path directly under `/tmp` on a computer other sessions share, it is still yours alone: `mktemp -d` makes it readable by no one else.
- **The same set is still on this computer from earlier in the chat.** Use it if Step 6 has not run; otherwise start at Step 1. A set from another chat is gone.
- **The skill did not name a set, or did not say which way to unpack.** Do not guess. Stop with Step 7's line, since a guessed set writes the wrong files.

## Success

The files the skill named are where it asked for them, the archive's SHA-256 matched the answer's, and `removed` was printed after the skill finished; the only files this page left in the member's folder are a first set-up's own. Or the member read the one line, `removed` was printed if a directory was made, and nothing was written from memory.
