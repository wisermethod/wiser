# Composio Setup

The first authentication and catalog provider. This file is the only place in the plugin that explains Composio, and the gateway repeats its short form whenever it answers `needs_provider`.

## What it does for you

Composio holds the grants. When you connect an account, you approve it at the vendor in your own browser, or type an API key into Composio's hosted page, and Composio keeps the token. The gateway on this machine asks Composio to make each call on your behalf and never sees the token. When you want to stop, you revoke at Composio, and the connection store tells you which accounts to revoke at the vendor too.

The free tier, read on 2026-09-05, allows one hundred thousand tool calls a month with no card. That covers an individual's use of this plugin many times over.

## Get a key

This key authenticates the gateway to Composio. It is not a GitHub token, not a Cloudflare token, and not a substitute for connecting an account. Vendor grants are approved in the browser and stay at Composio.

1. Create an account at composio.dev.
2. In the dashboard, create a project and an API key for it. The key needs permission to execute tools, including proxy execution, and to manage connected accounts.
3. Write the key to the credential file the gateway's `SETUP.md` names, as one line:

```
WISER_AUTH_PROVIDER_KEY=<the key>
```

`COMPOSIO_API_KEY=` is accepted as an alias in that file. Nothing else goes in it.

4. Restart your harness so the gateway starts with `--env` pointing at that file.

The key is a project key: anyone holding it can act as every account you have connected. Keep the file where the constitution says secrets live, and nowhere else.

## Connect an account

Through the gateway, by the `Connect Account` skill, never by typing a key into a conversation. For an OAuth service the skill hands you a link and you approve at the vendor. For an API-key service the hosted page collects the key from you directly; the skill never sees it. If a hosted page does not offer an API-key field for some service, that service moves to the local-file provider and its `auth.md` says so.

## The hosted endpoint, for clients that cannot run the gateway

Composio can expose a session as a hosted MCP endpoint that a hosted chat client attaches as a custom connector. You make one from the Composio dashboard or its SDK, with `mcp: true` on the session, and the client sends the `x-api-key` header it gives you. What that endpoint serves is Composio's stock catalog for the toolkits you named. It does not serve this plugin's connectors, its policy or its audit log, and it does not stop on `needs_connect`; it is a smaller thing than the gateway, and it is the only route for a client that cannot start a local process.

## Checking your account

Composio also ships a command-line tool that installs into your home directory and edits your shell startup file. Nothing in this plugin uses it. If you want to see what Composio thinks is connected, the dashboard shows it, and `list_connections` through the gateway shows what this plugin thinks is connected; the two should agree.
