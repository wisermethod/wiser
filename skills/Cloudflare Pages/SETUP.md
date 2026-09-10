# Cloudflare Pages setup

Load `connectors/cloudflare/auth.md` ([auth guide](../../connectors/cloudflare/auth.md)) for the separate `cloudflare` / `pages` grant and its Pages permissions. `needs_connect` ends the skill run; `skills/Connect Account/` is the next human turn. The requester supplies `account_id`; this skill does not use the auth guide's account-discovery action.

The gateway lists and gets projects and lists deployments. It does not create a Pages deployment. Select an existing project before preparing upload; a missing project is returned to the requester, never created by this skill.

Wrangler is a human-run CLI, not a Wiser tool. After Webmaster Job 3 passes the proposed publish, the human confirms Wrangler's account, project, and publish target match the reviewed destination and uploads only the kit site folder at `sites/<domain>/`. A changed source or destination returns to Job 3 before upload. Typical human sequence, with the owning root and project placeholders replaced and paths quoted:

```sh
cd "<owning-root>/sites/<domain>/"
npm run build
npx wrangler pages deploy dist --project-name <project>
```

Stop if the build fails. Run neither command from the owning root. The build's `dist` is the upload payload, not the parent folder. Supply the upload result to the skill so it can compare with the project's deployment listing.

Never connect an owning Wiser root to a host. Never configure a Pages or GitHub integration of the parent, including one that names the site as its build subdirectory. Never `git init`; this upload does not require a site repository.
