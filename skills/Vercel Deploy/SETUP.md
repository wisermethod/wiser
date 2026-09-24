# Vercel Deploy setup

Load `connectors/vercel/auth.md` ([auth guide](../../connectors/vercel/auth.md)) for two separate grants: `vercel` / `projects` and `vercel` / `deployments`. Each connects in its own human turn through `skills/Connect Account/`. `needs_connect` stops the module in use; a project read does not prove a deployments grant.

`vercel.deployments.create` has confirmation always. Webmaster Job 3 precedes publish, and every creation call requires the requester's approval of its exact input. Only that approval supplies `confirm: true`; the skill never confirms on its own initiative. A second call takes a second confirmation.

Use only an isolated payload from `sites/<domain>/site/` or its `dist/`, or the work-scoped equivalent `work/<slug>/sites/<domain>/site/`. An existing site-only repository must contain only that payload. Envelope `memory/` is excluded. Check takes the enclosing envelope, not the payload folder. Resolve its project, team, source revision, and target before review. Never connect the envelope or owning root to Vercel or a Git integration, even with a site build-directory setting. Never `git init`. Environment-variable management and project deletion are outside this skill's connector actions.

Commercial-vs-hobby caution, 2026-09-09: do not assume a Hobby plan covers commercial or client work. Has the requester confirmed the intended use is allowed under the current plan terms and limits? Yes: record that they confirmed. A publish still waits on the skill's own gates. No, or they have not answered: do not publish. A list or a get may still run. Plan eligibility in this setup is `Unverified: requires confirmation`. This file establishes no pricing or entitlement.
