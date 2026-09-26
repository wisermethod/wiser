# Cloudflare Pages setup

Load `connectors/cloudflare/auth.md` ([auth guide](../../connectors/cloudflare/auth.md)) for the separate `cloudflare` / `pages` grant and its Pages permissions. `needs_connect` ends the skill run; `skills/Connect Account/` is the next human turn. The requester supplies `account_id`; this skill does not use the auth guide's account-discovery action.

Reads need Account / Cloudflare Pages / Read. Every write (`create_project`, `add_domain`, `remove_domain`, `delete_project`, `deploy`) needs Edit on that same permission. A Read-only token returns 403 on them.

The primary publish path is the gateway. `cloudflare.pages.deploy` takes `dir` as the absolute path of the kit `site/dist/` (`sites/<domain>/site/dist/`, or `work/<slug>/sites/<domain>/site/dist/`). The connector refuses any other directory: the folder must be named `dist`, its parent must be named `site`, and that parent must contain a regular file `kit.json`. It deploys static kit output only. A tree with `_worker.js` or a `functions/` directory at the root of `dist` is refused. Deploy, and a create or add-domain that is part of that publish, run only after Webmaster Job 3 passes and the requester confirms the gateway's `needs_confirmation` stop. Every write confirms on every call.

`cloudflare.pages.add_domain` registers the hostname on the project. It does not create the DNS CNAME. The domain stays pending until that record exists. The record is Zone Publisher's job (`experts/IT Expert/`), which needs the `dns` grant (Zone / DNS / Edit). This skill does not call DNS.

Wrangler is the fallback human route when the gateway path cannot run, not the primary. After Webmaster Job 3 passes the proposed publish, did the human confirm that Wrangler's account, project, and publish target match the reviewed destination? Yes: they upload only the kit `site/dist/`. No, or they have not said: do not treat the upload as ready to run. A changed source or destination returns to Job 3 before upload. Typical human sequence, with the owning root and project placeholders replaced and paths quoted:

```sh
cd "<owning-root>/sites/<domain>/site/"
npm run build
npx wrangler pages deploy dist --project-name <project>
```

Stop if the build fails. For a work-scoped site, change the `cd` destination to `<owning-root>/work/<slug>/sites/<domain>/site/`. Run neither command from the envelope or owning root. The build's `dist` is the `site/dist/` upload payload; envelope `memory/` is outside it. Supply the upload result to the skill so it can compare with the project's deployment listing.

Never connect an envelope or owning root to a host. Never configure a Pages or GitHub integration of the parent, including one that names the site as its build subdirectory. Never `git init`; this upload does not require a site repository.
