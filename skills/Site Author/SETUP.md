# Site Author setup

System dependency: Node 22.12 or newer. Astro 7's floor. `node -v` must say so before `npm install`. This is a system dependency of stand-up, not a Wiser tool.

Scripts live in `scripts/` beside this file. Quote the path; the skill directory name contains a space. `--kit` is this skill's `kit/` directory, the proven tree, never a rebuilt copy.

```
node "<this-skill-dir>/scripts/stand-up.mjs" --root <owning-root> --domain <host> --site-url <origin> --kit "<this-skill-dir>/kit"
node "<this-skill-dir>/scripts/check.mjs" <site-folder>
node "<this-skill-dir>/scripts/upgrade.mjs" --site <site-folder> --kit "<this-skill-dir>/kit"
```

`--magazine` on stand-up enables `sections` and `issues`. Default is brochure: those collections stay in the schema and stay disabled.

In the site folder (`sites/<domain>/`):

```
npm install
npm run dev
```

Stand-up is not done until `check` walks `KIT.md` (steps 1 to 5) and the preview serves the SEO slots (`KIT.md` step 6). Fetch the canonical article URL `/articles/hello`, never `/articles/hello/`. The kit is `trailingSlash: 'never'`; a slashed article URL 404s and is not a missing page.

Never connect the owning Wiser root to a host. Personal, client, and org roots carry `memory/` (a client root also carries `sources/`). A Pages or GitHub integration of the parent would commit those.

No `git init` by default. A site with no git is complete. Git-based hosting is an opt-in site-only repo, human-gated, after the parent gitignores `sites/<domain>/`. This skill does not create that repo.

Upgrade archives each replaced kit-owned file into a `zArchive/` sibling before it copies kit code, per `standards/conventions.md`. It does not merge `src/content/` or `public/images/`. Distinct stand-up palettes in `tokens.css` are kit-owned and Upgrade replaces them.

Live publish is not this skill. Load `skills/Cloudflare Pages/SKILL.md` for a simple site or `skills/Vercel Deploy/SKILL.md` for a managed site, then the selected skill's `SETUP.md` before the live-host hand-off. Webmaster Job 3 gates publish. Never connect the owning root to a host.
