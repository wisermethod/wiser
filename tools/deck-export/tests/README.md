# Portable and CLI cases

Run `npm_config_cache=$HOME/.npm npm test` from this tool. Tests use default temporary storage and the installed local browser; they contact no service.

`fixtures/shared/cases.json` pairs JSON options and actual ZIP uploads with expected answer JSON files. Package JavaScript is supplied separately as pinned host assets, so fixture ZIPs remain small. The uploaded runtime replacement case carries deliberately failing JavaScript, proving it is replaced by the pinned package. Another case attempts to replace the global constructor inline; the pinned runtime remains in use. `oversize: true` constructs an 8,388,609-byte upload before ZIP parsing. No large generated fixture ships.

`portable-loader.js` links the core graph with Web APIs and without Node imports or globals. Each shared case runs against that core and the CLI. PNG ZIP bytes match for the static fixture (its animated navigation controls are disabled); PDFs are checked for header and page count. A separate baseline comparison checks PNG bytes, CLI answer/progress bytes, and rendered PDF page pixels. Poppler verifies PDF pixels when available; otherwise that check uses the page count.

The service can read these same ZIPs, JSON options and expected answer files, supplying its Browser Rendering browser and pinned package bytes. `fixtures/upload.mjs` also generates the 24-slide measurement input and can read the static case uploads. `measure.mjs` repeats the offline capped-job measurements. Browser Rendering itself is not exercised here.
