# Cloudflare Pages setup

Load `connectors/cloudflare/auth.md` ([auth guide](../../connectors/cloudflare/auth.md)) for the `cloudflare` / `pages` grant and its permissions; the D1 actions ride that same grant. `needs_connect` ends the skill run; `skills/Connect Account/` is the next human turn. The requester supplies `account_id`; this skill does not use the auth guide's account-discovery action.

Pages reads need Account / Cloudflare Pages / Read. Every Pages write (`create_project`, `add_domain`, `remove_domain`, `retry_domain_validation`, `delete_project`, `deploy`, `deploy_with_functions`, `bind_d1`) needs Edit on that same permission. The D1 actions use the same `pages` grant, so its token also needs Account / D1 / Read for `d1_list_databases`, `d1_get_database` and `d1_query`, and Account / D1 / Edit for `d1_create_database`, `d1_apply_migration`, `d1_execute` and `d1_delete_database`. A Read-only token returns 403 on the writes. Adding the D1 permission to the token at Cloudflare does not change its value, and nothing is reconnected.

The primary publish path is the gateway. `cloudflare.pages.deploy` takes `dir` as the absolute path of the kit `site/dist/` (`sites/<domain>/site/dist/`, or `work/<slug>/sites/<domain>/site/dist/`). The connector refuses any other directory for it: the folder must be named `dist`, its parent must be named `site`, and that parent must contain a regular file `kit.json`. It deploys the kit's static output. When `site/dist-function/` exists beside that `dist/`, which is only when an article is scheduled, the same deploy also carries the kit's Function from that directory. Nothing else of a kit payload may be server code. A tree with `_worker.js` or a `functions/` directory at the root of `dist` is refused.

A foreign site with Pages Functions goes through `cloudflare.pages.deploy_with_functions`, with `dir` the absolute path of its build output and `functions_build` the absolute path of the directory `tools/pages-functions/` wrote from its `functions/` folder. The tool runs Wrangler's own compiler on this machine with no Cloudflare sign-in; its first run asks to install about 210 MB. Bindings are set on the project with `cloudflare.pages.bind_d1`, never carried in the build. Both deploys, and a create, add-domain or bind that is part of that publish, run only after Webmaster Job 3 passes and the requester confirms the gateway's `needs_confirmation` stop. Every write confirms on every call. `d1_apply_migration` and both deploys read files on this machine, so they run on the local gateway; the Wiser endpoint does not run them.

`cloudflare.pages.add_domain` registers the hostname on the project. It does not create the DNS CNAME. The record is Zone Publisher's job (`experts/IT Expert/`), which needs the `dns` grant (Zone / DNS / Edit). Whether the hostname is active is `cloudflare.pages.get_domain`, not an inference from the record. This skill does not call DNS.

Wrangler is the fallback human route when the gateway path cannot run, not the primary: for a file too large for the gateway's upload requests, a Functions deployment over its request limit, a migration file over 1 MiB, or a gateway that cannot be attached. After Webmaster Job 3 passes the proposed publish, did the human confirm that Wrangler's account, project, and publish target match the reviewed destination? Yes: they upload only the reviewed payload. No, or they have not said: do not treat the upload as ready to run. A changed source or destination returns to Job 3 before upload. Typical human sequence for a kit site, with the owning root and project placeholders replaced and paths quoted:

```sh
cd "<owning-root>/sites/<domain>/site/"
npm run build
npx wrangler pages deploy dist --project-name <project>
```

Stop if the build fails. For a work-scoped site, change the `cd` destination to `<owning-root>/work/<slug>/sites/<domain>/site/`. Run neither command from the envelope or owning root. The build's `dist` is the `site/dist/` upload payload; envelope `memory/` is outside it. A Wrangler deploy of `dist/` carries no Function, so the build-time view stays until a rebuild and deploy after each date.

For a foreign site with Functions, the human runs Wrangler from that site's own root, where its `functions/` folder and Wrangler configuration sit: `npx wrangler d1 migrations apply <database> --remote` for its schema, then `npx wrangler pages deploy <build output> --project-name <project>`. Wrangler signs in on its own, which is the step the gateway route exists to avoid.

Supply the upload result to the skill so it can compare with the project's deployment listing.

Never connect an envelope or owning root to a host. Never configure a Pages or GitHub integration of the parent, including one that names the site as its build subdirectory. Never `git init`; this upload does not require a site repository.
