---
name: Form
type: tool
category: automation
description: Check and fill Wiser forms and draw their questions in a page that returns answers to the chat
version: 0.5.0
---

# Form

One portable form format and one page engine. A calling skill supplies the questions; this tool checks their structure, draws the controls, and returns the member's answers.

## Context

Use it when a skill needs pictures to tap, choices, checkboxes, a slider or a text answer. It judges nothing a form asks and does not interpret the answers. It never holds a password, payment detail, key or sign-in field, and a calling skill never asks for one. Sensitive account access belongs to the gateway.

Classifier seam: none.

## Quick Start

Run from this tool's directory:

```bash
node scripts/form.js help
node scripts/form.js sample
node scripts/form.js check --form /absolute/path/form.json
```

The format commands need only Node, install nothing and write nothing. `ask` also runs Browser Control, which uses the active browser runtime (`tools/AGENTS.md`) and can install it on consent. It makes a temporary browser profile and removes it after its host stops. The local window commands use this computer's loopback address; the format commands make no network request. Its contract is `standards/script-contract.md`, through `system/templates/Script Contract.md`; the caller's guide is `tools/RUNNING.md`.

## Usage

| Command | Output |
|---------|--------|
| `node scripts/form.js help` or `node scripts/form.js --help` | Usage text, exit 0, without packages or configuration |
| `node scripts/form.js check --form <file>` | `{ "ok": true or false, "kind": "form" or "template", "problems": [{ "path": "questions[2].options[0].picture", "message": "..." }] }`; exit 0 for either verdict |
| `node scripts/form.js fill --template <file> --values <file>` | `{ "ok": true, "form": {...} }`; a refusal exits 1 with every problem's path and message on stderr |
| `node scripts/form.js schema` | `{ "schema": {...}, "limits": {...}, "fontHosts": [...] }` |
| `node scripts/form.js serve (--form <file> \| --sample) [--ttl <seconds>]` | Start a detached listener and return its address |
| `node scripts/form.js ask (--form <file> \| --sample) [--ttl <seconds>] [--seconds <n>] [--install] [--headless]` | Show the form in Browser Control, wait, clean up and print one final object |
| `node scripts/form.js wait --port <n> --code <code> [--seconds <n>]` | Collect answers, or return `waiting` or `gone` |
| `node scripts/form.js stop --port <n> --code <code>` | Stop the named listener |
| `node scripts/form.js sample` | `{ "form": {...} }`, the six-question sample |

| Flag | Meaning |
|------|---------|
| `--help` | Print usage; accepted with every command |
| `--form <file>` | Required by `check`; for `serve` and `ask`, a form instead of `--sample`; absolute path to JSON |
| `--template <file>` | Required by `fill`; absolute path to template JSON |
| `--values <file>` | Required by `fill`; absolute path to a JSON object of slot values |
| `--sample` | Use the built-in form with `serve` or `ask`, instead of `--form` |
| `--ttl <seconds>` | `serve` or `ask` listener lifetime, a whole number from 1 to 86400; default 1800 |
| `--port <n>` | Required by `wait` and `stop`; a whole number from 1 to 65535 |
| `--code <code>` | Required by `wait` and `stop`; the serving result's 32 lowercase hex characters |
| `--seconds <n>` | `wait`: 0 to 3600, default 50; `ask`: 1 to 3600, default 900; whole seconds to wait for answers after the page opens |
| `--install` | `ask` only: pass consent for Browser Control's first install; a yes means running the same `ask` command again with this flag |
| `--headless` | `ask` only: no visible browser window, for checks and tests; a member always gets a visible window |

Only `ask` accepts `--install`; no command accepts `--env`. Unknown flags are refused by name, including beside help, and point at this command's help. Repeated flags, unused flags, extra arguments and missing flag values are refused. Every input must be a file, at most 262,144 bytes, containing JSON. Paths are canonicalized before reading. Relative paths, `.env` inputs and paths resolving inside a directory named `memory` are refused. A missing file, oversized file, invalid JSON or unreadable path exits 1, naming the cause and pointing at help. A failure leaves stdout empty; success prints one JSON object, except help's usage text.

## Format

`scripts/format.js` imports only portable files inside this tool and works unchanged in Node, a browser or a Cloudflare Worker. It exports `FORM_LIMITS`, `FONT_HOSTS`, `SAMPLE_FORM`, `checkForm(value)`, `checkTemplate(value)`, `fillTemplate(template, values)` and `formJsonSchema()`.

Checks return `{ ok, problems }`, with every problem found, each `{ path, message }`. `ok` is true exactly when the list is empty. `checkForm` and `checkTemplate` never throw, even for non-JSON input. Lengths count Unicode code points. No string or key may contain control characters (U+0000 to U+001F or U+007F to U+009F) or the line and paragraph separators U+2028 and U+2029, which break a line as a newline does. A form is at most 65,536 UTF-8 bytes as `JSON.stringify` writes it. Unknown keys, wrong types and missing required keys are problems at their own paths. Checks do not coerce, trim, fill defaults or discard keys.

A form takes exactly these keys:

| Key | Rule |
|-----|------|
| `id` | Optional; `^[a-z][a-z0-9-]{0,39}$` |
| `title` | Required string, 1 to 80 code points; a muted progress line (`h1.progress`) on paged forms and every form containing boards |
| `intro` | Optional string, at most 300 |
| `paged` | Optional boolean, default false; refused on a one-question form, even when false |
| `fonts` | Optional array, 1 to 6 font objects |
| `brand` | Shared board identity and words; required with boards, otherwise refused |
| `actions` | Optional two or three action buttons replacing Send |
| `questions` | Required array, 1 to 12 question objects |

`submitLabel` is refused. Send's wording belongs to the engine; action labels and lines belong to the calling skill.

A font has exactly `family` and `src`, both required. `family` is 1 to 40 characters matching `^[A-Za-z][A-Za-z0-9]*(?: [A-Za-z0-9]+)*$`, ASCII letters and digits starting with a letter, words separated by single spaces, so CSS reads it as the same name everywhere. It is unique ignoring case, and never a name CSS reads as a keyword, in any case: `serif`, `sans-serif`, `monospace`, `system-ui`, `cursive`, `fantasy`, `emoji`, `math`, `fangsong`, `inherit`, `initial`, `unset`, `revert`, `default`. `src` is an HTTPS URL, at most 300 characters, whose origin is one of `FONT_HOSTS`: `https://fonts.gstatic.com` or `https://cdn.jsdelivr.net`. It has no query, fragment or credentials and its path ends `.woff2`, `.woff`, `.ttf` or `.otf`.

Every question has required `id`, `type`, `label` and optional `short`, `help`. `id` matches the form id grammar and is unique in the form. `label` is 1 to 200 characters. `short` is at most 40, naming the question in the answers; `help` is at most 300. The type selects its remaining keys; all others are refused:

| Type | Remaining keys |
|------|----------------|
| `radio`, `checkbox` | Required `options`, 2 to 12 entries |
| `image-radio`, `image-checkbox` | Required `options`, 2 to 8 entries, at least two with a picture |
| `slider` | Required finite numbers `min`, `max`, with `min < max`; optional `step`, `value`, `minLabel`, `maxLabel` |
| `boards` | Required `pick` (0, 1, 2 or 3), and `options`, 1 to 12 boards; optional `view` (`board`, the default, or `look`) and `min` (a whole number from 1 to `pick`); requires form-level `brand` |
| `text` | Optional `placeholder`, at most 120 characters; answer capped at 1000 characters |

Slider `step` is positive, default 1, and divides `(max - min)` into a whole number of steps from 1 to 100. A supplied `value` is between the ends and on a step. Without it, the engine uses the step nearest the middle, rounding a tie upward. `minLabel` and `maxLabel` are each at most 24 characters. Step arithmetic allows eight machine epsilons of relative floating point rounding, and every step must land on a value of its own: far from zero a small step can vanish in rounding, and such a range is refused.

An option takes exactly:

| Key | Rule |
|-----|------|
| `value` | Required; `^[a-z0-9][a-z0-9-]{0,39}$`, unique within its question |
| `label` | Required string, 1 to 60 characters |
| `note` | Optional string, at most 80 |
| `picture` | Optional on image types; at least two options must have one. Refused on other types |
| `sample` | Optional only with a `type:` picture, at most 24 characters |

Pictured options draw as tiles, in their order, the pick mark beside each caption's first line, never on the picture. Two or three pictures share one row from a 560-pixel page up; on a narrower page they stack, one per row, each picture beside its caption, so a label such as "Contemporary" stays whole. Four or more use a wrapping grid. Options without pictures draw after the tiles, in their order, as the same word choices `radio` and `checkbox` use. Tiles and words share one question and input group. An option without a picture cannot have a `sample`.

Pictures are drawn in code. They fetch nothing:

| Grammar | Drawing |
|---------|---------|
| `palette:#hex,#hex,...` | Stripes of 1 to 8 colours; each is exactly `#rgb` or `#rrggbb` |
| `motif:<name>[:#fg,#bg]` | `dots`, `grid`, `waves`, `arcs`, `stripes`, `rings`, `triangles` or `blob`; either no colours or exactly two |
| `type:<family>[+<family>][:#fg,#bg]` | A large `sample` (default `Aa`) in the first family; a second family draws the same sample beneath it, or `Abc 123` if no sample was supplied; either no colours or exactly two |

Every type family must be declared in `fonts` or be `serif`, `sans-serif`, `monospace` or `system-ui`. Colours use the same hex grammar for every picture. Motifs and type samples default to dark ink on a light ground. Type sample ink falls back to black or white if the requested pair cannot give the text 4.5:1 contrast.

`formJsonSchema()` uses the draft 2020-12 vocabulary with closed objects. Its descriptions publish the grammar and limits, including conditional fields, uniqueness, font membership, slider arithmetic and byte size, which this restricted schema vocabulary cannot fully express. It is a permissive input schema: every accepted form fits it, while `checkForm` remains authoritative. String patterns express code point limits; broad `maxLength` values also accommodate schema consumers that count UTF-16 units.

## Boards and actions

Use one `boards` question per form. Both the chat card and local window draw it from Contact Sheet's board model. Forms carry references and words, never board pictures or font bytes. The hosted service needs only this tool's `engine/` and `scripts/`.

`brand` has exactly required `name` (1 to 80 code points), `initials` (1 to 12), `sentence` (1 to 300), `body` (1 to 500), and `words` (0 to 5 `{word, not}` objects, each field 1 to 60). Optional `logo` is kept SVG text, at most 8192 UTF-8 bytes, checked by Contact Sheet's standalone static SVG validator, including local references and refusal of active or external content. The format's no-controls rule applies: send SVG on one line. A kept logo replaces the container on every board. Shared fields are sent once.

Each option has required `value` (the usual value grammar), `label` (the board's name, 1 to 120), `board`, optional `note` (up to 300, the member's this/not-that words) and `recommendation` (1 to 200, one line, at most two boards). With `view: "look"`, `label` is optional, defaulting to "Look 1", "Look 2", and so on, and `recommendation` is refused. Other option types retain their existing label and note limits.

`board` takes references exactly as `select.mjs` names them: required `pairing: {id, headingFrom?, bodyFrom?}`, `palette: {id, overrides?}`, `graphicSet: {id, pattern?, texture?}`, `primaryMode: "light" | "dark"`, and a `container` id without a kept logo. Every id and donor id must exist in the bundled library. Optional `handwriting` is an offered public note family or null (default null); `buttonRadius` defaults to 4. Supplied font-file objects and mark-file paths cannot travel in a form. Palette overrides, pattern angle/strength and texture strength retain Assembly's closed fields and limits.

Optional board copy uses Assembly's `heroPhrase`, `note: {text, direction}`, `sample`, `items`, and `closingExamples` shapes. Optional `content` takes only `smallPrint`, `photoRules`, `never`, `markCaption` and nullable `closing`; shared brand fields are refused there. Absent copy uses the member's shared words; heroPhrase defaults to the sentence. Contact Sheet checks matching, both colour modes, SVG and public font-weight coverage on the assembled result. Only file-byte checks stay in disk assembly. Checks never silently change a colour or part.

`pick: 3` allows zero through three picks. One tap on the tile or its caption checkbox picks; another unpicks. A fourth pick says “Pick up to three.” `pick: 1` requires one for normal Send; a second pick is refused until the first is unticked. A sole board in a one-pick round shows whole without a question and starts selected, so an action needing one pick applies to that board. Board answers are arrays of option values in option order.

`pick: 2` caps the picks at two. Optional `min` requires at least that many picks for Send or an action with `needs: "some"`; until then the engine shows "Pick at least two." (or one or three). Without `min`, Send retains its existing rule: one for `pick: 1`, otherwise zero; `some` requires one. Other action needs keep their meanings. The local listener checks these rules again.

`view: "look"` draws small whole looks from exactly the same `board` references and shared `brand`: the member's name large in the pairing's heading face, on the palette's ground in its primary mode, with the graphic set's pattern at its own strength, its placeholder mark (or kept logo) in a colour field and a colour band below. Each picture has the prototype's 600 by 360 proportions. Tiles show four across from a 734px viewport, two below. The checkbox sits beside the caption; there is no full-size control or recommendation. A sole one-pick look stays a tile and starts selected. `pick: 0` shows look tiles without controls or submission. `select.mjs looks` returns twelve ready-to-use `options`, four of them on a plain ground; pass that array unchanged into a question with `type: "boards"`, `view: "look"`, `pick: 3`, `min: 2`, and the member's shared `brand`. Its stable `look-` values fit the usual option grammar; ranking details remain in the selection report.

Tiles show the top of each board at their own width: two across from 560px, one below. Name, tick, note and recommendation sit below the picture. “See it full size” is outside the picking label. The card has no scroll of its own: it grows to fit its boards and actions, and the host sizes it, so the chat is the only scroll. “See it full size” opens both full modes over the boards, starting at the clicked row's top and replacing that row and all tiles below it; rows above stay in place. It is framed by “Close this board” above and below, with the mirrored “Pick this one” checkbox; one board is open at a time, and its own button closes it. Where the host declares a height cap (`containerDimensions.maxHeight`, 5,000px in Claude) that the open card would pass, the other boards step aside while it is open and one mode shows at a time, the board's primary mode first, with a Light and Dark switch; the cap is measured with the rows above included before the fallback. Opening keeps focus on the close button without asking the chat to move. A nested frame cannot move the chat in WebKit, measured 2026-10-29. A whole board shown without tiles (`pick: 0`, or a sole board in a one-pick round) takes the same switch when the card would pass the cap. A narrow card (one column, below 560px) can still pass a 5,000px cap with twelve boards; the host then scrolls the card. The open board's mirrored checkbox has no name or value, so answers read only the tiles. Closing preserves picks, restores focus and the boards. No display-mode request is made. Full boards use the model's 734px and 390px layouts; chrome follows the host theme while each board keeps its own colours.

Board fonts load with `FontFace` from the model's public map, restricted to `FONT_HOSTS`. A failed face leaves a generic of the same kind. Drawings are local SVG DOM with unique fragment ids; they fetch nothing. Controls have 44px targets, visible focus, and chrome text at least 4.5:1.

`actions` has two or three closed `{value, label, note?, notes?, needs}` objects in display order: distinct usual option values, labels 1 to 60, notes up to 120 code points, and required `needs`. `note` is the line beneath the label inside every visible button. Optional `notes` is a closed object with any subset of `none`, `one`, `several`: each is single-line text under the same rules and 120-code-point limit as `note`. A supplied line replaces `note` for zero, exactly one, or two or three picks respectively; a missing key falls back to `note`, or no line. An empty supplied line hides the line. Every label and line comes from the calling skill:

| Needs | Visible with |
|-------|--------------|
| `one` | Exactly one pick |
| `some` | At least `min` picks, or one when `min` is absent |
| `any` | Any count, including zero |
| `none` | No picks |

Actions are for a boards question. The selected value travels as top-level `payload.action` alongside `answers`, and in the message under “What next”. Unmet actions are hidden, take no space and are absent from keyboard navigation and the accessibility tree. The engine still refuses submission through an unmet action. Buttons show their label and smaller line inside a larger target, side by side from 560px and stacked below; a sole visible action fills the row. The boards journey supplies `Show me more` (`needs: "any"`) first, with `notes` of `None of these work`, `Show me variations of this board`, and `Show me variations of these boards`; then `Lock this board in` (`needs: "one"`), with `note: "and finish my brand"`. Actions use the same context-then-message delivery and retry as Send; the local listener verifies the action and its needs again.

A form whose only question is boards with `pick: 0` is display-only. It draws options whole with their names and both modes, no question, checkbox, actions or Send, and refuses programmatic submission too. The calling skill goes on without waiting for an answer. Locally use `serve` and open the page; skip `wait` and `ask`, which wait for answers. This local display has no expiry message or outgoing request. Clean up the listener/window after the calling skill's following step.

### Regenerating the board library

From this tool's directory, maintainers run:

```sh
node scripts/bundle-boards.mjs
node scripts/bundle-boards.mjs --check
```

The generator installs nothing and contacts nothing. It is an explicit maintainer exception to the output-outside-tool rule: it writes only its fixed `engine/boards-lib.js` output. `--check` refuses drift without writing; `help` and `--help` need no packages or font pack. Unknown flags are refused.

Inputs are Build Brand's pure `assemble-core.mjs` and drawing parts from `parts.json`, and Contact Sheet's model, validation, SVG validator, public font map and geometry CSS. `assemble.mjs` retains file reading, hash/signature checks and path screening; its outputs are unchanged. The generated validation adapter omits only file-byte checks, with public-map files standing for assets. Every other board check comes from the original validation source. Regenerate when any input changes. The freshness test compares complete generated bytes against current sources. Runtime consumers import no sibling tool or skill.

## Templates

A skill keeps a template in its own files. Its questions, ids, types, numbers and option values stay fixed; only the member's parts are tokens. A template is a form with one additional required key, `slots`, an object containing 1 to 20 entries. Every slot name matches `^[a-z][a-z0-9-]{0,29}$` and maps to exactly `{ about, max }`. `about` is a required string of 1 to 120 characters describing the part; `max` is a required whole number from 1 to 300.

A token `{{name}}` may occur in these string values:

- Form: `title`, `intro`.
- Question: `label`, `short`, `help`, `placeholder`, `minLabel`, `maxLabel`.
- Option: `label`, `note`, `picture`, `sample`.
- Font: `family`, `src`.

Tokens in any other value or any key are refused. Every token names a declared slot, and every declared slot is used. Fields containing tokens defer their field rules until filling; other fields are checked immediately. Control characters are always refused. Font membership that depends on a tokenized family is checked after filling.

`fillTemplate` first checks the template. Its `values` object must have exactly the slot names, each a string of at most that slot's `max` code points, with no controls, `{{` or `}}`. Empty strings are allowed at this stage; the filled field still has to pass. It substitutes tokens without changing anything else, removes `slots`, then checks the completed form. It returns `{ ok: true, form }` only when that check passes; otherwise `{ ok: false, problems }` names the refusal. Neither input is changed.

## Engine and host integration

`engine/engine.js` is a classic script defining `globalThis.WiserForm`. A host checks the form first and calls `WiserForm.render(form, { onSubmit, host, source, sends })`. `onSubmit({ payload, summary })` returns `{ sent, delivery }`. `setHost`, `setTheme`, `metadata`, `readAnswers`, `setStatus` and `showEmpty` serve host integration; `WORDS` is the single home of visible engine wording. The renderer uses safe DOM construction. Its only external network activity is loading each declared sample font or board-map font with `FontFace`. Samples draw at once, in a generic face until the font arrives, and keep that face if it never does or the browser refuses it. A sample wider than its card is set smaller until it fits, again whenever a face arrives. Before a form arrives, the page shows the shape of one, in no words. `engine/style.css` is the one stylesheet, with host light/dark theme overrides and operating-system theme otherwise. Native controls provide keyboard operation and visible focus rings.

With `paged: true`, the same engine shows one question at a time in both the chat card and the local window (`engine/local.js`, including `scripts/ask.js`). Its single heading is the form's title plus `WORDS.progress`, such as " · 4 of 9", announced politely. The intro shows only on the first question. A pointer tap, click, Enter or Space on a radio or image-radio option selects it, keeps the pick visible for 250 ms, then moves on; arrow keys only change the pick. Every question before the last has `WORDS.next` ("Next"), which allows an unanswered skip; every question after the first has `WORDS.back` ("Back"), preserving answers. Moving focuses the question's first control. Hidden questions retain their controls but take no layout space, so the existing host size reporting follows the current question. The last question keeps the existing host-specific submit button; a radio pick there never sends by itself. Submission reads every question, uses the same transport once, and shows all answers together in the summary. Retry and local locking keep their existing behavior. Every form containing a boards question also shows its title as the muted `h1.progress` line, without a question count unless paged; other unpaged forms keep their heading.

`engine/chat.js` supplies the in-chat transport. Bundle it with the host's esbuild as `bundle: true`, `format: "iife"`, `target: "es2022"`, `minify: true`, using `@modelcontextprotocol/ext-apps` 2.0.0. Pass the resulting script to `composePage({ script })` from `scripts/page.js`; serve the returned HTML as the host's app resource.

The first arriving form wins: tool-call `arguments.form`, tool-result `structuredContent.form`, or ChatGPT's `window.openai.toolOutput.form`. Each is copied through JSON, since a host can hand over objects made in another window, and checked before drawing. A refused first form remains refused; later arrivals do not replace it. The engine says “No form arrived” three seconds after the call ends or is cancelled without a form, or three seconds after loading where no app answers it. A connected app that has not yet sent the call is waited for, since an app may draw the page before the member allows the call, as Cowork does. Refusal and delivery diagnostics are data attributes on `#root` and `#status`, never diagnostic prose on the page.

Submitting first calls `updateModelContext` with the answers twice over: as `structuredContent` `{ form: <title>, id: <only if supplied>, answers: { <question id>: <value> } }`, and as text, `Form answers, structured:` and that object as JSON, for a host that reads only text. Then it calls `sendMessage` as a user message. Only if message delivery fails does it try `window.openai.sendFollowUpMessage`, when present. Context failure still allows message delivery. A failed delivery shows the answers for copying and allows retry.

| Question type | Answer data |
|---------------|-------------|
| `radio`, `image-radio` | Picked option value, or `null` |
| `boards` | Array of picked values in option order; display-only forms send nothing |
| `checkbox`, `image-checkbox` | Array of picked option values, in option order |
| `slider` | Number |
| `text` | Trimmed string, capped at 1000 code points |

Answers are read by question position. The message starts `Here are my answers:`, then one line per question: `- <short, else label>: <shown>`. Picked labels join with `, `; numbers and text are shown directly, except that a line break or other control character typed into a text answer shows as a space, so no answer can start a line of its own; the data keeps the text as typed. An empty answer is `(none)`.

ChatGPT sends the message itself. Claude and Cowork put it in the member's message box. Presence of `window.openai`, or a host name matching `chatgpt` or `openai` ignoring case, selects `Send my answers` and `Sent to the chat.` Otherwise the button reads `Add my answers to the chat`, with `Your answers are in the message box. Press Send when you're ready.` after success. A later press reads `Send again`.

`composePage({ script, form, title, closes })` prepends the portable board library, adapter and DOM view, then returns one self-contained HTML page, with English language, viewport meta, inline CSS, `#root`, optional JSON in `#wiser-form` and the inline script. Optional `closes` is a finite number of milliseconds since 1970, embedded in `#wiser-form-closes`. Its title is the supplied title, else the form title, else `Wiser form`. It escapes less-than characters in JSON and closing script sequences in JavaScript. It refuses unsafe DOM sinks, external script/link tags, `src=` or `href=` attributes, and stylesheet imports or URLs in its own markup, style and script; the title and the form are the member's words, escaped, and are not read as code. It reads its stylesheet relative to itself. The JSON element is an embedding facility; the in-chat transport receives the form through the host handoff.

## The window on a member's computer

Command-line tools show the same form in Browser Control's own window. With `serve`, a calling skill opens the address after the command returns. The detached listener holds the form and its answers in memory only: no form file, answer file or log is written. It needs no packages or bundler.

Use `ask` when a sandbox refused the listener, so one yes to run that command outside the sandbox covers the whole form. It serves with the same checks and listener, then runs Browser Control's `session status --port 4395`. A host left behind by an earlier `ask`, after a kill or a failed stop, is recovered and stopped by the next one: its profile is named `wiser-form-ask-<random>` directly inside the real system temporary directory, and may already be gone. A host on any other profile is reused and left running. With no running host, it makes a profile in the system temporary directory and starts its own host on that port, passing `--install` and `--headless` through when given. It navigates to the form, sets the viewport to 480 by 900, and waits in the same command for up to `--seconds`, default 900. A member always gets a visible window; `--headless` is only for checks and tests. At the end it stops the listener, stops a host it started or recovered and removes that profile only after confirming shutdown. A failed stop keeps the profile and reports a cleanup failure. This also runs after an exception, a window failure, SIGINT, SIGTERM or SIGHUP. Browser Control commands run in separate process groups, so a terminal group signal is remembered until the current operation settles, then cleanup runs once. An unsettled start is checked for up to 65 seconds before its profile can be removed; if it cannot be resolved, the profile is kept and a cleanup failure is reported. Child output is captured. The command prints one final JSON object after cleanup; invalid inputs retain `serve`'s stderr and exit 1.

On answers, `ask` prints exactly `wait`'s `answered` object. Before stopping a serving listener on any other result, it checks once more for answers; an `answered` reply becomes the final result. A cleanup failure writes to stderr and preserves an `answered`, `interrupted` or `needs-install` result on stdout. On timeout or an expired listener with no answers collected it prints `{ "status": "unanswered" }`. An interrupted run with no answers collected prints `{ "status": "interrupted", "signal": "SIGINT", "SIGTERM" or "SIGHUP" }`. When Browser Control reports its first install, `ask` returns `{ "status": "needs-install", "question": <member question for the form>, "report": <Browser Control's report>, "reason": "A yes means running ask again with --install." }` with no listener or profile left unless cleanup reports a failure. Other Browser Control failures return `no-window` with a `reason`. These status objects exit 0; read the status before proceeding.

Measured in Codex on 2026-10-27 with `--sandbox workspace-write --ask-for-approval on-request`: the sandbox refused every connection to the computer's own network. The separate `serve`, Browser Control `session start`, `navigate`, `emulate set`, `wait`, `stop` and `session stop` commands each needed the member's yes, seven requests for one form. `ask` lets the tool ask once for the whole command and its children. Keep `serve`, `wait` and `stop` everywhere else: Grok Build ends a blocking call at its own limit.

```bash
node scripts/form.js serve --form /absolute/path/form.json --ttl 1800
node scripts/form.js serve --sample
node scripts/form.js ask --sample --seconds 900
node scripts/form.js wait --port 12345 --code 0123456789abcdef0123456789abcdef --seconds 50
node scripts/form.js stop --port 12345 --code 0123456789abcdef0123456789abcdef
```

`serve` requires exactly one of `--form` or `--sample`. It checks with `checkForm` before starting anything; an invalid form exits 1 with all problems on stderr. It returns within five seconds. A successful start prints `{ "status": "serving", "url": "http://127.0.0.1:<port>/<code>/", "port": <n>, "code": "<32 lowercase hex characters>", "closes": <milliseconds since 1970>, "wait": "<runnable wait command including this script's absolute path>" }`. The system picks the port, each form gets a fresh one-time code, and the listener outlives the command.

`wait` holds one request for up to `--seconds`. Answers print `{ "status": "answered", "form": <title>, "id": <only if the form has one>, "answers": {...}, "shown": [{ "id": <question id>, "question": <short or label>, "shown": <displayed answer> }] }`. Sent answers outlive the closing time: once accepted they are kept for up to ten minutes until a `wait` collects them. The first collection starts a 60-second replay window; one further `wait` returns those same answers, then the listener stops. With nothing sent it stops at `closes`. `stop` closes it immediately, including pending waits.

| Status | Caller does next |
|--------|------------------|
| `serving` | Open `url` in Browser Control's own window, then run the returned `wait` command |
| `no-window` | Ask in chat; `reason` names SSH, missing Linux `DISPLAY` and `WAYLAND_DISPLAY`, or an `ask` window or cleanup failure; an unresolved browser startup or failed stop keeps its profile |
| `no-listen` | Ask in chat, or run outside the tool's sandbox; `reason` gives the error code and explains that listening was not allowed; no listener is left |
| `needs-install` | Say `question` to the member word for word; use the details in `report` only to act on their answer or if they ask; a yes means running the same `ask` again with `--install`; nothing is left running |
| `unanswered` | `ask` ended without answers; its listener and any host and profile it made have been removed |
| `interrupted` | `ask` caught the named `signal`; return to the chat; any cleanup failure is on stderr |
| `waiting` | Run `wait` again; the object also carries the form's `url` |
| `answered` | Read the answers back to the member |
| `gone` | The form closed; return to the chat |
| `stopped` | The requested listener has stopped |

Waiting as measured on 2026-10-26: Claude Code runs `wait` in the background with a long `--seconds` and is woken when it ends, running it again on `waiting`. Codex keeps a long command as a session and polls it, so one `wait` serves. Grok Build blocks on each `wait` up to its own limit, about 60 seconds, so it runs `wait --seconds 50` again on `waiting`.

`engine/local.js` runs after the shared engine as a classic script, with `host: "this computer"`, `source: "local"` and `sends: true`. It posts the structured payload plus ordered `shown` entries to `answers` relative to its own address. HTTP 200 shows “Sent. You can close this window.”; 409 shows “These answers were already sent.” Both disable every control. Any other failure shows the engine's `notSent` words, retains answers to copy and leaves retry live. At `closes`, an unsent page shows “This form has closed. Go back to the chat to answer there.” and disables every control without sending a request. A transport may return optional `status` and `disabled` fields alongside `{ sent, delivery }` to finish submission this way; chat keeps its existing behavior.

Only `GET /<code>/`, `POST /<code>/answers`, `GET /<code>/result?wait=<seconds>` and `POST /<code>/stop` exist. Other routes return empty 404 responses. `Host` must be exactly `127.0.0.1:<port>`; a POST's `Origin`, when present, must be `http://127.0.0.1:<port>`; violations are 403. Answers require `application/json` (415 otherwise), at most 256 KB, more than the largest answers a checked form allows (413 otherwise), and are accepted once (409 thereafter). Invalid answers are 400: title and optional form id must match; question ids must be exact; radios accept their option values or null, checkboxes distinct option values, sliders a number in range and on a step, with the allowance the format gives, and text at most 1000 code points. Board answers respect the pick cap, and the chosen action must exist and satisfy its needs. Every display-only submission is refused. `shown` must have one string-valued entry per question, in order. Pages carry `Cache-Control: no-store` and a Content Security Policy permitting only inline scripts and styles, data images, the two `FONT_HOSTS` font origins and same-origin connections, with no form actions or base URL.

## Verification

From this directory, with the development packages already installed:

```bash
node --test
```

Format, command and page tests use Node built-ins; `schema.test.js` uses development Zod to accept every passing fixture against the published schema. Browser tests use the SDK's `AppBridge` host and the shared `tools/lib/browser-runtime/` launch function. Development dependencies and that runtime can be installed by maintainers with `npm ci` in their respective directories. Member commands need no development packages; `ask` uses Browser Control's active browser runtime under the install consent in `tools/RUNNING.md`. Browser tests skip with the missing package named only when the development packages or shared Playwright runtime are absent; launch, build and assertion failures fail the test.

The `ask` tests also cover a scripted answer, timeout, refusals, host reuse, SIGINT, SIGTERM, SIGHUP, the first-install report, Browser Control failures and an exception while making the profile. They check that owned listeners and hosts stop and temporary profiles are removed before output, or kept with a cleanup failure when shutdown cannot be confirmed. The suite covers boundary and refusal paths, template substitution, package-free commands, source precedence, delivery order and fallback, mouse and keyboard controls at 360, 390 and 720 pixels, longest labels, target sizes, computed light/dark contrast, host theme changes, no-form/refusal states, and local font routing. Browser requests are intercepted and recorded; only the declared fixture font may be requested. Tests write only temporary files and remove them.

Paged fixtures and format tests cover the optional boolean, wrong types, one-question refusal, template filling and the published schema. The existing AppBridge host harness exercises one visible question, progress and first-page intro, radio pointer/Enter/Space advance with an observable selection, arrows without advance, Next skipping, Back preserving answers, focus, size reporting, one final delivery in context-then-message order and the full summary. Local tests exercise the same paged engine through the listener. Paged layout checks cover light and dark themes at 390 and 760 pixels, text contrast of at least 4.5:1 and controls at least 44 pixels tall.

Board tests cover every new format field, library membership, public-map validation, generated-file freshness and both recorded twelve-board tap sets under 65,536 bytes. Browser cases exercise pointer/touch and keyboard picks, cap refusal, action visibility and count-specific lines, mirrored whole-view selection, equal card heights, Back, structured action delivery in both transports, display-only non-submission, font success/failure and intercepted requests. The host records display-mode requests to prove none are made.

Whole-look cases pass both recorded tap sets' `select.mjs looks` options unchanged through the validator and schema, then check 600 by 360 structure, numbered and supplied captions, the progress class, two/four columns, minimum enablement, refused fourth picks, keyboard picks with `pick: 2`, and listener rejection below the minimum or above the cap. An offline render command saves both sets at 390 and 734 in light and dark, with zero, two and refused-fourth picks, plus all-content captures and prototype comparisons:

```sh
PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" node scripts/render-look-checks.mjs --output /absolute/new/render-directory --prototype /absolute/prototype-directory
```

The prototype directory holds `looks/looks.json` and its named PNGs. All fonts come from the installed local pack through intercepted public-map requests; no external service is contacted and nothing is installed.

For boards actions and full view, the offline maintainer capture command takes an existing checked form and a new output directory:

```sh
PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" node scripts/render-boards-actions-checks.mjs --form /absolute/form.json --output /absolute/new/render-directory
```

It saves zero, one and two picks, first-row and third-row full views, and a 5,000px capped fallback in both host stand-ins at 734px and 390px, in light and dark. Each state includes a full-content capture, an action detail, a viewer-top detail where open, and measurements in `record.json`. Normal Claude full-view captures use a roomy declared cap to show the row replacement; the capped state uses its 5,000px cap. Full-content captures expand the stand-in frame after measuring, so the foot of a tall narrow card is included. Unknown flags and private paths are refused. The command installs nothing and blocks external requests, serving fonts from the existing local pack.

To regenerate offline visual evidence with installed development packages, browser and local font pack:

```sh
PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" node scripts/render-board-checks.mjs --output /absolute/new/render-directory
```

This maintainer command requires a new absolute directory outside private paths. `--help` needs no configuration; unknown flags are refused. It writes forms, assembled Contact Sheet references/pages, card/reference PNGs at 390 and 734 in both themes, and `record.json` with measured sizes and intercepted font addresses. Font requests are fulfilled with local pack bytes at the public-map addresses; no external service is contacted. Inspect every tile (scroll captures include all rows), whole view, four-board blend and display-only lock against Contact Sheet. Reference fonts embed the local pack; public provider bytes may differ and are not reverified offline.

## Troubleshooting

| Result | Response |
|--------|----------|
| `check` exits 0 with `ok: false` | Correct each named path; the exit code says the check ran |
| `fill` refuses | Correct the template, exact slot values or the filled field named by the problems |
| An input path is refused | Supply an absolute readable JSON file outside private input locations |
| A font does not load | Its sample uses a generic face; provide a valid permitted font URL if the face matters |
| A form cannot be shown | Correct the format and ask the chat to show it again |
| Delivery fails | Press the button again or copy the displayed answers into the chat |

If the calling request is ambiguous, the calling session clarifies before choosing its questions; the tool makes no such judgment.

## Success

A check reports every problem by path. A fill changes only tokens and returns a valid form. The page draws checked questions, accepts keyboard and pointer answers, and sends structured answers before their user message with wording appropriate to the host. Format commands write nothing and install nothing. `ask` returns one final result after cleaning up its listener and any browser host and profile it made or recovered, leaving a host on any other profile running. An unresolved startup or failed stop keeps the profile and reports a cleanup failure.
