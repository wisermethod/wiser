---
name: Form
type: tool
category: automation
description: Check and fill Wiser forms and draw their questions in a page that returns answers to the chat
version: 0.1.0
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

The command needs only Node, installs nothing, writes nothing, and makes no network request. Its contract is `standards/script-contract.md`, through `system/templates/Script Contract.md`; the caller's guide is `tools/RUNNING.md`.

## Usage

| Command | Output |
|---------|--------|
| `node scripts/form.js help` or `node scripts/form.js --help` | Usage text, exit 0, without packages or configuration |
| `node scripts/form.js check --form <file>` | `{ "ok": true or false, "kind": "form" or "template", "problems": [{ "path": "questions[2].options[0].picture", "message": "..." }] }`; exit 0 for either verdict |
| `node scripts/form.js fill --template <file> --values <file>` | `{ "ok": true, "form": {...} }`; a refusal exits 1 with every problem's path and message on stderr |
| `node scripts/form.js schema` | `{ "schema": {...}, "limits": {...}, "fontHosts": [...] }` |
| `node scripts/form.js sample` | `{ "form": {...} }`, the six-question sample |

| Flag | Meaning |
|------|---------|
| `--help` | Print usage; accepted with every command |
| `--form <file>` | Required by `check`; absolute path to a form or template JSON file |
| `--template <file>` | Required by `fill`; absolute path to template JSON |
| `--values <file>` | Required by `fill`; absolute path to a JSON object of slot values |

No command accepts `--install` or `--env`. Unknown flags are refused by name, including beside help, and point at this command's help. Repeated flags, unused flags, extra arguments and missing flag values are refused. Every input must be a file, at most 262,144 bytes, containing JSON. Paths are canonicalized before reading. Relative paths, `.env` inputs and paths resolving inside a directory named `memory` are refused. A missing file, oversized file, invalid JSON or unreadable path exits 1, naming the cause and pointing at help. A failure leaves stdout empty; success prints one JSON object, except help's usage text.

## Format

`scripts/format.js` has no imports and works unchanged in Node, a browser or a Cloudflare Worker. It exports `FORM_LIMITS`, `FONT_HOSTS`, `SAMPLE_FORM`, `checkForm(value)`, `checkTemplate(value)`, `fillTemplate(template, values)` and `formJsonSchema()`.

Checks return `{ ok, problems }`, with every problem found, each `{ path, message }`. `ok` is true exactly when the list is empty. `checkForm` and `checkTemplate` never throw, even for non-JSON input. Lengths count Unicode code points. No string or key may contain control characters (U+0000 to U+001F or U+007F to U+009F). A form is at most 65,536 UTF-8 bytes as `JSON.stringify` writes it. Unknown keys, wrong types and missing required keys are problems at their own paths. Checks do not coerce, trim, fill defaults or discard keys.

A form takes exactly these keys:

| Key | Rule |
|-----|------|
| `id` | Optional; `^[a-z][a-z0-9-]{0,39}$` |
| `title` | Required string, 1 to 80 code points |
| `intro` | Optional string, at most 300 |
| `fonts` | Optional array, 1 to 6 font objects |
| `questions` | Required array, 1 to 12 question objects |

`submitLabel` is refused. Button wording belongs to the engine.

A font has exactly `family` and `src`, both required. `family` matches `^[A-Za-z0-9][A-Za-z0-9 ]{0,39}$`, is unique, and is not a generic family name, ignoring case. `src` is an HTTPS URL, at most 300 characters, whose origin is one of `FONT_HOSTS`: `https://fonts.gstatic.com` or `https://cdn.jsdelivr.net`. It has no query, fragment or credentials and its path ends `.woff2`, `.woff`, `.ttf` or `.otf`.

Every question has required `id`, `type`, `label` and optional `short`, `help`. `id` matches the form id grammar and is unique in the form. `label` is 1 to 200 characters. `short` is at most 40, naming the question in the answers; `help` is at most 300. The type selects its remaining keys; all others are refused:

| Type | Remaining keys |
|------|----------------|
| `radio`, `checkbox` | Required `options`, 2 to 12 entries |
| `image-radio`, `image-checkbox` | Required `options`, 2 to 8 entries, each with a picture |
| `slider` | Required finite numbers `min`, `max`, with `min < max`; optional `step`, `value`, `minLabel`, `maxLabel` |
| `text` | Optional `placeholder`, at most 120 characters; answer capped at 1000 characters |

Slider `step` is positive, default 1, and divides `(max - min)` into a whole number of steps from 1 to 100. A supplied `value` is between the ends and on a step. Without it, the engine uses the step nearest the middle, rounding a tie upward. `minLabel` and `maxLabel` are each at most 24 characters. Step arithmetic allows eight machine epsilons of relative floating point rounding.

An option takes exactly:

| Key | Rule |
|-----|------|
| `value` | Required; `^[a-z0-9][a-z0-9-]{0,39}$`, unique within its question |
| `label` | Required string, 1 to 60 characters |
| `note` | Optional string, at most 80 |
| `picture` | Required on image types, refused on other types |
| `sample` | Optional only with a `type:` picture, at most 24 characters |

Pictures are drawn in code. They fetch nothing:

| Grammar | Drawing |
|---------|---------|
| `palette:#hex,#hex,...` | Stripes of 1 to 8 colours; each is exactly `#rgb` or `#rrggbb` |
| `motif:<name>[:#fg,#bg]` | `dots`, `grid`, `waves`, `arcs`, `stripes`, `rings`, `triangles` or `blob`; either no colours or exactly two |
| `type:<family>[+<family>][:#fg,#bg]` | A large `sample` (default `Aa`) in the first family; a second family draws `Abc 123` beneath it; either no colours or exactly two |

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

`engine/engine.js` is a classic script defining `globalThis.WiserForm`. A host checks the form first and calls `WiserForm.render(form, { onSubmit, host, source, sends })`. `onSubmit({ payload, summary })` returns `{ sent, delivery }`. `setHost`, `setTheme`, `metadata`, `readAnswers`, `setStatus` and `showEmpty` serve host integration; `WORDS` is the single home of visible engine wording. The renderer uses safe DOM construction. Its only network activity is loading each declared font with `FontFace`. Samples draw at once, in a generic face until the font arrives, and keep that face if it never does. `engine/style.css` is the one stylesheet, with host light/dark theme overrides and operating-system theme otherwise. Native controls provide keyboard operation and visible focus rings.

`engine/chat.js` supplies the in-chat transport. Bundle it with the host's esbuild as `bundle: true`, `format: "iife"`, `target: "es2022"`, `minify: true`, using `@modelcontextprotocol/ext-apps` 2.0.0. Pass the resulting script to `composePage({ script })` from `scripts/page.js`; serve the returned HTML as the host's app resource. This tool builds no listener and contains no service code.

The first arriving form wins: tool-call `arguments.form`, tool-result `structuredContent.form`, or ChatGPT's `window.openai.toolOutput.form`. Each is checked before drawing. A refused first form remains refused; later arrivals do not replace it. Without a form after three seconds the engine says “No form arrived”. Refusal and delivery diagnostics are data attributes on `#root` and `#status`, never diagnostic prose on the page.

Submitting first calls `updateModelContext` with the answers twice over: as `structuredContent` `{ form: <title>, id: <only if supplied>, answers: { <question id>: <value> } }`, and as text, `Form answers, structured:` and that object as JSON, for a host that reads only text. Then it calls `sendMessage` as a user message. Only if message delivery fails does it try `window.openai.sendFollowUpMessage`, when present. Context failure still allows message delivery. A failed delivery shows the answers for copying and allows retry.

| Question type | Answer data |
|---------------|-------------|
| `radio`, `image-radio` | Picked option value, or `null` |
| `checkbox`, `image-checkbox` | Array of picked option values, in option order |
| `slider` | Number |
| `text` | Trimmed string, capped at 1000 code points |

Answers are read by question position. The message starts `Here are my answers:`, then one line per question: `- <short, else label>: <shown>`. Picked labels join with `, `; numbers and text are shown directly; an empty answer is `(none)`.

ChatGPT sends the message itself. Claude and Cowork put it in the member's message box. Presence of `window.openai`, or a host name matching `chatgpt` or `openai` ignoring case, selects `Send my answers` and `Sent to the chat.` Otherwise the button reads `Add my answers to the chat`, with `Your answers are in the message box. Press Send when you're ready.` after success. A later press reads `Send again`.

`composePage({ script, form, title })` returns one self-contained HTML page, with English language, viewport meta, inline CSS, `#root`, optional JSON in `#wiser-form` and the inline script. Its title is the supplied title, else the form title, else `Wiser form`. It escapes less-than characters in JSON and closing script sequences in JavaScript. It refuses unsafe DOM sinks, external script/link tags, `src=` or `href=` attributes, and stylesheet imports or URLs. It reads its stylesheet relative to itself. The JSON element is an embedding facility; the in-chat transport receives the form through the host handoff.

## Verification

From this directory, with the development packages already installed:

```bash
node --test
```

Format, command and page tests use Node built-ins; `schema.test.js` uses development Zod to accept every passing fixture against the published schema. Browser tests use the SDK's `AppBridge` host and the shared `tools/lib/browser-runtime/` launch function. Development dependencies and that runtime can be installed by maintainers with `npm ci` in their respective directories; members do not install them to run commands. Browser tests skip with the missing package named only when the development packages or shared Playwright runtime are absent; launch, build and assertion failures fail the test.

The suite covers boundary and refusal paths, template substitution, package-free commands, source precedence, delivery order and fallback, mouse and keyboard controls at 360, 390 and 720 pixels, longest labels, target sizes, computed light/dark contrast, host theme changes, no-form/refusal states, and local font routing. Browser requests are intercepted and recorded; only the declared fixture font may be requested. Tests write only temporary files and remove them.

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

A check reports every problem by path. A fill changes only tokens and returns a valid form. The page draws checked questions, accepts keyboard and pointer answers, and sends structured answers before their user message with wording appropriate to the host. Commands write nothing and install nothing.
