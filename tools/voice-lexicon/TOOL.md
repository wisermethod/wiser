---
name: voice-lexicon
type: tool
category: documents
description: Find the style markers that recur across a person's writing samples, each with its count and sample ids, and check a draft against them for avoided terms and overused, contradicted or missing markers, as one JSON object
version: 0.1.0
---

# voice-lexicon

One JSON object that counts. It finds the markers a person's writing samples share and checks a draft against them. It judges nothing: the person decides which markers are theirs, and the caller decides what a count means.

## Context

Use it when a voice is built from writing samples and its vocabulary has to rest on counts rather than impressions. Build Voice is its caller; its steps say when each command runs.

Do not use it to decide whether a voice is right, whether a marker is a habit of style or a word of the subject the samples happen to share, or whether a draft is ready. It reports candidates. The person confirms each marker before it enters `voice.md`, and the confirming authority judges the voice. A `pass` of false is a count, not a verdict, and a `pass` of true is an empty count, not an approval.

A marker follows the consistency and distinctiveness principle of forensic authorship work (Coulthard, Applied Linguistics 25(4), 2004): it recurs across the person's own samples, and most writers would not produce it. So the tool reports a short list in four fixed classes, never a ranked list of every word.

Classifier seam: none.

## Quick Start

```bash
node scripts/voice-lexicon.js help
```

Usage text, with nothing installed and nothing configured.

```bash
node scripts/voice-lexicon.js profile --samples /path/to/work/samples.json --output /path/to/work/profile.json
node scripts/voice-lexicon.js check --draft /path/to/work/rewrite.md --profile /path/to/work/profile.json --avoid /path/to/work/avoid.txt
```

The samples file lists each piece of evidence once:

```json
[
  { "id": "E1", "path": "/path/to/sent-mail.txt", "register": "governing", "origin": "own" },
  { "id": "E2", "path": "/path/to/post.md", "register": "governing", "origin": "own" },
  { "id": "E3", "path": "/path/to/talk-notes.txt", "register": "other", "origin": "model-assisted" }
]
```

Run over the three `maren` fixtures in `tests/fixtures/`, listed that way, `profile` reported `"status": "enough"`, 3,660 words and 10 markers: `in practice`, `upshot`, `kerfuffle` and `drifted` in class 1; full forms over contractions, `analyse`, `towards` and `whilst` in class 2; `semicolon` at 11.48 per 1,000 words against a reference of 2 in class 3; and the cake saying with its verbs swapped in class 4. Four of them, with `pairs` cut to two of its twelve rows:

```json
{
  "status": "enough", "words": 3660, "samples": 3, "registers": 2, "origins": 2,
  "markers": [
    { "class": "signature", "marker": "upshot", "basis": "uncommon-word", "count": 9, "samples": ["E1", "E2", "E3"], "spread": 1, "weight": 0.75 },
    { "class": "variant", "marker": "full forms", "over": "contractions", "share": 0.94, "count": 46, "samples": ["E1", "E2", "E3"], "spread": 1, "weight": 0.75,
      "pairs": [ { "contraction": "it's", "full": "it is", "contraction_count": 0, "full_count": 14 }, { "contraction": "can't", "full": "cannot", "contraction_count": 3, "full_count": 2 } ] },
    { "class": "punctuation", "marker": "semicolon", "rate": 11.48, "reference": 2, "count": 42, "samples": ["E1", "E2", "E3"], "spread": 1, "weight": 0.75 },
    { "class": "idiom", "marker": "you can't eat your cake and have it too", "usual": "you can't have your cake and eat it too", "count": 3, "samples": ["E1", "E2", "E3"], "spread": 1, "weight": 0.75 }
  ]
}
```

A 79-word draft checked against that profile, with `basically` in the avoid file (its one contraction is `don't`, a pair this writer always writes in full):

```json
{"status":"checked","words":79,"avoided":[{"term":"basically","count":1}],"overuse":[{"marker":"in practice","count":2}],"contradicted":[{"marker":"full forms","used":"contractions","count":1},{"marker":"towards","used":"toward","count":1}],"missing":false,"pass":false}
```

One JSON object on stdout. Nothing is written but the `--output` file. Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `node scripts/voice-lexicon.js help` | Print usage and exit | No |
| `node scripts/voice-lexicon.js profile --samples <file> [--baseline <file>] [--output <file>]` | Report the markers that recur across the samples | Only the `--output` file, when one is given |
| `node scripts/voice-lexicon.js check --draft <file> --profile <file> [--avoid <file>]` | Report a draft's avoided terms and its overused, contradicted and missing markers | No |

`profile` options:

| Option | Effect | Default |
|--------|--------|---------|
| `--samples <file>` | The samples JSON, in the samples format below. Absolute path | None; required |
| `--baseline <file>` | Word counts, in the baseline format below, used in place of the built-in common-word set to decide which words are uncommon. Absolute path | The built-in set |
| `--output <file>` | Write the profile to this file and print `{ "written": "<path>" }`, the resolved path. Absolute path, held to the destination rules below | The profile goes to stdout |
| `--help`, `-h` | Print this command's usage and exit | Off |

`check` options:

| Option | Effect | Default |
|--------|--------|---------|
| `--draft <file>` | The draft, read as text. Absolute path | None; required |
| `--profile <file>` | A profile JSON that `profile` wrote, or a copy of it holding only the confirmed markers. Absolute path | None; required |
| `--avoid <file>` | Terms to avoid, in the avoid format below. Absolute path | None; nothing is avoided |
| `--help`, `-h` | Print this command's usage and exit | Off |

No command takes `--env`. This tool installs nothing, and `--install` is refused by name. An unknown flag is refused by name before any file is read, including when it sits beside `help` or `--help`. A repeated flag is refused. A flag that needs a value, given none, given an empty or all-space value, or given a value that starts with `-`, is refused. An argument that belongs to no flag is refused. An unknown command is refused by name.

Every path is absolute, the sample paths inside the samples JSON included. A relative path is refused, because it would resolve against whatever directory the caller happened to be in. The path is canonicalized by walking to the deepest existing ancestor, resolving that ancestor, and rejoining the missing tail. A path that cannot be canonicalized is refused. The resolved path is the one opened. Every source must be a file; a missing path or a directory is refused by name. Every source is read as UTF-8 and normalized to NFC; one that is not valid UTF-8 is refused, and a leading byte-order mark is removed. A source that sits inside this tool directory is read; the tool still writes nothing there.

**Size caps.** The files a command reads may total at most 20,000,000 bytes (20 MB), measured before they are read: for `profile` the samples JSON, the baseline and every sample, for `check` the draft, the profile and the avoid file. The samples together, or the draft, may hold at most 2,000,000 words as written. Input over either cap is refused by name before any analysis.

**Destination rules.** `--output` is refused when it resolves inside this tool's directory, compared by path and by device and inode on every ancestor; when the path, as spelled or as resolved, is a symbolic link; when it exists as a directory, or as anything other than a regular file (a device, FIFO or socket); when it is a regular file with more than one hard link, since writing it would change the file under its other names; when its folder does not exist; and when it is the same file as the samples JSON, the baseline, or any sample, because writing there would destroy an input. The file is opened without following a link and checked again through the open descriptor before it is truncated and written. An existing file at that path is overwritten, so the caller passes a new path or, per the constitution's Irreversibles, names what the old file held first.

## Samples format

A JSON array. Each entry is an object with exactly four keys:

| Key | Holds |
|-----|-------|
| `id` | A non-empty string, unique in the file, such as `E1`. Markers cite samples by it |
| `path` | The absolute path of the sample's text file |
| `register` | `governing` (weight 1) or `other` (weight 0.5) |
| `origin` | `own` (weight 1) or `model-assisted` (weight 0.5) |

A sample's weight is its register weight times its origin weight. Refused, naming the entry: a value that is not an array, an entry that is not an object, a key other than those four, a missing or blank `id` or `path`, a `register` or `origin` outside its set, a duplicate `id`, and two entries naming the same file, compared by device and inode, because counting one file twice would fake consistency. A sample the caller rejected is left out of the file, not listed with a low weight.

## Baseline format

A text file of `word<TAB>count` lines, split at CR, LF or CRLF: one word, one tab, one whole number. Blank lines are skipped. The word is lowercased and its curly apostrophes straightened. Refused, naming the line: a line that is not exactly that shape, and a word listed twice. A file whose counts are all zero is refused.

When given, it replaces the built-in common-word set for class 1: a word is uncommon when its count is under 1 per 10,000 of the file's total count.

## Avoid format

A text file, one term per line, split at CR, LF or CRLF. Blank lines are skipped, surrounding spaces are trimmed, each term is normalized to NFC, and a term repeated in any letter case counts once.

A term made only of letters, combining marks, apostrophes, hyphens and the spaces between words is matched as whole words in sequence, ignoring case, in the draft as read below. Any other term, one holding a digit, a period, a slash or another symbol, such as `24/7` or `e.g.`, is matched as a literal string, ignoring case, against the draft as read below but before numbers are removed.

## How text is read

Samples and the draft are read the same way.

- The text is normalized to NFC, line endings are normalized, and curly apostrophes are straightened.
- A fenced code block, three or more backticks or tildes indented at most three spaces and closed by a run at least as long of the same character, is dropped; an unclosed fence runs to the end. Inline code spans are dropped.
- A line whose first non-space character is `>` is dropped as quoted mail.
- A Markdown link `[text](url)`, or image `![text](url)`, reads as its text.
- A quotation inside one paragraph is dropped when it is longer than 8 words, as someone else's words; a shorter one stays. A quotation is a pair of curly double quotation marks, or of straight ones whose opening mark does not follow a letter or a digit, so an inch mark such as `12"` never opens one.
- URLs (from `http://`, `https://` or `www.`) and email addresses are dropped, then numbers, a number range included.
- A word is a run of letters and combining marks, with any inner apostrophes or hyphens kept, so `don't` and `goods-in` are one word each. Matching ignores case. Other markup characters are not words, so the rest of a Markdown file reads as its words.
- A sentence ends at `.`, `!`, `?` or U+2026, with any closing quotation mark or bracket, before whitespace; at a blank line; and before a line that opens a list item or a heading (`-`, `*`, `+`, `#`, or a bullet). A phrase, a variant form and a saying are matched inside one sentence, never across two.

`words` is the count of words left after that reading.

## profile

**Sufficiency.** Fewer than 2 samples or fewer than 1,500 words: `status` is `too-little-text` and `markers` is empty. 1,500 to 2,999 words: `thin`. 3,000 or more: `enough`. `words`, `samples`, `registers` and `origins` are reported whatever the status.

**Consistency, every class.** A marker is reported only when it appears in at least 2 samples and in at least half of the samples listed, with a total count of at least 3 for classes 1 and 2 and at least 2 for classes 3 and 4. Class 1 habit phrases and the folded contraction marker are held to stricter bars, below.

**Spread and weight.** `spread` is the number of samples a marker appears in divided by the number listed. `weight` is the mean weight of the samples it appears in. Weight ranks class 1 and is reported on every marker; no threshold reads it, so a model-assisted or other-register sample can still make a marker consistent.

### Class 1: signature words and phrases

Words, and phrases of 2 to 4 words, of two kinds, each marked by `basis`:

- **`uncommon-word`**: a word not in the common-word set (or under 1 per 10,000 in `--baseline`), or a phrase holding at least one such word, meeting the consistency rule. A word under 2 letters, a possessive of a common word, and a hyphenated word whose parts are all common count as common.
- **`habit-phrase`**: a phrase of 2 to 4 common words, appearing in at least 3 samples (in both, when 2 are listed) and in at least half of them, with at least 4 uses.

Exclusions, so class 1 holds markers rather than everyday English:

- A word or phrase made only of function words (articles, pronouns, prepositions, conjunctions, auxiliaries, and a few adverbs such as `not`, `just`, `very`) is never a marker, and no phrase ends in a function word.
- No phrase starts with a determiner or article (`the a an this that these those my our your his her their its`), so `the upshot` is reported as `upshot`.
- A habit phrase holds at least one word that is neither a function word nor a light word. Light words are a closed list of about 290 everyday verbs, adjectives, adverbs, quantifiers and filler nouns, such as `want get make take first last good new lot few thing way time`, so `want to`, `a few` and `the first` never qualify.
- A two-word habit phrase that opens on a function word counts only when its other word never appears outside it, so `in practice` stays and `to build` goes.
- A habit phrase that is always the start of a longer excluded phrase with the same count is dropped, so `in order` goes with `in order to`.
- A word or phrase that is a form in `variants.json`, and a phrase holding one, read by its hyphen parts as class 2 reads it, is left to class 2.
- An `uncommon-word` phrase is reported only when each uncommon word in it never appears outside it, and never when its one uncommon word stands with function words alone; otherwise the bare word stands for it (`brouhaha`, never `of the brouhaha`).
- A name is never an uncommon word, and a habit phrase never holds one. A name is a word written with a capital in every mid-sentence use, with at least one piece of capital evidence: a capitalized mid-sentence use, or the word standing alone, capitalized, on its own line or as a whole sentence, as a sign-off does.
- A phrase contained in a longer reported phrase with the same count is dropped in the longer one's favour.

At most 15 are reported, ranked by spread times weight times count, then by count, then alphabetically.

### Class 2: variant choices

The pairs in `variants.json`, of three kinds: `spelling` (such as `analyse` and `analyze`, `towards` and `toward`, `whilst` and `while`), `dated` (such as `clew` and `clue`), and `contraction` (such as `don't` and `do not`). Forms are matched as whole word sequences, so `do not` matches as written and `toward` never matches inside `towards`. A hyphenated word counts by its parts unless it is itself a form, such as `e-mail`, so `well-analysed` is a use of `analysed`.

**Spelling and dated pairs** are reported one by one. A preference is reported when the pair is used at least 3 times in all, the marked form (the pair's `a`: the British, dated, or rarer spelling) takes at least 80% of those uses, and it meets the consistency rule. Preferring the ordinary form marks nobody, so it is never reported. `over` is the form passed over, and `share` is the preferred form's part of the pair's uses.

**Contraction pairs** are folded into one marker. Their uses are summed across every pair, and the marker is reported as `"marker": "full forms", "over": "contractions"`, or the reverse, when the pairs are used at least 5 times in all, one side takes at least 80% of those uses, and that side meets the consistency rule. `share` is that side's part of the uses, and `pairs` lists every contraction pair used at least once, each `{ contraction, full, contraction_count, full_count }`.

### Class 3: punctuation and format habits

Eleven habits, each counted over the text as read above:

| `marker` | Counts |
|----------|--------|
| `em_dash` | U+2014 |
| `en_dash` | U+2013 |
| `double_hyphen` | Exactly two hyphens in a row |
| `semicolon` | `;` |
| `ellipsis` | A run of three or more periods, counted once, or each U+2026 |
| `exclamation` | A run of `!`; a run counts once |
| `parenthesis` | Each opening `(` |
| `serial_comma` | `, and` or `, or` closing a run of at least three items, each of 1 to 4 words, separated by commas, in one sentence. The first item is read from the last semicolon, colon, parenthesis or U+2014 before it; the last runs to the next such mark or the sentence's end |
| `initial_and`, `initial_but`, `initial_so` | Sentences whose first word is that word |

`rate` is the count per 1,000 words over all the samples, and `reference` is the general-writing rate from `punctuation-reference.json`. A habit is reported when its rate is at least double the reference or at most half of it, and it meets the consistency rule.

### Class 4: altered sayings

The sayings in `idioms.json`, each with its usual form, any further accepted forms in `also` (such as `the early bird gets the worm`), and 2 to 4 keywords. Within one sentence, the shortest span of at most 12 words that holds every keyword, a keyword with `'s` included, is a use. Its words from the first keyword to the last are compared with each form's words between the same keywords, with the possessive and personal pronouns `my your his her its our their me you him us them` filling one slot, so `eat their cake` and `eat your cake` compare alike.

A use that matches the usual form or any `also` form is not a marker. One with the same words in another order, or with one word added, dropped or changed, against any form, is an altered form; a span further from every form is not counted. Altered uses of one saying in one form, pronouns as one slot, are counted together and held to the consistency rule. `marker` holds the words most often used for it, widened over the neighbouring words that match the form, and `usual` holds the usual form.

## check

The draft is read as How text is read says. `avoided` lists each `--avoid` term found, with its count, on every draft.

A draft under 50 words gets `status` `too-little-text`: `avoided` is still reported, `overuse`, `contradicted` and `missing` are `null`, and `pass` is false. Otherwise `status` is `checked`, and:

- **`overuse`**: a signature marker the draft uses at least twice, and either more than once per 75 words of the draft or at more than three times its density in the profile (its count there over the profile's `words`).
- **`contradicted`**: a spelling or dated marker whose passed-over form appears in the draft, read by hyphen parts as class 2 reads it; for `full forms` over `contractions`, any contraction of the contraction pairs, and for the reverse, any full form, except a pair whose own row in the marker's `pairs` shows the writer using that form at least as often as the other (a writer who always writes `can't` beside `do not` is not contradicted by `can't`); a pair the profile never saw, and every pair of a profile without `pairs`, falls under the folded preference. `used` names the passed-over form, or `contractions` or `full forms`, and `count` its uses.
- **`missing`**: true when the profile holds at least 3 signature and variant markers between them and the draft uses none of them. A variant marker counts as used when its preferred form appears, any full form or any contraction for the folded marker.
- **`pass`**: true only when `avoided`, `overuse` and `contradicted` are empty and `missing` is false.

`check` reads whatever markers the profile file holds, so a caller may pass a copy holding only the markers the person confirmed; Build Voice passes one. The copy keeps `words` and each kept marker as `profile` wrote it, because `overuse` reads both. The draft is tested against signature and variant markers only; the profile's punctuation and idiom markers are carried in it and not checked.

A `--profile` file is refused when it is not a JSON object, has no numeric `words`, has no `markers` array, or holds a marker with a class outside the four, no marker text, a signature marker with no `count`, or a variant marker with no `over`.

## Data

`data/` holds four files, each written for this tool, copying, sampling or reordering no published dataset, corpus, frequency list or ranking. `data/SOURCE.md` states how each was written and what it holds.

| File | Holds | Read by |
|------|-------|---------|
| `common-words.txt` | An unranked, alphabetical set of everyday English words, one per line | Class 1, absent `--baseline` |
| `variants.json` | Variant pairs, each `{ "a", "b", "kind" }`, `a` being the marked form or the contraction | Class 2, class 1's exclusion of variant forms, and `check` |
| `idioms.json` | Sayings, each `{ "usual", "keywords" }`, some with `also` | Class 4 |
| `punctuation-reference.json` | One reference rate per 1,000 words for each class 3 habit | Class 3 |

The function words, light words and pronouns are closed lists in `scripts/voice-lexicon-core.js`, written for this tool too. The data is located from the script's own directory, never from the working directory. A data file that is missing or malformed stops the run with exit 1, naming the file.

## Limits

- **Words the set lacks can appear.** When the samples share a subject, words of that subject outside the common-word set are reported as signature words, and so is any ordinary word the set happens to lack, as `drifted` was in the fixture run above. The tool cannot tell a word of style from a word of subject; the person rejects those at confirmation.
- **Habit phrases have no general-English baseline.** A habit phrase is judged by how consistently this person uses it, never by how often other writers do, so an everyday pairing that passes the exclusions can still be reported.
- **Punctuation references are estimates**, written for this tool rather than measured from a corpus, so a class 3 marker says the rate is far from a rough norm, not from a measured one.
- **A habit of never using a mark is not reported.** The consistency rule needs the mark in at least 2 samples, so a rarely used mark can be reported and an absent one cannot.
- **English only.** The common words, variants and sayings are English.

## Script Contract

Every script in this tool follows `system/templates/Script Contract.md`; what a user meets when running it is `tools/RUNNING.md`. Node built-ins cover the whole tool, so the contract's dependency-install, `--env`, and system-dependency clauses have nothing to bind here and the tool carries no Dependencies section. No command checks for a package or runs an install. No command takes `--env`, and `--install` is refused by name. Nothing is written but the `--output` file the caller names. The sections above state what each command does; the contract states how the script behaves getting there.

## Output

One JSON object on stdout, exit 0; `check` exits 0 whether or not `pass` is true. A refusal or an unknown flag prints to stderr, leaves stdout empty, and exits 1. Numbers that are not counts are rounded to 2 places.

`profile` prints the profile, or with `--output` prints `{ "written": "<path>" }` and writes the profile there, indented two spaces, with a closing newline. The profile carries:

| Field | Carries |
|-------|---------|
| `status` | `enough`, `thin`, or `too-little-text` |
| `words` | Words read across all samples |
| `samples` | How many samples were listed |
| `registers` | How many distinct registers they carry |
| `origins` | How many distinct origins they carry |
| `markers` | Class 1 in rank order, then class 2 by count, then class 3 in the table's order, then class 4 by count. Empty when `status` is `too-little-text` |

Every marker carries:

| Field | Carries |
|-------|---------|
| `class` | `signature`, `variant`, `punctuation`, or `idiom` |
| `marker` | The word or phrase, the preferred form, `full forms` or `contractions`, the habit's key, or the altered saying as written |
| `count` | Uses across all samples |
| `samples` | The ids of the samples it appears in, in `--samples` order |
| `spread` | Those samples over the samples listed |
| `weight` | The mean weight of those samples |

A class adds its own fields: `signature` adds `basis` (`uncommon-word` or `habit-phrase`); `variant` adds `over` and `share`, and the folded contraction marker adds `pairs`, each `{ contraction, full, contraction_count, full_count }`; `punctuation` adds `rate` and `reference`; `idiom` adds `usual`.

`check` carries:

| Field | Carries |
|-------|---------|
| `status` | `checked` or `too-little-text` |
| `words` | Words read in the draft |
| `avoided` | `{ term, count }` for each avoid term found, the term as the file spells it |
| `overuse` | `{ marker, count }` for each overused signature marker; `null` when `too-little-text` |
| `contradicted` | `{ marker, used, count }` for each variant marker used the other way; `null` when `too-little-text` |
| `missing` | True when no signature or variant marker appears where the profile has at least 3; `null` when `too-little-text` |
| `pass` | True only on the empty count above |

## Troubleshooting

| What you see | What to do |
|--------------|------------|
| `--install is refused` or `unknown option "--env"` | Drop the flag. No command takes `--env`, and the tool installs nothing |
| `unknown command`, `unknown option`, `unexpected argument`, `is required`, `needs a value`, `given an empty value`, or `given more than once` | Read the command's `--help` and pass each flag it needs once, with its value |
| `must be an absolute path` | Pass an absolute path, in the samples JSON too. A relative one is refused on purpose |
| `names no file` or `is not a file` | Every source is a readable file |
| `is not a JSON array`, `--samples entry`, `appears more than once`, or `are the same file` | Fix the samples file: an array of `{ "id", "path", "register", "origin" }`, each id and each file once |
| `is not "word<TAB>count"`, `more than once`, or `holds no counts` in a `--baseline` message | One word, a tab and a whole number per line, each word once |
| `inside the voice-lexicon tool directory`, `is a symbolic link`, `is a directory`, `not a regular file`, `hard links`, `folder that does not exist`, or `would destroy it` | Pass `--output` as a new file in a work directory of the owning root |
| `over the 20 MB` or `over 2,000,000 words` | Pass fewer or shorter files |
| `is not a voice-lexicon profile` | Pass the JSON that `profile` wrote, or a copy of it that keeps `words` and the confirmed markers as written |
| `is not valid UTF-8` | Save the file as UTF-8 text |
| `is not valid JSON`, `could not be read`, or `could not be written` | The message names the file. Fix its contents, or pass a path this account can read or write |
| `the tool's own data file` | This copy of the plugin is damaged. Report the file the message names and stop; a session never writes under the plugin (the constitution's Irreversibles) |
| `status` is `too-little-text` | For `profile`, add samples until there are at least 2 and 1,500 words; for `check`, check a draft of at least 50 words |
| `pass` is false and the process exited 0 | That is a successful run. Read the lists. Exit 1 means the run could not check |

## Success

- `node scripts/voice-lexicon.js help`, and each command's `--help`, exits 0 with nothing installed and names that command's flags.
- `profile` exits 0 with one JSON object; every marker in it meets its class's consistency rule, and `markers` is empty when `status` is `too-little-text`.
- `check` exits 0 with one JSON object whether or not `pass` is true, and `pass` is true only when its lists are empty and `missing` is false.
- A bad path or destination, a malformed samples, baseline or profile file, an input over a cap, an unknown flag, or `--install` exits 1 with stdout empty, and the message names the cause and the fix.
- Nothing is written but the `--output` file, and nothing is installed.
