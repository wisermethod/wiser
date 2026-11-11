# Carried browser files

These developer commands run from the plugin root after `npm ci` in the named tool:

```sh
node tools/lib/build/copy-assets.mjs render
node tools/lib/build/copy-assets.mjs deck-export
node tools/lib/build/copy-assets.mjs --check
node --test tools/lib/build/copy-assets.test.mjs
```

The builder downloads nothing. It requires exact direct pins in each tool's manifest and lock and a matching installed package version. Mermaid 10.9.6 contributes its single browser file. reveal.js 5.2.1 contributes the runtime, reset and layout CSS, highlight and notes plugins, highlight CSS, all themes and their complete font tree. The reveal.js licence and font notices are copied unchanged. Supplementary notices are maintained as build inputs under each tool's `build/`.

`vendor/manifest.json` records upstream registry URL and integrity, lockfile and builder SHA-256, and the byte count and SHA-256 of every copied file, licence and notice. `--check` recreates this tree in system temporary storage, compares every byte and file name, refuses missing, stale and additional files, and removes its temporary tree on success or failure. Before copying or comparing, it hashes the package archive in npm’s configured content-addressed cache against the lockfile integrity, extracts that authenticated archive into temporary storage with `tar`, and compares the entire installed package file set and bytes. A same-version modified installed tree is refused. An absent cached archive requires `npm ci`; the builder never fetches a replacement. Unexpected directories, including empty ones, are refused too.

No member command runs this builder or imports these packages. A missing or altered carried file calls for restoring the plugin copy. Member commands verify SHA-256 against the carried manifest before copying or serving runtime bytes. PDF and PNG verify their five served files. Starter scaffolding verifies the selected theme and every copied asset, including the complete font tree and its licences when the theme uses it. deck-export’s survey checks every manifest-listed file. render still uses the shared browser runtime for every rendering command; deck-export uses it for PDF and PNG. Their existing survey and authorised browser installation remain.

The original Mermaid MIT, highlight.js BSD 3-Clause and League Gothic OFL licence texts are kept byte for byte as repository inputs. Refresh and `--check` read these files locally and verify their pinned byte counts and SHA-256 hashes before copying them; neither command fetches them. Each copied licence's row in `vendor/manifest.json` records its source address, full SHA-256 and byte count alongside the other copied file hashes.

| Repository input | Carried beside the copy | Upstream source |
|---|---|---|
| `tools/render/build/mermaid-10.9.6-LICENSE.txt` | `tools/render/vendor/mermaid/LICENSE` | <https://raw.githubusercontent.com/mermaid-js/mermaid/v10.9.6/LICENSE> |
| `tools/deck-export/build/highlightjs-11.9.0-LICENSE.txt` | `tools/deck-export/vendor/reveal.js/plugin/highlight/LICENSE` | <https://raw.githubusercontent.com/highlightjs/highlight.js/11.9.0/LICENSE> |
| `tools/deck-export/build/league-gothic-OFL.md` | `tools/deck-export/vendor/reveal.js/dist/theme/fonts/league-gothic/OFL.md` | <https://raw.githubusercontent.com/theleagueof/league-gothic/master/OFL.md> |

League Gothic’s supplied OFL.md is 4,546 bytes with SHA-256 `6fa7527b6f9894e0dd8d5ae0050b51d37de15bcf7e6269d8dd690eb9df59aa40`. The package’s link stub remains unchanged as LICENSE. Source Sans Pro’s package already supplies its complete OFL and copyright as LICENSE. Both font licences travel with starter font trees.

## One-file licence inputs

Content Harvester's compiled @nodable/entities 3.0.0 declares MIT and its npm archive supplies no licence text. The supplied upstream text is retained byte for byte as `tools/Content Harvester/build/nodable-entities-3.0.0-LICENSE.txt`. It is 1,064 bytes with SHA-256 `750cb3fb6362804957ef52caaf9b5c824015be44d494637330d7cd8834d31d40`. Its recorded source is the package's own repository. <https://raw.githubusercontent.com/nodable/val-parsers/main/LICENSE>

`one-file.mjs` associates that input with the exact package name and version, verifies its byte count and SHA-256 locally, and includes its bytes in the source fingerprint and generated `tools/Content Harvester/NOTICE.md` with the source address. Refresh and `--check` fetch nothing. A missing or altered supplied input fails either command. A compiled package with neither archive text nor a supplied input is reported in NOTICE and on stderr, and `--check` fails. A refresh may still emit the diagnostic NOTICE for inspection.

`system/hooks/pre-commit` selects each builder from its staged inputs, with case-insensitive directory matching and rename sources included. Render and deck-export each run their own `copy-assets.mjs <tool> --check` for that tool's `vendor/`, package manifest, lockfiles or named `build/` licence inputs. Editing `copy-assets.mjs` checks both tools. Data, Content Harvester and keynote-render run the whole-list `one-file.mjs --check` for their `dist/`, package manifest or lockfiles, every file under their `scripts/`, and every shared `tools/lib/` file included in their compiler input graphs, for the supplied `tools/Content Harvester/build/nodable-entities-3.0.0-LICENSE.txt`, and for `one-file.mjs`, `compiler-package-lock.json` or `tools/lib/one-file.js`. The one-file list checks all three tools, requiring all three tools’ locked packages and the cached compiler. The builder emits each input graph as `dist/inputs.json`, checks that file with `--check`, and offers `--affected-inputs` as an offline query the hook uses; no second list of shared source files is maintained. Other paths leave these checks idle. A source edit cannot reach a release with an older compiled file when this hook runs; no runtime freshness check is needed. Before a builder runs, each matching staged blob must equal its worktree file. Both builders run with npm offline mode forced. The hook passes through the builder's own refusal lines: missing tool packages or their archives name `run npm ci in tools/<tool>` for the tool that failed. Missing compiler archives print the compiler-cache preparation command below, which a further `npm ci` in the tools cannot replace; a cache override prints that cache's path in the command. `git commit --no-verify` bypasses the hook. A clone that has not installed the hook receives no hook checks.

Starter decks retain reveal.js’s MIT LICENSE and the font licences, omit the redundant THIRD-PARTY-NOTICES.txt, and also carry the highlight.js licence unchanged as `highlight-LICENSE` beside `highlight.js` in their assets folder.

The hook's one-file check also needs esbuild's build-only archives, which `npm ci` in a tool does not supply. With no `npm_config_cache` override the compiler reads `~/.cache/wiser-connector-launch/npm`; installed tool package authentication uses npm's configured cache (`~/.npm` by default). Prepare the compiler cache before an offline commit check with this command from the plugin root:

```sh
npm cache add esbuild@0.25.10 "@esbuild/$(node -p 'process.platform + "-" + process.arch')@0.25.10" --cache "$HOME/.cache/wiser-connector-launch/npm"
```

Run `npm ci` in each compiled tool as well. If a cache override is used, both the tool archives and compiler archives must be in that cache. Preparation may download packages; the hook itself stays offline. Builder tests create their own tool archives from installed packages, use fixture-only lock integrities and rebuild their baselines in system temporary storage. Missing compiler archives cause explicit skips naming the preparation command above; no environment variable or developer's whole cache is required.

Mermaid's prebuilt browser file bundles other packages; the notices embedded in that file are kept unchanged, and no separate inventory of those components and versions is made here. The embedded DOMPurify notice says 3.4.2; `tools/render/package-lock.json` resolves dompurify 3.4.12.
