# Portable and CLI cases

Run `npm_config_cache=$HOME/.npm npm test` from this tool. Tests use the machine's default temporary directory and the installed local browser. No case contacts a service.

`fixtures/shared/cases.json` names the command, core export, JSON input, upload file and expected answer JSON. The ZIPs contain actual HTML, CSS and a binary PNG. `oversize: true` means construct one 8,388,609-byte upload before parsing; no large fixture ships. Address cases use the synthetic replies and DNS lookup in `fixtures/network.mjs`, also installed in CLI children by `cli-network.mjs`. A service runner can read the same inputs and expected answer files and inject that same synthetic network at its host boundary.

`portable-loader.js` links the entire core graph in a VM with Web APIs, without Node imports, process, require or Buffer. The host supplies the real browser, binary-body adapter and pinned Mermaid script bytes. `local-compat.test.js` compares self-contained pictures and CLI output against commit `1f810776` in temporary storage. Mermaid text geometry uses this Mac's browser fonts; Browser Rendering must verify its own fonts against the case.

`measure.mjs` repeats the offline browser measurements. `fixtures/baseline-cli.mjs` is a diagnostic preload for the shared install-question suite: it substitutes only the baseline CLI text in temporary test copies. Both revisions encounter that suite's missing copy-local runtime and cache configuration in this worktree.
