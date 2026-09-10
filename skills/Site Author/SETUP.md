# Site Author setup

System dependency: Node 22.12 or newer. Astro 7's floor. `node -v` must say so before `npm install`. This is a system dependency of stand-up, not a Wiser tool.

Scripts live in `scripts/` beside this file. Quote the path; the skill directory name contains a space. `--kit` is this skill's `kit/` directory, the proven tree, never a rebuilt copy.

```
node "<this-skill-dir>/scripts/stand-up.mjs" --root "<owning-root>" --domain <host> --site-url <origin> --kit "<this-skill-dir>/kit" [--work <slug>]
node "<this-skill-dir>/scripts/check.mjs" "<envelope-folder>"
node "<this-skill-dir>/scripts/wrap.mjs" --root "<owning-root>" --site "<domain-folder>"
node "<this-skill-dir>/scripts/upgrade.mjs" --site "<envelope-folder>" --kit "<this-skill-dir>/kit"
```

`--magazine` on stand-up enables `sections` and `issues`. Default is brochure: those collections stay in the schema and stay disabled.

The envelope is `sites/<domain>/`, or `work/<slug>/sites/<domain>/` with `--work <slug>` only when it dies with that work. The owning root and the existing work subject must declare `sites/`; Site Author does not create the subject. Check and Upgrade take the envelope; Wrap takes the old domain folder with root `kit.json`. Stand-up and Wrap read `site-AGENTS.md` beside this file, not the obsolete copy inside the kit.

In the kit folder (`<envelope>/site/`):

```
npm install
npm run dev
```

Stand-up is not done until `check` walks `KIT.md` (steps 1 to 5) and the preview serves the SEO slots (`KIT.md` step 6). Fetch the canonical article URL `/articles/hello`, never `/articles/hello/`. The kit is `trailingSlash: 'never'`; a slashed article URL 404s and is not a missing page.

Never connect the envelope or owning root to a host. Host payload is `site/` or `site/dist/` only. Personal, client, and org roots carry `memory/` (a client root also carries `sources/`). A Pages or GitHub integration of the parent would commit those.

Never `git init`. A site with no git is complete. A host skill may use an existing isolated repository containing only the kit payload; a build subdirectory does not isolate an envelope or owning-root repository.

Upgrade archives each replaced kit-owned file into a `zArchive/` sibling before it copies kit code, per `standards/conventions.md`. It does not merge `site/src/content/` or `site/public/images/`. Distinct stand-up palettes in `tokens.css` are kit-owned and Upgrade replaces them.

Live publish is not this skill. Load `skills/Cloudflare Pages/SKILL.md` for a simple site or `skills/Vercel Deploy/SKILL.md` for a managed site, then the selected skill's `SETUP.md` before the live-host hand-off. Webmaster Job 3 gates publish. Never connect the envelope or owning root to a host.
