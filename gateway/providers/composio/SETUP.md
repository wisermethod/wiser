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
6. Open the empty file at the path `gateway/SETUP.md` names for this OS. That file exists only after the gateway has served once (a harness attach, not `help` and not `--check`). If it is missing, attach the gateway once, then come back. Do not create the path yourself. Paste the key after `WISER_AUTH_PROVIDER_KEY=` and save. Do not paste the key into chat. `COMPOSIO_API_KEY=` is accepted as an alias. Nothing else goes in the file.
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

OAuth toolkits: the gateway creates a managed-auth blueprint on first `start_connect` if none exists. API-key toolkits (Replicate, Clarity, Google Vision, Vercel, Cloudflare Api Key): it creates a custom API_KEY blueprint with empty credentials, and the hosted connect page collects the token. Do not paste a vendor token into an auth config. Making Cloudflare here remains the reliable way to pick **Cloudflare Api Key** over **Cloudflare**.

## 3. Connect an account

Through the gateway, by the Connect Account skill, never by typing a key into a conversation, and never by the dashboard's Connect Account button on an auth config.

For GitHub the skill hands you a link and you approve at GitHub in your own browser. For Cloudflare the hosted page collects the API token from you directly; the skill never sees it. For a catalog-absent static-key service, register a custom toolkit with the exact vendor header template. Local-file is the last resort only when custom toolkit injection cannot match the vendor.

What each vendor asks of you on its side is in that connector's `auth.md`.

## The hosted endpoint, for clients that cannot run the gateway

Composio can expose a session as a hosted MCP endpoint that a hosted chat client attaches as a custom connector. Read on 2026-09-05 from Composio's session docs: you make one from the Composio dashboard or its SDK, with `mcp: true` on the session, and the client sends the `x-api-key` header it gives you. What that endpoint serves is Composio's stock catalog for the toolkits you named. It does not serve this plugin's connectors, its policy or its audit log, and it does not stop on `needs_connect`; it is a smaller thing than the gateway, and it is the only route for a client that cannot start a local process.

## Checking your account

Composio also ships a command-line tool that installs into your home directory and edits your shell startup file. Nothing in this plugin uses it. If you want to see what Composio thinks is connected, the dashboard shows it, and `list_connections` through the gateway shows what this plugin thinks is connected; the two should agree.

After step 2, Auth Configs should list GitHub and Cloudflare. Connected accounts stay empty until you connect through the gateway.

Catalog-absent API-key apps use custom toolkits. The header template must match the vendor exactly: CourtListener requires `Token {{generic_api_key}}`, not Bearer. The gateway upserts the registered toolkit on the first `start_connect`; identical later upserts are no-ops, and a frozen-config conflict stops without deleting it. Hosted connect collects the vendor key. Do not paste the vendor token into the auth config or `auth-provider.env`.
