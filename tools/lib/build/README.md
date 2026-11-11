# One-file tool builds

Developer commands, run from the plugin root with the lockfile's packages installed in the named tool:

```sh
node tools/lib/build/one-file.mjs
node tools/lib/build/one-file.mjs data
node tools/lib/build/one-file.mjs "Content Harvester"
node tools/lib/build/one-file.mjs keynote-render
node tools/lib/build/one-file.mjs --check
node --test tools/lib/build/one-file.test.mjs
node tools/lib/build/test-one-file.mjs data
```

`TOOLS` in `one-file.mjs` is the declared list, currently `data`, `Content Harvester` and `keynote-render`. The entry map names `data.js`, `harvest.js` and `render.js`, each exporting a guarded `main`. Builds write `tools/<tool>/dist/<entry>.mjs` and `NOTICE.md`. Sitemap runs from source and has no compiled file.

Before compiling, the builder requires every locked tool package's installed `package.json` version to match `package-lock.json`, and verifies every bundled package's installed file set and bytes against its authenticated lockfile-integrity archive in npm's cache before compiling that package. A mismatch names the tool and package and stops both builds and `--check`. Install tool packages with `npm ci` before building.

The compiler is esbuild 0.25.10. `compiler-package-lock.json` pins it and the integrity of each optional platform package. Each builder process creates a fresh private compiler directory in system temporary storage, copies the carried lock, and runs `npm ci --offline --ignore-scripts` with npm’s configured `npm_config_cache` when set, otherwise the existing build cache at `~/.cache/wiser-connector-launch/npm`. Use a temporary cache for ephemeral builds and remove it afterward. It removes that process's compiler directory on ordinary exit. A hard kill can leave the directory. No existing compiler tree is reused, and `ESBUILD_BINARY_PATH` overrides are refused. Member commands never run the builder.

Data answers help first. For other commands, source execution requires installed package versions matching the lockfile, the package marker and a successful import of the command's CSV entry, including its transitive files. Parse, describe, aggregate and chart use `csv-parse/browser/esm/sync`; join uses `csv-parse/sync`; compute imports no package. An incomplete or absent package tree falls back to an existing compiled file. When an installed version differs, one stderr line names the package, its installed version and the locked version before the compiled file runs; stdout is unchanged. Without that file, source retains its install consent and `--install` behavior. `WISER_PACKAGES_BUNDLED` is defined only by esbuild; the shared `tools/lib/one-file.js` check returns before inspecting package markers, consent or imports in a compiled file.

File URLs preserve spaces and Windows drive-letter paths. The entry's real path locates the tool and compiled file, including when Node preserves the spelling of a main-script symlink outside the tool. The main guard compares real paths, then device and inode where the two spellings differ (a hard link, or a Windows drive letter in another case), falling back to plain resolved paths when realpath fails. If neither comparison can identify the program, it reports the cause to stderr and exits 1. Eval imports and eval preloads are unsupported and fail explicitly. Importing from another file whose real program path is known does not execute `main`.

`--check` rebuilds into system temporary storage and compares the compiled file and notices byte for byte. Its source hash covers the original bytes of esbuild's input graph, the builder script, the tool manifest and lockfile, the carried compiler lockfile and any supplied licence input used by the build. A comment change within that graph is stale; unrelated files and archives outside the graph are not checked. Builds preserve inline legal comments, and notices copy the installed packages' licence files verbatim, including nested licences.

A passing `--check` proves that the delivered bytes reproduce from authenticated tool package archives matching the lockfile, the current source inputs, and a compiler installed offline from the carried lock. It refuses same-version edited packages and missing cached archives. It does not check files outside the input graph or prove runtime behavior or portability to other machines. Use a clean `npm ci` for release inputs and run the tool suites as well.

The isolated harness copies data and `tools/lib/` into system temporary storage, excludes packages and environment files, and verifies no `node_modules` exists above or inside that copy before and after its own `npm test`. A loader redirects unit core imports to exported namespaces in the shipped compiled file; CLI tests use the documented entry. The original files remain available for source-inspection tests. The restricted portable VM receives a temporary browser-only compilation of the same CSV parser and continues to reject Node imports and globals. Compatibility tests still extract `main` through the original source repository and run that baseline separately; the isolated candidate has no link to its packages. Nothing changes `TMPDIR`.

Content Harvester compiles fast-xml-parser and its reached dependencies, but marks `undici` external. Its documented entry falls back on absent or broken parser imports or an installed package version that differs from the lockfile, reporting version drift in the same stderr line described above. Only a run with the first non-blank trimmed HTTPS_PROXY, https_proxy, HTTP_PROXY or http_proxy needs the external dispatcher. keynote-render compiles yaml; its branded commands need no packages, while Keynote and osascript remain local system requirements. Both entries resolve their real paths before locating `dist/` and use the shared main guard.

For a package whose archive lacks licence text, the builder checks its exact name and version against the supplied inputs documented in `COPIES.md`. Content Harvester’s @nodable/entities 3.0.0 uses the repository's supplied upstream MIT text, copied verbatim into NOTICE with its source address after checking its pinned byte count and SHA-256. A missing or altered supplied input stops the build and `--check`. A package lacking both archive text and a supplied input is explicitly named on stderr and in the generated NOTICE with its metadata licence. A refresh can emit that warning for inspection, but `--check` fails. The builder inventories only packages in the compiled graph, with external undici excluded.

Run `test-one-file.mjs "Content Harvester"` or `test-one-file.mjs keynote-render` for their whole suites in package-free temporary copies. All script modules are exported as namespaces for unit coverage. Harvester’s portable VM receives a temporary neutral-platform XML parser and still rejects Node imports. Baseline comparisons use the original repository explicitly. No test command installs a tool package. Changing this builder invalidates data’s source fingerprint as well; an existing data bundle must be rebuilt before the whole-list `--check` can pass.

Builder tests pack installed tool packages into private npm caches in system temporary storage and change only the fixture locks to authenticate those archives. They rebuild fixture outputs before testing stale inputs, notices and hook routing. They neither copy a developer's whole cache nor change the shipped lockfiles. The build-only compiler still needs its two registry archives (esbuild and the current platform binary). Tests verify their carried-lock digests and copy just those archives from npm's configured cache or the documented compiler cache. If absent, compiler-dependent tests skip and print the one command that prepares them:

```sh
npm cache add esbuild@0.25.10 "@esbuild/$(node -p 'process.platform + "-" + process.arch')@0.25.10" --cache "$HOME/.cache/wiser-connector-launch/npm"
```

This preparation can download packages; no builder test downloads them. Missing installed tool inputs also skip with that tool's `npm ci --prefix "tools/<tool>"` command. Every test fixture and its private archives are removed on ordinary exit.

Each build also writes `dist/inputs.json` from esbuild’s own input graph. `--check` compares it too. The hook calls `--affected-inputs` to match staged shared source paths against those graphs and every tool’s scripts directory without loading packages or the compiler. Compiled source cannot lag its source at a release that runs this hook.
