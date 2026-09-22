# Site Author setup

System dependency: Node 22.12 or newer. Astro 7's floor. `node -v` must say so before `npm install`. This is a system dependency of stand-up, not a Wiser tool.

Scripts live in `scripts/` beside this file. Quote the path; the skill directory name contains a space. `--kit` is this skill's `kit/` directory, the proven tree, never a rebuilt copy.

```
node "<this-skill-dir>/scripts/stand-up.mjs" --root "<owning-root>" --domain <host> --site-url <origin> --kit "<this-skill-dir>/kit" [--work <slug>]
node "<this-skill-dir>/scripts/check.mjs" "<envelope-folder>"
node "<this-skill-dir>/scripts/wrap.mjs" --root "<owning-root>" --site "<domain-folder>"
node "<this-skill-dir>/scripts/upgrade.mjs" --site "<envelope-folder>" --kit "<this-skill-dir>/kit"
```

Did the requester ask for a magazine? Yes: pass `--magazine`, which enables `sections` and `issues`. No, or they do not say: do not pass it. Default is brochure: those collections stay in the schema and stay disabled.

Does the site die with an existing work subject the request names? Yes: the envelope is `work/<slug>/sites/<domain>/` and stand-up passes `--work <slug>`. No, or the request does not say: the envelope is owning-root `sites/<domain>/`. The owning root and, on the work parent, the existing work subject must declare `sites/`. Site Author does not create the subject. Check and Upgrade take the envelope; Wrap takes the old domain folder with root `kit.json`. Stand-up and Wrap read `site-AGENTS.md` beside this file, not the obsolete copy inside the kit.

In the kit folder (`<envelope>/site/`):

```
npm install
npm run dev
```

Stand-up is not done until `check` walks `KIT.md` (steps 1 to 5) and the preview serves the SEO slots (`KIT.md` step 6). Fetch the canonical article URL `/articles/hello`, never `/articles/hello/`. The kit is `trailingSlash: 'never'`; a slashed article URL 404s and is not a missing page.

Never connect the envelope or owning root to a host. Host payload is `site/` or `site/dist/` only. Personal, client, and org roots carry `memory/` (a client root also carries `sources/`). A Pages or GitHub integration of the parent would commit those.

Never `git init`. A site with no git is complete. A host skill may use an existing isolated repository containing only the kit payload; a build subdirectory does not isolate an envelope or owning-root repository.

Upgrade archives each replaced kit-owned file into a `zArchive/` sibling before it copies kit code, per `standards/conventions.md`. It does not merge `site/src/content/` or `site/public/images/`. Distinct stand-up palettes in `tokens.css` are kit-owned and Upgrade replaces them.

Live publish is not this skill. Which host is named? Cloudflare Pages, or the requester called the site simple and did not call it managed: load `skills/Cloudflare Pages/SKILL.md`, then that skill's `SETUP.md`, before the live-host hand-off. Vercel, or the requester called the site managed and did not call it simple: load `skills/Vercel Deploy/SKILL.md`, then that skill's `SETUP.md`, before the hand-off. Both hosts, or the requester called it both simple and managed, or the named host disagrees with the word: ask, and do not pick. Neither a host nor simple or managed is stated: ask which it is, and do not pick one. No answer: do not load either. Webmaster Job 3 gates publish. Never connect the envelope or owning root to a host.
