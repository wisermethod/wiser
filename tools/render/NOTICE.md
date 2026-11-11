# Third-party notice: render

The tool carries Mermaid 10.9.6's unchanged browser file in `vendor/mermaid/`, with SHA-256 hashes and bytes in `vendor/manifest.json`. Member commands install no Mermaid packages. Mermaid's original MIT copyright and permission notice is carried verbatim in `vendor/mermaid/LICENSE`, from its upstream v10.9.6 source. The manifest records that source address and full SHA-256; `build/mermaid-10.9.6-LICENSE.txt` keeps the supplied text as a repository input for offline refresh.

`vendor/mermaid/THIRD-PARTY-NOTICES.txt` preserves supplementary licence files from the local locked build-input tree. These include MIT, ISC, BSD-3-Clause, Apache-2.0, MPL-2.0, EPL-2.0 and Unlicense. khroma's installed `license` file supplies MIT terms although its lock entry lacks a licence field. The scope of the prebuilt browser copy is stated in `tools/lib/build/COPIES.md`.

Playwright remains in the shared browser runtime; its notice is `tools/lib/browser-runtime/NOTICE.md`. Refresh and reproduction checks are documented in `tools/lib/build/COPIES.md`.
