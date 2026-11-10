# One-file tool builds

Developer commands, run from the plugin root with the lockfile's packages installed in `tools/data/`:

```sh
node tools/lib/build/one-file.mjs
node tools/lib/build/one-file.mjs data
node tools/lib/build/one-file.mjs --check
node --test tools/lib/build/one-file.test.mjs
node tools/lib/build/test-one-file.mjs data
```

`TOOLS` in `one-file.mjs` is the declared list, currently `data`. Add a tool name there when it has a matching `scripts/<name>.js` entry exporting a guarded `main`. Builds write `tools/<name>/dist/<name>.mjs` and `NOTICE.md`. Sitemap runs from source and has no compiled file.

Before compiling, the builder requires every locked tool package's installed `package.json` version to match `package-lock.json`. A mismatch names the tool and package and stops both builds and `--check`. Install tool packages with `npm ci` before building.

The compiler is esbuild 0.25.10. `compiler-package-lock.json` pins it and the integrity of each optional platform package. Each builder process creates a fresh private compiler directory under `~/.cache/wiser-connector-launch/`, copies the carried lock, and runs `npm ci --ignore-scripts` with npm's download cache there too. It removes that process's compiler directory on ordinary exit. A hard kill can leave the directory. No existing compiler tree is reused, and `ESBUILD_BINARY_PATH` overrides are refused. Member commands never run the builder.

Data answers help first. For other commands, source execution requires the package marker and a successful import of the command's CSV entry, including its transitive files. Parse, describe, aggregate and chart use `csv-parse/browser/esm/sync`; join uses `csv-parse/sync`; compute imports no package. An incomplete or absent package tree falls back to an existing compiled file. Without that file, source retains its install consent and `--install` behavior. `WISER_PACKAGES_BUNDLED` is defined only by esbuild; the shared `tools/lib/one-file.js` check returns before inspecting package markers, consent or imports in a compiled file.

File URLs preserve spaces and Windows drive-letter paths. The entry's real path locates the tool and compiled file, including when Node preserves the spelling of a main-script symlink outside the tool. The main guard compares real paths, then device and inode where the two spellings differ (a hard link, or a Windows drive letter in another case), falling back to plain resolved paths when realpath fails. If neither comparison can identify the program, it reports the cause to stderr and exits 1. Eval imports and eval preloads are unsupported and fail explicitly. Importing from another file whose real program path is known does not execute `main`.

`--check` rebuilds into system temporary storage and compares the compiled file and notices byte for byte. Its source hash covers the original bytes of esbuild's input graph, the builder script, the tool manifest and lockfile, and the carried compiler lockfile. A comment change within that graph is stale; unrelated files and archives outside the graph are not checked. Builds preserve inline legal comments, and notices copy the installed packages' licence files verbatim, including nested licences.

A passing `--check` proves that the delivered bytes reproduce from the local inputs, with tool package versions matching the tool lockfile and a compiler installed from the carried lock. It does not authenticate the installed tool package bytes against their tarball integrity, prove that a same-version package tree is unmodified, check files outside the input graph, or prove runtime behavior or portability to other machines. Use a clean `npm ci` for release inputs and run the tool suites as well.

The isolated harness copies data and `tools/lib/` into system temporary storage, excludes packages and environment files, and verifies no `node_modules` exists above or inside that copy before and after its own `npm test`. A loader redirects unit core imports to exported namespaces in the shipped compiled file; CLI tests use the documented entry. The original files remain available for source-inspection tests. The restricted portable VM receives a temporary browser-only compilation of the same CSV parser and continues to reject Node imports and globals. Compatibility tests still extract `main` through the original source repository and run that baseline separately; the isolated candidate has no link to its packages. Nothing changes `TMPDIR`.
