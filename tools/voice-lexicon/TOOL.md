---
name: voice-lexicon
type: tool
category: documents
description: Find the style markers that recur across a person's writing samples, each with its count and sample ids, and the rhythm and stance ranges they keep, and check a draft against them for avoided terms, contradicted markers and the dose of signature markers and sayings, with rhythm and stance outside those ranges and missing markers as advice, as one JSON object
version: 0.2.1
---

# voice-lexicon

One JSON object that counts. It finds the markers a person's writing samples share and the ranges of rhythm and stance they keep, and checks a draft against them. It judges nothing: the person decides which markers and ranges are theirs, and the caller decides what a count means.

## Context

Use it when a voice is built from writing samples and its vocabulary, rhythm and stance have to rest on counts rather than impressions. Build Voice is its caller; its steps say when each command runs.

Do not use it to decide whether a voice is right, whether a marker is a habit of style or a word of the subject the samples happen to share, or whether a draft is ready, and do not use it to say who wrote a draft. It reports candidates. The person confirms each marker before it enters `voice.md`, and the confirming authority judges the voice. A `pass` of false is a count, not a verdict, and a `pass` of true is an empty count, not an approval.

A marker follows the consistency and distinctiveness principle of forensic authorship work (Coulthard, Applied Linguistics 25(4), 2004): it recurs across the person's own samples, and most writers would not produce it. So the tool reports a short list in four fixed classes, never a ranked list of every word.

The aim is writing that is better than the person's usual and still theirs, and the research sets how far each measure reaches. A marker carries identity by being there at all (Coulthard, above), so `check` allows about one per 500 words, and the same marker once below 2,000 words, since a repeat caricatures. Mosteller and Wallace (1963, 1964) told Hamilton from Madison in the Federalist papers by small words used every time the occasion came up, such as `upon`, and `whilst` against `while`, and the two men's mean sentence lengths were nearly the same; so a variant choice is not dosed, and rhythm guards a draft's quality and does not identify its writer. Burrows' Delta (Literary and Linguistic Computing 17(3), 2002) attributes a text by many word rates against a reference set, and Eder (Digital Scholarship in the Humanities 30, 2015) found attribution unstable below a few thousand words; so a short draft cannot be attributed, only compared with the person's own variation at the same length, which is why ranges are measured over 500-word chunks, judged with a noise allowance, and only advise. Pronoun rates are stable within a person (Pennebaker and King, Journal of Personality and Social Psychology 77, 1999), so the mix of I, we and you is a range; Hyland's stance categories (Discourse Studies 7(2), 2005) make hedges and boosters two more; and sentence length marks a writer only weakly (Yule, Biometrika 30, 1939), so three rhythm measures are guardrails.

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

Run over the three `maren` fixtures in `tests/fixtures/`, listed that way, `profile` reported `"status": "enough"`, 3,660 words, 11 markers and 7 chunks. The markers: `in practice`, `upshot`, `kerfuffle`, `year ago` (with `years ago` folded in) and `drifted` in class 1; full forms over contractions, `analyse`, `towards` and `whilst` in class 2; `semicolon` at 11.48 per 1,000 words against a reference of 2 in class 3; and the cake saying with its verbs swapped in class 4. Trimmed below to five of the markers, `pairs` to two of its twelve rows, and `ranges` to four of its nine features:

```json
{
  "status": "enough", "words": 3660, "samples": 3, "registers": 2, "origins": 2,
  "markers": [
    { "class": "signature", "marker": "upshot", "basis": "uncommon-word", "count": 9, "samples": ["E1", "E2", "E3"], "spread": 1, "weight": 0.75 },
    { "class": "signature", "marker": "year ago", "basis": "habit-phrase", "count": 4, "samples": ["E1", "E2", "E3"], "spread": 1, "weight": 0.75, "forms": ["year ago", "years ago"] },
    { "class": "variant", "marker": "full forms", "over": "contractions", "share": 0.94, "count": 46, "samples": ["E1", "E2", "E3"], "spread": 1, "weight": 0.75,
      "pairs": [ { "contraction": "it's", "full": "it is", "contraction_count": 0, "full_count": 14 }, { "contraction": "can't", "full": "cannot", "contraction_count": 3, "full_count": 2 } ] },
    { "class": "punctuation", "marker": "semicolon", "rate": 11.48, "reference": 2, "count": 42, "samples": ["E1", "E2", "E3"], "spread": 1, "weight": 0.75 },
    { "class": "idiom", "marker": "you can't eat your cake and have it too", "usual": "you can't have your cake and eat it too", "count": 3, "samples": ["E1", "E2", "E3"], "spread": 1, "weight": 0.75 }
  ],
  "ranges": { "chunk_words": 500, "chunks": 7, "features": {
    "sentence_mean": { "low": 17.74, "q1": null, "median": 19.11, "q3": null, "high": 20.24 },
    "first_singular": { "low": 11.59, "q1": null, "median": 27.67, "q3": null, "high": 50.45 },
    "hedges": { "low": 0, "q1": null, "median": 2.97, "q3": null, "high": 3.98 },
    "semicolon": { "low": 5.81, "q1": null, "median": 11.87, "q3": null, "high": 16 }
  } }
}
```

Seven chunks are fewer than eight, so `q1` and `q3` are `null`.

A 534-word draft checked against that profile, with `basically` and `going forward` in the avoid file, written to show each field: `upshot` twice and `in practice` once, `toward` and one `don't`, and far more hedging than this writer's:

```json
{"status":"checked","words":534,"short":false,"avoided":[{"term":"basically","count":1}],"dosage":{"budget":1,"used":3,"over":true,"uses":[{"marker":"upshot","count":2},{"marker":"in practice","count":1}],"repeated":[{"marker":"upshot","count":2,"cap":1}]},"contradicted":[{"marker":"full forms","used":"contractions","count":1},{"marker":"towards","used":"toward","count":1}],"ranges":[{"feature":"hedges","value":16.85,"low":0,"high":3.98,"side":"above"}],"missing":false,"pass":false}
```

Its 3 marker uses are over a budget of 1, and `upshot` is past its cap of 1, so `pass` is false on the dose as well as on `basically` and the two contradictions. The hedges are advice: on a draft otherwise clean they would leave `pass` true.

One JSON object on stdout. Nothing is written but the `--output` file. Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `node scripts/voice-lexicon.js help` | Print usage and exit | No |
| `node scripts/voice-lexicon.js profile --samples <file> [--baseline <file>] [--output <file>]` | Report the markers that recur across the samples, and the ranges of rhythm and stance they keep | Only the `--output` file, when one is given |
| `node scripts/voice-lexicon.js check --draft <file> --profile <file> [--avoid <file>]` | Report a draft's avoided terms, its contradicted markers and its dose of signature markers and sayings, and, as advice, its rhythm and stance outside the profile's ranges and whether it is missing every marker | No |

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
| `--profile <file>` | A profile JSON that `profile` wrote, or a confirmed copy of it, as check says. Absolute path | None; required |
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
- A sentence ends at `.`, `!`, `?` or U+2026, with any closing quotation mark or bracket, before whitespace; at a blank line; and before a line that opens a list item or a heading (`-`, `*`, `+`, `#`, or a bullet). A phrase, a variant form, a saying and a stance entry are matched inside one sentence, never across two.

`words` is the count of words left after that reading.

## profile

**Sufficiency.** Fewer than 2 samples or fewer than 1,500 words: `status` is `too-little-text`, `markers` is empty and `ranges` is `null`. 1,500 to 2,999 words: `thin`. 3,000 or more: `enough`. `words`, `samples`, `registers` and `origins` are reported whatever the status.

**Consistency, every class.** A marker is reported only when it appears in at least 2 samples and in at least half of the samples listed, with a total count of at least 3 for classes 1 and 2 and at least 2 for classes 3 and 4. Class 1 habit phrases and the folded contraction marker are held to stricter bars, below, and class 1 is judged on folded plurals.

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

**Plural folding.** Before class 1 counts, a word ending in `s`, `es` or `ies` folds into its singular when that singular also occurs as a word in the samples and is not a function word. The singular is tried in this order, and the first that occurs is taken: `ies` to `y`, then `s` dropped, then `es` dropped, so `notes` folds into `note` and never into `not`. Never folded: a function word, a word of fewer than 4 letters, a word ending in `ss`, `us` or `ics`, a form in `variants.json` (`towards` stays apart from `toward`), and `news goods means series species clothes`. Counts and consistency are judged on the folded words. A folded word is common when any of its forms is, and is a light word or a function word only when every one of its forms is one, so `big numbers` stays a habit phrase although `number` is light. A marker is reported as its most frequent surface phrase, and `forms` lists every surface phrase seen for it, by count and then alphabetically, when there are two or more. Classes 2 to 4 count words as written.

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
| `serial_comma` | `, and` or `, or` closing a run of at least three items, each of 1 to 4 words, separated by commas, in one sentence. The first item is read from the last semicolon, colon, parenthesis or U+2014 before it; the last runs to the next such mark or the sentence's end. The run is not counted when the item just before the `, and` or `, or` opens on `i we you they he she it one`, or on a contraction of one of the first seven (`i'm`, `it's`, `we're`, `they'd`), or is one of 46 parenthetical asides listed in the code, such as `of course`, `in fact`, `to be fair`, `bless her` or `however`, so "The fence, we hope, and the shed" is not a list |
| `initial_and`, `initial_but`, `initial_so` | Sentences whose first word is that word |

`rate` is the count per 1,000 words over all the samples, and `reference` is the general-writing rate from `punctuation-reference.json`. A habit is reported when its rate is at least double the reference or at most half of it, and it meets the consistency rule.

### Class 4: altered sayings

The sayings in `idioms.json`, each with its usual form, any further accepted forms in `also` (such as `the early bird gets the worm`), and 2 to 4 keywords. Within one sentence, the shortest span of at most 12 words that holds every keyword, a keyword with `'s` included, is a use. Its words from the first keyword to the last are compared with each form's words between the same keywords, with the possessive and personal pronouns `my your his her its our their me you him us them` filling one slot, so `eat their cake` and `eat your cake` compare alike.

A use that matches the usual form or any `also` form is not a marker. One with the same words in another order, or with one word added, dropped or changed, against any form, is an altered form; a span further from every form is not counted. Altered uses of one saying in one form, pronouns as one slot, are counted together and held to the consistency rule. `marker` holds the words most often used for it, widened over the neighbouring words that match the form, and `usual` holds the usual form.

### Ranges: rhythm and stance

A range is the person's own variation, measured at about a draft's length, so each sample is cut into chunks and every feature is measured per chunk.

**Chunks.** Each sample's sentences, in order, are added to a chunk until it holds at least 500 words, which closes it. A trailing piece of 250 words or more is its own chunk; a shorter one that holds any words joins the chunk before it, so no word of a close, where a writer often turns to the reader, is left out. A sample under 250 words makes no chunk. Chunks never cross samples. `ranges` is `null` when `status` is `too-little-text` or fewer than 3 chunks result.

**Features.** The first three are rhythm, the next five stance:

| Feature | Measured in a chunk | Unit |
|---------|---------------------|------|
| `sentence_mean` | Words per sentence | Words |
| `sentence_cv` | The population standard deviation of sentence length over its mean; flat prose is low | A ratio |
| `long_sentences` | Sentences of 30 words or more | Per 100 sentences |
| `first_singular` | `i me my mine myself i'm i've i'd i'll` | Per 1,000 words |
| `first_plural` | `we us our ours ourselves we're we've we'd we'll` | Per 1,000 words |
| `second_person` | `you your yours yourself yourselves you're you've you'd you'll` | Per 1,000 words |
| `hedges` | Entries of `hedges` in `data/stance.json` | Per 1,000 words |
| `boosters` | Entries of `boosters` in `data/stance.json` | Per 1,000 words |
| A class 3 key, such as `semicolon` | For each punctuation habit this profile reports as a marker, its count as class 3 counts it | Per 1,000 words |

A sentence with no words is left out of the rhythm. Pronoun forms are matched as words, ignoring case. A stance entry is matched as words in sequence: scanning each sentence from its first word, the longest entry of either list that starts at a word is taken, and the words it covers are not matched again, so `it seems to` counts once. Every use of an entry counts, whatever its sense, and `kind of`, `sort of` and `tend to` often carry another ("what kind of tree", "tend to the orchard"), so the hedge and booster rates are rough measures of stance.

**Bands.** Each feature's band is taken over its chunk values: `low` is the least, `high` the greatest, and `median`, `q1` and `q3` are the 50th, 25th and 75th percentiles, by linear interpolation at position `(n - 1) * p` of the sorted values. `q1` and `q3` are reported from 8 chunks and are `null` below that, so a caller never narrows to a quartile that a few chunks cannot support. Every value is rounded to 2 places.

## check

The draft is read as How text is read says. `avoided` lists each `--avoid` term found, with its count, on every draft. `short` is true under 250 words.

A draft under 50 words gets `status` `too-little-text`: `avoided` and `short` are still reported, `dosage`, `contradicted`, `ranges` and `missing` are `null`, and `pass` is false. Otherwise `status` is `checked`, and:

- **`dosage`**: signature markers and altered sayings, counted together against a budget, because a marker carries identity by appearing at all. `budget` is `max(1, floor(words / 500))`, about one use per 500 words, so 1 below 1,000 words and in every short draft. Each marker's cap is `max(1, floor(words / 1000))`, so each marker may appear once below 2,000 words. A signature marker's uses are the sum over its `forms` when the profile lists them, otherwise over its `marker`; an altered saying's are its `marker`; each is matched as words in sequence inside one sentence. Each marker is counted on its own, so where two overlap in one passage, as a word and a longer marker phrase holding it can, each use counts toward `used`. `used` is the total and `over` is `used > budget`. `uses` lists each marker used at least once as `{ marker, count }`, by count and then alphabetically, and `repeated` lists, in the same order, each one above its cap as `{ marker, count, cap }`. Variant markers are not dosed: they are the person's choice every time the word comes up, and `contradicted` holds them to it. Punctuation habits are judged as ranges instead.
- **`contradicted`**: a spelling or dated marker whose passed-over form appears in the draft, read by hyphen parts as class 2 reads it; for `full forms` over `contractions`, any contraction of the contraction pairs, and for the reverse, any full form, except a pair whose own row in the marker's `pairs` shows the writer using that form at least as often as the other (a writer who always writes `can't` beside `do not` is not contradicted by `can't`); a pair the profile never saw, and every pair of a profile without `pairs`, falls under the folded preference. `used` names the passed-over form, or `contractions` or `full forms`, and `count` its uses.
- **`ranges`**: advice. Each feature of the draft outside the profile's band, beyond the noise a draft of its length carries, as `{ feature, value, low, high, side }`: `value` is the draft's measure in the feature's unit, rounded to 2 places; `low` and `high` are the band as the profile holds it; `side` is `below` or `above`. For a count feature (the pronouns, hedges, boosters, long sentences and a punctuation band), `L` and `H` are the band's `low` and `high` scaled to the draft, by its words / 1000, or for `long_sentences` by its sentences / 100: it is `below` when `L - 2 * sqrt(L)` is above 0 and the draft's count is under it, and `above` when the count is over `H + 2 * sqrt(max(H, 1))`. `sentence_mean` is outside when it lies beyond `2 * sd / sqrt(n)` of the band, and `sentence_cv` beyond `2 * cv / sqrt(2 * n)`, where `sd`, `cv` and `n`, the sentence count, are the draft's own. A punctuation band is judged only when the profile also holds that habit as a class 3 marker. The list follows the features table's order, then the class 3 table's. It is `[]` when every feature is inside, and `null` when the draft is short or the profile has no `ranges` or a `null` one.
- **`missing`**: information only. `null` under 500 words; otherwise true when the profile holds at least 3 signature and variant markers between them and the draft uses none of them. A variant marker counts as used when its preferred form appears, any full form or any contraction for the folded marker. It is never a reason to insert a marker.
- **`pass`**: true only when `avoided`, `contradicted` and `dosage.repeated` are empty and `dosage.over` is false. It never reads `ranges` or `missing`.

**The confirmed copy.** `check` reads whatever markers and ranges the profile file holds, so a caller may pass a copy holding only what the person confirmed; Build Voice writes one. The copy keeps `words` and each kept marker as `profile` wrote it, a signature marker's `count` and `forms` included: the validation below needs `words` and `count`, and `forms` is how a folded plural is counted. `check` judges a range only by its `low` and `high`, so a caller may narrow a band, as Build Voice does for a range the person chose to polish away. A feature in the copy may also carry three keys `check` validates and never reads: `decision`, `"keep"` or `"polish"`; `polish`, the side polished away, `"high"` or `"low"`; and `measured`, `{ "low": n, "high": n }`, the band as `profile` wrote it.

A `--profile` file is refused when it is not a JSON object, has no numeric `words`, has no `markers` array, or holds a marker with a class outside the four, no marker text, a signature marker with no `count` or with `forms` that is not a non-empty list of non-empty strings, or a variant marker with no `over`. Its `ranges` may be absent or `null`. Otherwise it is refused, naming the feature, when it is not an object with a `features` object; when a feature's name is outside the eight features and the eleven class 3 keys; when a feature is not an object with numeric `low`, `median` and `high` and with `q1` and `q3` each a number or `null`; when any of those five is negative, since every feature is a rate, a ratio or a mean; when a feature holds a key outside `low q1 median q3 high decision polish measured`; when its `low` is above its `high`; when `decision` or `polish` holds another word; or when `measured` is not an object of exactly a numeric `low` and `high`, neither negative. No other order is checked, because a narrowed copy holds a `high` below its `median` on purpose.

## Data

`data/` holds five files, each written for this tool, copying, sampling or reordering no published dataset, corpus, word list, frequency list or ranking. `data/SOURCE.md` states how each was written and what it holds.

| File | Holds | Read by |
|------|-------|---------|
| `common-words.txt` | An unranked, alphabetical set of everyday English words, one per line | Class 1, absent `--baseline` |
| `variants.json` | Variant pairs, each `{ "a", "b", "kind" }`, `a` being the marked form or the contraction | Class 2, class 1's exclusion of variant forms and plural folding, and `check` |
| `idioms.json` | Sayings, each `{ "usual", "keywords" }`, some with `also` | Class 4 |
| `punctuation-reference.json` | One reference rate per 1,000 words for each class 3 habit | Class 3 |
| `stance.json` | Two lists, `hedges` (40 entries) and `boosters` (25), each entry a lowercase word or phrase | The `hedges` and `boosters` range features |

The function words, light words, pronoun forms, plural-folding exceptions and serial-comma asides are closed lists in `scripts/voice-lexicon-core.js`, written for this tool too. The data is located from the script's own directory, never from the working directory. A data file that is missing or malformed stops the run with exit 1, naming the file.

## Limits

- **Words the set lacks can appear.** When the samples share a subject, words of that subject outside the common-word set are reported as signature words, and so is any ordinary word the set happens to lack, as `drifted` was in the fixture run above. The tool cannot tell a word of style from a word of subject; the person rejects those at confirmation.
- **Habit phrases have no general-English baseline.** A habit phrase is judged by how consistently this person uses it, never by how often other writers do, so an everyday pairing that passes the exclusions can still be reported.
- **Plural folding is regular plurals only.** Only a final `s`, `es` or `ies` folds, so `children` stays apart from `child`, and a plural whose singular never appears in the samples stays as written. Folding can also lift an everyday phrase over the habit bar: neither `year ago` nor `years ago` reached it alone in the run above, and together they did.
- **Rhythm guards and does not identify.** Two writers can keep the same rhythm: the `maren` and `dale` fixtures' `sentence_mean` bands, 17.74 to 20.24 and 17.98 to 19.62 words, overlap, while their `first_plural` bands, 0 to 26.16 and 40.28 to 50.08 per 1,000 words, do not. A rhythm range says a draft runs flatter, longer or more rambling than the person's own writing, never that someone else wrote it.
- **Ranges from few chunks are rough.** A band runs from the least chunk value to the greatest, so a band from 3 to 7 chunks has no quartiles and moves with each sample added, and a thin profile can fall short of the 3 chunks ranges need. The noise allowance keeps a draft of a few hundred words from being reported for chance, so a short draft has to stray far before it is. Ranges advise for these reasons and never set `pass`.
- **Ranges pool every sample, whatever its register.** A band is drawn from the chunks of every sample listed, `governing` and `other` alike, and `register` weights markers only. So a band can describe a register the caller's outputs do not use; the caller reads it knowing which samples it came from.
- **Stance lists are English and blind to topic.** They match words, not senses: `likely` in a forecast reads as a hedge, and `in fact` reads as a booster wherever it stands.
- **Punctuation references are estimates**, written for this tool rather than measured from a corpus, so a class 3 marker says the rate is far from a rough norm, not from a measured one.
- **A habit of never using a mark is not reported.** The consistency rule needs the mark in at least 2 samples, so a rarely used mark can be reported and an absent one cannot.
- **English only.** The common words, variants, sayings and pronoun forms are English.

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
| `ranges` | `{ chunk_words, chunks, features }`: `chunk_words` is 500, `chunks` how many were measured, and `features` maps each feature, then each class 3 key the markers hold, to `{ low, q1, median, q3, high }`. `null` when `status` is `too-little-text` or there are fewer than 3 chunks |

Every marker carries:

| Field | Carries |
|-------|---------|
| `class` | `signature`, `variant`, `punctuation`, or `idiom` |
| `marker` | The word or phrase, the preferred form, `full forms` or `contractions`, the habit's key, or the altered saying as written |
| `count` | Uses across all samples |
| `samples` | The ids of the samples it appears in, in `--samples` order |
| `spread` | Those samples over the samples listed |
| `weight` | The mean weight of those samples |

A class adds its own fields: `signature` adds `basis` (`uncommon-word` or `habit-phrase`), and `forms` when plural folding joined two or more surface phrases; `variant` adds `over` and `share`, and the folded contraction marker adds `pairs`, each `{ contraction, full, contraction_count, full_count }`; `punctuation` adds `rate` and `reference`; `idiom` adds `usual`.

`check` carries, in this order:

| Field | Carries |
|-------|---------|
| `status` | `checked` or `too-little-text` |
| `words` | Words read in the draft |
| `short` | True under 250 words |
| `avoided` | `{ term, count }` for each avoid term found, the term as the file spells it |
| `dosage` | `{ budget, used, over, uses, repeated }`, with `uses` holding `{ marker, count }` and `repeated` holding `{ marker, count, cap }`; `null` when `too-little-text` |
| `contradicted` | `{ marker, used, count }` for each variant marker used the other way; `null` when `too-little-text` |
| `ranges` | Advice: `{ feature, value, low, high, side }` for each feature outside its band, `[]` when none is; `null` when `too-little-text` or short, or when the profile has no ranges |
| `missing` | Information: true when no signature or variant marker appears where the profile has at least 3; `null` under 500 words |
| `pass` | True only when `avoided`, `contradicted` and `dosage.repeated` are empty and `dosage.over` is false |

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
| `is not a voice-lexicon profile` | Pass the JSON that `profile` wrote, or a confirmed copy that keeps `words` and each kept marker as written, with its `count` and `forms`. The message goes on to name the reason; the rows below cover those in `ranges` and `forms` |
| `its ranges is not an object`, `has no features object`, `is not an object of low, q1, median, q3 and high`, `has no numeric low`, `has no numeric median`, `has no numeric high`, or `neither a number nor null` | Keep `ranges` as `profile` wrote it, or set it to `null`: `features` maps each feature to `{ low, q1, median, q3, high }`, numbers, with `q1` and `q3` a number or `null` |
| `names the feature` | A feature is one of the eight in the features table or one of the eleven class 3 keys. Remove or correct the one named |
| `has the key` | A feature holds only `low`, `q1`, `median`, `q3`, `high`, `decision`, `polish` and `measured`. Remove the key named |
| `above high` | A narrowed band still keeps `low` at or below `high`. Narrow only the side the person polished away |
| `has a negative` | No band value, and no `measured` value, is below zero. Restore the number `profile` wrote, or the target the caller meant |
| `has decision` | `decision` is `"keep"` or `"polish"` |
| `has polish` | `polish` names the side polished away, `"high"` or `"low"` |
| `has a measured` or `measured key` | `measured` is `{ "low": n, "high": n }`, the band as `profile` wrote it, and nothing else |
| `has forms that are not a non-empty list of phrases` | Keep a signature marker's `forms` as `profile` wrote it, or remove the key |
| `is not valid UTF-8` | Save the file as UTF-8 text |
| `is not valid JSON`, `could not be read`, or `could not be written` | The message names the file. Fix its contents, or pass a path this account can read or write |
| `the tool's own data file` | This copy of the plugin is damaged. Report the file the message names and stop; a session never writes under the plugin (the constitution's Irreversibles) |
| `status` is `too-little-text` | For `profile`, add samples until there are at least 2 and 1,500 words; for `check`, check a draft of at least 50 words |
| `short` is true, or `ranges` or `missing` is `null`, on a `checked` draft | Not a failure. Ranges are judged from 250 words and `missing` from 500. `ranges` is also `null` when the profile has none: a 0.1.0 profile, or samples too short for 3 chunks |
| `pass` is false and the process exited 0 | That is a successful run. Read `avoided`, `contradicted` and `dosage`; `ranges` and `missing` never set it. Exit 1 means the run could not check |

## Success

- `node scripts/voice-lexicon.js help`, and each command's `--help`, exits 0 with nothing installed and names that command's flags.
- `profile` exits 0 with one JSON object; every marker in it meets its class's consistency rule; `markers` is empty and `ranges` is `null` when `status` is `too-little-text`; and every band in `ranges` has `low` at or below `median` at or below `high`, with `q1` and `q3` `null` under 8 chunks.
- `check` exits 0 with one JSON object whether or not `pass` is true, and `pass` is true only when `avoided`, `contradicted` and `dosage.repeated` are empty and `dosage.over` is false; `ranges` and `missing` never change it.
- A bad path or destination, a malformed samples, baseline or profile file, a confirmed copy holding a key or value outside those check lists, an input over a cap, an unknown flag, or `--install` exits 1 with stdout empty, and the message names the cause and the fix.
- Nothing is written but the `--output` file, and nothing is installed.
