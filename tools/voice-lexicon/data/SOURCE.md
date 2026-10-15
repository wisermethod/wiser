# voice-lexicon data

Every file here was written for this tool on 2026-10-15. None copies, samples or reorders a published dataset, corpus, frequency list or ranking, and no third-party data ships with the tool.

## common-words.txt

An unranked set of 9,560 everyday English words. One lowercase word per line, sorted alphabetically (byte order), no duplicates, no blank lines, a newline after the last word. Contractions are single tokens with a straight apostrophe (`don't`, `it's`, `we've`). It holds function words, common contractions, and the everyday words a general adult reader meets routinely: concrete nouns for home, food, body, family, work, office, money, travel, weather, nature, plants, animals, buildings, tools, town and community, school, health, sport, media and technology, plus common verbs, adjectives and adverbs. Inflections are included (plurals, -s, -ed and -ing forms, comparatives); the base words and the irregular forms were written by hand, and the regular inflections were generated from those base words by spelling rules. Genuinely uncommon or literary words (such as skein, brouhaha, kerfuffle, upshot), dialect or style-marking forms (such as y'all, ain't, shan't, albeit, whereby), and formal connectives (moreover, furthermore, nonetheless, nevertheless, presumably, reportedly, thereby, hence, thus, whereas) are left out so the tool can still report them. The order carries no meaning: it is alphabetical, never a frequency rank. A word not in this set is treated as uncommon by class 1 (signature words).

## variants.json

A JSON array of 64 pairs, each `{ "a": "<form>", "b": "<form>", "kind": "spelling" | "dated" | "contraction" }`, all lowercase with straight apostrophes. 43 are `spelling` (British and American spellings, `towards`/`toward`, `amongst`/`among`, `whilst`/`while`, `okay`/`ok`, `e-mail`/`email`, `wilfully`/`willfully`), 6 are `dated` (`clew`/`clue` and other older forms), and 15 are `contraction` (a contraction against its full form, such as `don't`/`do not`). Pairs whose two forms differ in meaning are left out, and so are `let's`/`let us` and `i've`/`i have`, whose full forms are ordinary phrases ("let us know", "I have a truck") rather than a choice against the contraction. Some forms span two words or carry a hyphen (`do not`, `e-mail`, `to-day`).

## idioms.json

A JSON array of 48 common sayings, each `{ "usual": "<usual form>", "keywords": ["<word>", ...] }`, all lowercase with straight apostrophes. `keywords` holds 2 to 4 content words, each one a word of `usual`, that identify the saying even when its order changes or one word is swapped. An optional `also` holds further forms people commonly use ("the early bird gets the worm"); a use matching `usual` or any `also` form is not an altered saying. 3 entries carry `also`.

## punctuation-reference.json

A JSON object of 11 keys, each a reference rate per 1,000 words in general edited prose: `em_dash`, `en_dash`, `double_hyphen`, `semicolon`, `ellipsis`, `exclamation`, `parenthesis` (opening parentheses), `serial_comma` (`, and` or `, or` closing a run of at least three items of at most four words each, in one sentence), `initial_and`, `initial_but`, `initial_so` (sentences starting with that word). **These rates are estimates** written for this tool, not measurements of any corpus; the tool reports a habit only at double or half the reference, so the estimates need to be roughly right, not exact.
