# Composio Setup

The first authentication and catalog provider. This file is the only place in the plugin that explains Composio, and the gateway repeats its short form whenever it answers `needs_provider`. Menu labels below were read from Composio's docs on 2026-09-08. If a screen has moved, the heading names still match.

## What it does for you

Composio holds the grants. When you connect an account, you approve it at the vendor in your own browser, or type an API key into Composio's hosted page, and Composio keeps the token. The gateway on this machine asks Composio to make each call on your behalf and never sees the token. When you want to stop, you revoke at Composio, and the connection store tells you which accounts to revoke at the vendor too.

The free tier, read on 2026-09-05, allows one hundred thousand tool calls a month with no card. That covers an individual's use of this plugin many times over.

## Three different things. Do not mix them.

| Thing | Where it lives | What it is |
|-------|----------------|------------|
| Project API key | One file on this machine | Lets the gateway call Composio at all |
| Auth config | Composio dashboard, one per toolkit | The blueprint for how GitHub or Cloudflare authenticates. Not a grant. |
| Connected account | Composio, after you approve | The actual GitHub OAuth grant or Cloudflare token. Made through the gateway. |

The project key is not a GitHub token and not a Cloudflare token. Creating an auth config is not connecting an account. Connecting an account is its own turn later.

## 1. Get a project API key

This key authenticates the gateway to Composio.

1. Create an account at composio.dev and sign in. The dashboard is dashboard.composio.dev.
2. Select a project, or create one. One project is enough for this plugin.
3. Open Settings, then Project Settings, then API Keys. If the dashboard shows Platform first: open Platform, select the project, then Settings, then the API Keys tab.
4. Create a key. Use a full-access project API key. Do not use an organisation key. Organisation keys live under Organization Settings, General Settings, Organization Access Tokens, and they go in a different header. This gateway sends `x-api-key` and will not accept an org key.
5. Copy the key once. It is shown at creation. Anyone holding it can act as every account you later connect.
6. Open the empty file at the path `gateway/SETUP.md` names for this OS. That file exists only after the gateway has served once (a harness attach, not `help` and not `--check`). If it is missing, attach the gateway once, then come back. Do not create the path yourself. Paste the key after `WISER_AUTH_PROVIDER_KEY=` and save. Do not paste the key into chat. `COMPOSIO_API_KEY=` is accepted as an alias. The second line is `WISER_USER_ID=`. Leave it empty on a first machine; the gateway fills it. On a later machine, copy the whole file so the user id matches.
7. Restart the harness after you save.

If the dashboard only offers a scoped key, give it at least: Auth configs read and write, Connected accounts read and write, Tools read, Tool execution write, Proxy execute write, Toolkits read. Scoped permissions cannot be edited later. A missing one often returns as "Invalid API key". Full access is the one this plugin expects.

The key is a project key. Keep the file at the platform user-config path `gateway/SETUP.md` names, and nowhere else.

## 2. Add toolkits (auth configs)

An auth config tells Composio how a toolkit authenticates across every user who later connects. It is not your GitHub login and not your Cloudflare token. Make one per toolkit you will use through this plugin. For the first ship that is GitHub and Cloudflare.

Open Platform, then Auth Configs, then Create Auth Config. Auth configs belong to the selected project. If a config you just made is missing, check the project switcher before making another.

### GitHub

1. Search for GitHub. The toolkit slug is GITHUB. Auth is OAuth2. Composio-managed OAuth is available; use it. You do not register a GitHub OAuth app.
2. Leave the default scopes unless you know you need fewer.
3. Create. The dashboard may show an auth config id starting `ac_`. You do not paste that id anywhere in this plugin. The gateway looks the config up by toolkit.
4. Do not click Connect Account on this config. That control authenticates the dashboard's Playground user. This plugin connects through the gateway with its own user id.

### Cloudflare

There are two Cloudflare toolkits. Use **Cloudflare Api Key**, not **Cloudflare**.

**Cloudflare** (do not use for this plugin) asks for Global API Key plus account email. That is a different secret from `CLOUDFLARE_API_TOKEN`. A hosted page that asks for an email is this toolkit, and a scoped API token pasted there fails at Cloudflare with 9106.

**Cloudflare Api Key** (this plugin) asks for one field, Cloudflare API Token. That is `CLOUDFLARE_API_TOKEN`, sent as `Authorization: Bearer`.

1. Search for **Cloudflare Api Key**. The toolkit slug is `CLOUDFLARE_API_KEY`. Auth is API Key. There is no Composio-managed OAuth.
2. Create the auth config. Do not paste the Cloudflare token into the auth config. The token is collected later on the hosted Connect Link. If the create form demands a token to save, stop and report it.
3. Do not click Connect Account here. That authenticates the dashboard Playground user, not this gateway.
4. Leave any existing **Cloudflare** (no "Api Key") config alone. The gateway looks up by toolkit slug and will not use it once this config exists.

### A vendor whose API needs OAuth and has no toolkit of its own

Some APIs, Google Cloud's control plane among them, require a short-lived OAuth token on every call and have no Composio toolkit covering them. A custom toolkit cannot carry them: custom toolkits accept only `NO_AUTH`, `API_KEY` and `DCR_OAUTH`, and most vendors do not support dynamic client registration.

**This recipe needs a toolkit Composio ships for that vendor, even though it ships none for the API you want.** Google Cloud has none; `GOOGLEBIGQUERY` is a Google toolkit carrying OAuth2, and the config hangs off that. Where Composio ships no toolkit for the vendor **at all**, this route is unavailable and there is no local-file fallback either, because a file cannot hold a token that expires. Stop and report it.

1. Register an OAuth client with the vendor yourself. For Google that is Cloud Console, APIs and Services, Credentials, Create Credentials, OAuth client ID, Web application. Add the redirect URI the auth config shows you; Composio's is `https://backend.composio.dev/api/v1/auth-apps/add`, and it is worth confirming against the config after you create it rather than assuming.
2. Create the auth config on that shipped toolkit, choosing **your own OAuth app** rather than Composio-managed auth, and enter the client id and secret on that page. Set the scopes to exactly what the connector needs, not the vendor's broadest scope.
3. Connect through the gateway as usual, by the Connect Account skill. You approve at the vendor in your own browser.
4. Composio is expected to retain the refresh token and mint access tokens, and the gateway calls the vendor's API by proxy with a full URL and never sees a token. **Whether a call still succeeds after the first access token expires is not established here**, so treat unattended long-running use as untested until you have watched one call succeed an hour after consent.

Do not paste the client secret into a conversation, into `auth-provider.env`, or into any file in a root. It goes on the auth config page and nowhere else.

**Read the vendor's generated schema for which scopes each operation accepts, not its documentation pages.** Google publishes a discovery document per API at `https://<host>/$discovery/rest?version=<v>`, generated from the running service, while its HTML reference pages are maintained by hand and go stale. A build here took `cloud-platform`, the broadest Cloud scope, on an HTML claim that both API Keys v2 methods accepted nothing narrower; the generated schema gives both `apikeys` as well, which is API Keys data rather than all Cloud data. The scope you ask for is the blast radius of the grant, and narrowing it afterwards costs a re-consent.

**One auth config per toolkit, and the gateway refuses rather than guessing.** `auth-provider.js` reads the configs for a toolkit when a connection is started and **refuses** if it finds more than one, returning a `vendor_error` naming the toolkit and the count; it binds a config only when exactly one exists. Account discovery is the same shape: `gateway/src/gateway.js` drops any toolkit whose distinct account ids number more than one rather than picking among them. So nothing silently binds the wrong grant.

**Read the limit of that precisely.** The count is checked when a connection is **started**, and when an account must be discovered. An already-active stored connection executes without either check, so adding a second config or account does not stop a connector that is already working; it stops the next `start_connect` and it prevents unambiguous discovery for a module not yet bound. Do not read the refusal as a guarantee that a duplicate will announce itself.

Two consequences for this recipe:

- **Hang the config off a toolkit that carries no other config, and check before creating.** Not because the wrong one would be chosen, but because a second one blocks the next connection on that toolkit.
- **If your custom config is ever deleted, the next `start_connect` attempts to create a Composio-managed one in its place**, requesting managed auth without specifying scopes. For a bring-your-own route that is the wrong blueprint and it appears without being asked for. Whether that creation succeeds, and what scopes result, is the provider's to decide. Check Auth Configs before assuming a failing connector is a code problem.

The connection is listed under that toolkit's name in `list_connections` and in any audit, so pick a name a reader will not find surprising for the work the connector does, or say in the connector's `auth.md` why the surprising one was chosen.

**A user OAuth grant carries what that user can reach, not one resource.** A `cloud-platform` grant on a Google account that can see eight projects reaches all eight. Where the connector mutates anything, its confirmation names the resource and not only the operation.

OAuth toolkits: the gateway creates a managed-auth blueprint on first `start_connect` if none exists. API-key toolkits (Replicate, Clarity, Google Vision, Vercel, Cloudflare Api Key): it creates a custom API_KEY blueprint with empty credentials, and the hosted connect page collects the token. Do not paste a vendor token into an auth config. Making Cloudflare here remains the reliable way to pick **Cloudflare Api Key** over **Cloudflare**.

## 3. Connect an account

Through the gateway, by the Connect Account skill, never by typing a key into a conversation, and never by the dashboard's Connect Account button on an auth config.

For GitHub the skill hands you a link and you approve at GitHub in your own browser. For Cloudflare the hosted page collects the API token from you directly; the skill never sees it. For a catalog-absent static-key service, register a custom toolkit with the exact vendor header template. Local-file is the last resort only when custom toolkit injection cannot match the vendor.

What each vendor asks of you on its side is in that connector's `auth.md`.

## The hosted endpoint, for clients that cannot run the gateway

Composio can expose a session as a hosted MCP endpoint that a hosted chat client attaches as a custom connector. Read on 2026-09-05 from Composio's session docs: you make one from the Composio dashboard or its SDK, with `mcp: true` on the session, and the client sends the `x-api-key` header it gives you. What that endpoint serves is Composio's stock catalog for the toolkits you named. It does not serve this plugin's connectors, its policy or its audit log, and it does not stop on `needs_connect`; it is a smaller thing than the gateway, and it is the only route for a client that cannot start a local process.

## Checking your account

Composio also ships a command-line tool that installs into your home directory and edits your shell startup file. Nothing in this plugin uses it. If you want to see what Composio thinks is connected, the dashboard shows it, and `list_connections` through the gateway shows what this plugin thinks is connected; the two should agree, with one documented limit: the gateway's own discovery lists only ACTIVE accounts, skips a toolkit holding more than one, and fetches a single page, so an empty or shorter local listing does not establish that the dashboard is empty.

After step 2, Auth Configs should list GitHub and Cloudflare. Connected accounts stay empty until you connect through the gateway.

Catalog-absent API-key apps use custom toolkits. The header template must match the vendor exactly: CourtListener requires `Token {{generic_api_key}}`, not Bearer. The gateway upserts the registered toolkit on the first `start_connect`; identical later upserts are no-ops, and a frozen-config conflict stops without deleting it. Hosted connect collects the vendor key. Do not paste the vendor token into the auth config or `auth-provider.env`.
