---
name: Form
type: tool
category: automation
description: Check and fill Wiser forms and draw their questions in a page that returns answers to the chat
version: 0.2.0
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

The format commands need only Node, install nothing and write nothing. `ask` also runs Browser Control, which uses the shared browser runtime and can install it on consent. It makes a temporary browser profile and removes it after its host stops. The local window commands use this computer's loopback address; the format commands make no network request. Its contract is `standards/script-contract.md`, through `system/templates/Script Contract.md`; the caller's guide is `tools/RUNNING.md`.

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

`scripts/format.js` has no imports and works unchanged in Node, a browser or a Cloudflare Worker. It exports `FORM_LIMITS`, `FONT_HOSTS`, `SAMPLE_FORM`, `checkForm(value)`, `checkTemplate(value)`, `fillTemplate(template, values)` and `formJsonSchema()`.

Checks return `{ ok, problems }`, with every problem found, each `{ path, message }`. `ok` is true exactly when the list is empty. `checkForm` and `checkTemplate` never throw, even for non-JSON input. Lengths count Unicode code points. No string or key may contain control characters (U+0000 to U+001F or U+007F to U+009F) or the line and paragraph separators U+2028 and U+2029, which break a line as a newline does. A form is at most 65,536 UTF-8 bytes as `JSON.stringify` writes it. Unknown keys, wrong types and missing required keys are problems at their own paths. Checks do not coerce, trim, fill defaults or discard keys.

A form takes exactly these keys:

| Key | Rule |
|-----|------|
| `id` | Optional; `^[a-z][a-z0-9-]{0,39}$` |
| `title` | Required string, 1 to 80 code points |
| `intro` | Optional string, at most 300 |
| `fonts` | Optional array, 1 to 6 font objects |
| `questions` | Required array, 1 to 12 question objects |

`submitLabel` is refused. Button wording belongs to the engine.

A font has exactly `family` and `src`, both required. `family` is 1 to 40 characters matching `^[A-Za-z][A-Za-z0-9]*(?: [A-Za-z0-9]+)*$`, ASCII letters and digits starting with a letter, words separated by single spaces, so CSS reads it as the same name everywhere. It is unique ignoring case, and never a name CSS reads as a keyword, in any case: `serif`, `sans-serif`, `monospace`, `system-ui`, `cursive`, `fantasy`, `emoji`, `math`, `fangsong`, `inherit`, `initial`, `unset`, `revert`, `default`. `src` is an HTTPS URL, at most 300 characters, whose origin is one of `FONT_HOSTS`: `https://fonts.gstatic.com` or `https://cdn.jsdelivr.net`. It has no query, fragment or credentials and its path ends `.woff2`, `.woff`, `.ttf` or `.otf`.

Every question has required `id`, `type`, `label` and optional `short`, `help`. `id` matches the form id grammar and is unique in the form. `label` is 1 to 200 characters. `short` is at most 40, naming the question in the answers; `help` is at most 300. The type selects its remaining keys; all others are refused:

| Type | Remaining keys |
|------|----------------|
| `radio`, `checkbox` | Required `options`, 2 to 12 entries |
| `image-radio`, `image-checkbox` | Required `options`, 2 to 8 entries, at least two with a picture |
| `slider` | Required finite numbers `min`, `max`, with `min < max`; optional `step`, `value`, `minLabel`, `maxLabel` |
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

`engine/engine.js` is a classic script defining `globalThis.WiserForm`. A host checks the form first and calls `WiserForm.render(form, { onSubmit, host, source, sends })`. `onSubmit({ payload, summary })` returns `{ sent, delivery }`. `setHost`, `setTheme`, `metadata`, `readAnswers`, `setStatus` and `showEmpty` serve host integration; `WORDS` is the single home of visible engine wording. The renderer uses safe DOM construction. Its only network activity is loading each declared font with `FontFace`. Samples draw at once, in a generic face until the font arrives, and keep that face if it never does or the browser refuses it. A sample wider than its card is set smaller until it fits, again whenever a face arrives. Before a form arrives, the page shows the shape of one, in no words. `engine/style.css` is the one stylesheet, with host light/dark theme overrides and operating-system theme otherwise. Native controls provide keyboard operation and visible focus rings.

`engine/chat.js` supplies the in-chat transport. Bundle it with the host's esbuild as `bundle: true`, `format: "iife"`, `target: "es2022"`, `minify: true`, using `@modelcontextprotocol/ext-apps` 2.0.0. Pass the resulting script to `composePage({ script })` from `scripts/page.js`; serve the returned HTML as the host's app resource.

The first arriving form wins: tool-call `arguments.form`, tool-result `structuredContent.form`, or ChatGPT's `window.openai.toolOutput.form`. Each is copied through JSON, since a host can hand over objects made in another window, and checked before drawing. A refused first form remains refused; later arrivals do not replace it. The engine says “No form arrived” three seconds after the call ends or is cancelled without a form, or three seconds after loading where no app answers it. A connected app that has not yet sent the call is waited for, since an app may draw the page before the member allows the call, as Cowork does. Refusal and delivery diagnostics are data attributes on `#root` and `#status`, never diagnostic prose on the page.

Submitting first calls `updateModelContext` with the answers twice over: as `structuredContent` `{ form: <title>, id: <only if supplied>, answers: { <question id>: <value> } }`, and as text, `Form answers, structured:` and that object as JSON, for a host that reads only text. Then it calls `sendMessage` as a user message. Only if message delivery fails does it try `window.openai.sendFollowUpMessage`, when present. Context failure still allows message delivery. A failed delivery shows the answers for copying and allows retry.

| Question type | Answer data |
|---------------|-------------|
| `radio`, `image-radio` | Picked option value, or `null` |
| `checkbox`, `image-checkbox` | Array of picked option values, in option order |
| `slider` | Number |
| `text` | Trimmed string, capped at 1000 code points |

Answers are read by question position. The message starts `Here are my answers:`, then one line per question: `- <short, else label>: <shown>`. Picked labels join with `, `; numbers and text are shown directly, except that a line break or other control character typed into a text answer shows as a space, so no answer can start a line of its own; the data keeps the text as typed. An empty answer is `(none)`.

ChatGPT sends the message itself. Claude and Cowork put it in the member's message box. Presence of `window.openai`, or a host name matching `chatgpt` or `openai` ignoring case, selects `Send my answers` and `Sent to the chat.` Otherwise the button reads `Add my answers to the chat`, with `Your answers are in the message box. Press Send when you're ready.` after success. A later press reads `Send again`.

`composePage({ script, form, title, closes })` returns one self-contained HTML page, with English language, viewport meta, inline CSS, `#root`, optional JSON in `#wiser-form` and the inline script. Optional `closes` is a finite number of milliseconds since 1970, embedded in `#wiser-form-closes`. Its title is the supplied title, else the form title, else `Wiser form`. It escapes less-than characters in JSON and closing script sequences in JavaScript. It refuses unsafe DOM sinks, external script/link tags, `src=` or `href=` attributes, and stylesheet imports or URLs in its own markup, style and script; the title and the form are the member's words, escaped, and are not read as code. It reads its stylesheet relative to itself. The JSON element is an embedding facility; the in-chat transport receives the form through the host handoff.

## The window on a member's computer

Command-line tools show the same form in Browser Control's own window. With `serve`, a calling skill opens the address after the command returns. The detached listener holds the form and its answers in memory only: no form file, answer file or log is written. It needs no packages or bundler.

Use `ask` when a sandbox refused the listener, so one yes to run that command outside the sandbox covers the whole form. It serves with the same checks and listener, then runs Browser Control's `session status --port 4395`. A host left behind by an earlier `ask`, after a kill or a failed stop, is recovered and stopped by the next one: its profile is named `wiser-form-ask-<random>` directly inside the real system temporary directory, and may already be gone. A host on any other profile is reused and left running. With no running host, it makes a profile in the system temporary directory and starts its own host on that port, passing `--install` and `--headless` through when given. It navigates to the form, sets the viewport to 480 by 900, and waits in the same command for up to `--seconds`, default 900. A member always gets a visible window; `--headless` is only for checks and tests. At the end it stops the listener, stops a host it started or recovered and removes that profile only after confirming shutdown. A failed stop keeps the profile and reports a cleanup failure. This also runs after an exception, a window failure, SIGINT, SIGTERM or SIGHUP. Browser Control commands run in separate process groups, so a terminal group signal is remembered until the current operation settles, then cleanup runs once. An unsettled start is checked for up to 65 seconds before its profile can be removed; if it cannot be resolved, the profile is kept and a cleanup failure is reported. Child output is captured. The command prints one final JSON object after cleanup; invalid inputs retain `serve`'s stderr and exit 1.

On answers, `ask` prints exactly `wait`'s `answered` object. Before stopping a serving listener on any other result, it checks once more for answers; an `answered` reply becomes the final result. A cleanup failure writes to stderr and preserves an `answered`, `interrupted` or `needs-install` result on stdout. On timeout or an expired listener with no answers collected it prints `{ "status": "unanswered" }`. An interrupted run with no answers collected prints `{ "status": "interrupted", "signal": "SIGINT", "SIGTERM" or "SIGHUP" }`. When Browser Control reports its first install, `ask` returns `{ "status": "needs-install", "report": <Browser Control's report>, "reason": "A yes means running ask again with --install." }` with no listener or profile left unless cleanup reports a failure. Other Browser Control failures return `no-window` with a `reason`. These status objects exit 0; read the status before proceeding.

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
| `needs-install` | Put Browser Control's `report` to the member; a yes means running the same `ask` again with `--install`; nothing is left running |
| `unanswered` | `ask` ended without answers; its listener and any host and profile it made have been removed |
| `interrupted` | `ask` caught the named `signal`; return to the chat; any cleanup failure is on stderr |
| `waiting` | Run `wait` again; the object also carries the form's `url` |
| `answered` | Read the answers back to the member |
| `gone` | The form closed; return to the chat |
| `stopped` | The requested listener has stopped |

Waiting as measured on 2026-10-26: Claude Code runs `wait` in the background with a long `--seconds` and is woken when it ends, running it again on `waiting`. Codex keeps a long command as a session and polls it, so one `wait` serves. Grok Build blocks on each `wait` up to its own limit, about 60 seconds, so it runs `wait --seconds 50` again on `waiting`.

`engine/local.js` runs after the shared engine as a classic script, with `host: "this computer"`, `source: "local"` and `sends: true`. It posts the structured payload plus ordered `shown` entries to `answers` relative to its own address. HTTP 200 shows “Sent. You can close this window.”; 409 shows “These answers were already sent.” Both disable every control. Any other failure shows the engine's `notSent` words, retains answers to copy and leaves retry live. At `closes`, an unsent page shows “This form has closed. Go back to the chat to answer there.” and disables every control without sending a request. A transport may return optional `status` and `disabled` fields alongside `{ sent, delivery }` to finish submission this way; chat keeps its existing behavior.

Only `GET /<code>/`, `POST /<code>/answers`, `GET /<code>/result?wait=<seconds>` and `POST /<code>/stop` exist. Other routes return empty 404 responses. `Host` must be exactly `127.0.0.1:<port>`; a POST's `Origin`, when present, must be `http://127.0.0.1:<port>`; violations are 403. Answers require `application/json` (415 otherwise), at most 256 KB, more than the largest answers a checked form allows (413 otherwise), and are accepted once (409 thereafter). Invalid answers are 400: title and optional form id must match; question ids must be exact; radios accept their option values or null, checkboxes distinct option values, sliders a number in range and on a step, with the allowance the format gives, and text at most 1000 code points. `shown` must have one string-valued entry per question, in order. Pages carry `Cache-Control: no-store` and a Content Security Policy permitting only inline scripts and styles, data images, the two `FONT_HOSTS` font origins and same-origin connections, with no form actions or base URL.

## Verification

From this directory, with the development packages already installed:

```bash
node --test
```

Format, command and page tests use Node built-ins; `schema.test.js` uses development Zod to accept every passing fixture against the published schema. Browser tests use the SDK's `AppBridge` host and the shared `tools/lib/browser-runtime/` launch function. Development dependencies and that runtime can be installed by maintainers with `npm ci` in their respective directories. Member commands need no development packages; `ask` uses Browser Control's runtime under its normal install consent. Browser tests skip with the missing package named only when the development packages or shared Playwright runtime are absent; launch, build and assertion failures fail the test.

The `ask` tests also cover a scripted answer, timeout, refusals, host reuse, SIGINT, SIGTERM, SIGHUP, the first-install report, Browser Control failures and an exception while making the profile. They check that owned listeners and hosts stop and temporary profiles are removed before output, or kept with a cleanup failure when shutdown cannot be confirmed. The suite covers boundary and refusal paths, template substitution, package-free commands, source precedence, delivery order and fallback, mouse and keyboard controls at 360, 390 and 720 pixels, longest labels, target sizes, computed light/dark contrast, host theme changes, no-form/refusal states, and local font routing. Browser requests are intercepted and recorded; only the declared fixture font may be requested. Tests write only temporary files and remove them.

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
