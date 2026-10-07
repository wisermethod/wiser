# Gateway Setup

The user-facing named ask is **set up connectors**. `skills/Set Up Connectors/` leads a person to the route their app takes and names the one step their state needs; this file is the recipe that skill prints from.

The gateway loads the connectors this plugin ships, applies the policy, stops for approval before anything destructive, and keeps an audit line for every call. Every account it reaches is yours, connected by you, in your own browser, through an authentication provider that holds the grant. It runs in one of two places, as `standards/primitives.md` Connector Bodies states:

- **The Wiser endpoint**, the default in every app. The gateway runs inside the Wiser service, and you sign in to it once with your Wiser account. Section 1.
- **The local gateway**, on request, in a command-line harness: Claude Code, Codex, Grok or Cursor. It runs as one process on your machine, with a provider project key of your own. Sections 2 and 3.

Neither works offline: every connector call reaches the provider over the network.

## 1. The Wiser endpoint

**Its address has one home: the `url` of the `wiser` server in this plugin's `.mcp.json`.** Every step below that needs the address reads it there.

An app that installs this plugin and reads its `.mcp.json` attaches the endpoint with it, and until you sign in the endpoint offers no tools, so the next step is yours:

- **Claude Code, with this plugin installed:** run `/mcp`, choose Wiser, and sign in on the page that opens, or ask Wiser to set up connectors, which hands you the sign-in link. If you added Wiser as a folder with `/add-dir` instead, nothing declared the endpoint: run `claude mcp add --transport http --scope user wiser "<address>"` with the address from `.mcp.json`, then `/mcp`.
- **Claude Cowork, with this plugin installed:** open Customize, then Plugins, then Wiser, then its Connectors tab. Next to `wiser`, if it shows Not added, press Connect to add it, or, if you cannot, ask an Owner of your organization to add it; once it shows Not connected, press Connect and sign in. Do not add another Wiser connector because Customize, Connectors does not list it. Then start a new task.
- **Any other app**, such as Claude on the web or desktop, ChatGPT, Codex, Grok or Cursor: add the address from `.mcp.json` in the app's connector or MCP server settings as a remote server, and sign in when the app asks.

You sign in with Google or with a link sent to your email. There is no Wiser password, no key of yours goes into the conversation, and this plugin keeps nothing for the endpoint on your machine; your app keeps its own sign-in. Signed in, the app's tool list carries `whoami`, which says which Wiser account the app is using, beside the gateway's own seven tools named in section 2; `list_connections` lists the grants your account holds, and connecting one is section 4.

The endpoint serves the connectors this plugin ships. One it does not run, such as a connector that reads a key file on your own machine, answers `needs_provider_capability` with a `message` saying so, and its route is the local gateway. Connectors from a working folder or another plugin load only on the local gateway, through `--connectors`.

## 2. The local gateway

On request, in a command-line harness. The gateway is one local process: the harness starts it over stdio, and nothing here installs, because the gateway has no dependencies and starts on a fresh clone.

### Check it runs

```bash
node gateway/server.js help
```

Usage text, with nothing configured. Then:

```bash
node gateway/server.js --check --connectors "/absolute/path/to/wiser/connectors"
```

One JSON object naming every connector it loaded and every action it will serve. A validation error names the file and the field; the gateway refuses to start until it is fixed. `help` and `--check` do not create the project-key file.

### Attach it

Every local harness that speaks MCP over stdio takes the same three things: the command, its arguments, and nothing in the environment. Use absolute paths; a harness does not start where you think it does.

On first start the gateway creates the directory (0700) and an empty `WISER_AUTH_PROVIDER_KEY=` file (0600) if they are missing. It never overwrites a file that already exists and never writes a key value. `help` and `--check` do not do this. You do not run terminal commands to create the path.

If the project-key file is at the default path for this OS, omit `--env`. Otherwise pass `--env` with an absolute path.

Grok:

```bash
grok mcp add wiser-gateway -- node "/absolute/path/to/wiser/gateway/server.js" --harness grok
```

Then in this session open `/mcps` and press `r` to reload, or start a new chat. The current session does not pick up a newly added server by itself.

Claude Code, where the endpoint from section 1 may already be attached; the two are separate servers, and each answers on its own:

```bash
claude mcp add wiser-gateway -- node "/absolute/path/to/wiser/gateway/server.js" --harness claude-code
```

Run that in the same process that will use the gateway, so `CLAUDE_CONFIG_DIR` is inherited. When that variable is unset, Claude Code reads `~/.claude.json`. Launcher sessions set `CLAUDE_CONFIG_DIR=~/.claude` and read `~/.claude/.claude.json`. Those are two files. An attach in one does not appear in the other.

Codex:

```bash
codex mcp add wiser-gateway -- node "/absolute/path/to/wiser/gateway/server.js" --harness codex
```

Then start a new Codex session. The current session does not pick up a newly added server.

Cursor:

Write this block into `~/.cursor/mcp.json` (the user file, not a project file inside this plugin). Merge `wiser-gateway` if the file already has other servers. There is no `cursor mcp add`.

```json
{
  "mcpServers": {
    "wiser-gateway": {
      "command": "node",
      "args": [
        "/absolute/path/to/wiser/gateway/server.js",
        "--harness", "cursor"
      ]
    }
  }
}
```

Then start a new Agent chat. The current chat does not pick up a newly added server. If the tools are still missing, restart Cursor.

Any other harness that reads an `mcpServers` JSON block uses the same shape, with that host's label in `--harness`.

`--harness` is the label on each audit line. A normal start also writes `<home>/classifier-status/<harness>.json` after classifiers load. These flags matter:

| Flag | Default | Use it when |
|------|---------|-------------|
| `--home <abs dir>` | `~/.wiser/gateway` | You want the connection store and audit log somewhere else |
| `--role runtime\|readonly` | `runtime` | You want a second entry, `wiser-gateway-readonly`, for an agent that may read and never write |
| `--connectors <abs dir>` | the plugin's own | Your working folder carries connectors of its own; repeat the flag per directory |
| `--classifier <abs dir>` | none | You have a classifier directory to load from outside this plugin; repeat the flag per directory |
| `--secrets <abs dir>` | none | A connector uses the local-file provider and its credential file sits under one directory by the name its manifest gives |
| `--secret <service>=<abs file>` | none | The working folder's `AGENTS.md` binds `secrets:<service>` to a file of its own; repeat per service, and it wins over `--secrets` |
| `--call <action id>` | none | You want one first-party `wiser.*` action run through the same path as `execute`, printed as one JSON line, then exit. Any other id is refused and is not called. Does not write the presence file |
| `--route` | none | You want `wiser.route.roster` and then `wiser.route.ask` run in this one process, through the same path as `execute`. `--input` is an object with `rows` and `ask`. The ask result is printed as one JSON line, then exit. Both calls write an audit line. A roster result with no `roster_sha256` is printed and the ask is not run. Does not write the presence file |
| `--input <json>` | none | You are using `--call` or `--route`. Pass one JSON object, or `-` to read that object from stdin |

`--home` is screened before anything opens it: refused inside this plugin, beside a credential file, or on a symbolic link.

Restart the harness. Its tool list now carries `execute`, `start_connect`, `connect_status`, `disconnect`, `list_connections`, `search_actions` and `describe_action`. Actions that need the provider answer `needs_provider` until step 3. `list_connections` fills local metadata from ACTIVE grants this user id already has at the provider; it does not reconnect.

## 3. Give it a provider credential

**The local gateway only.** On the Wiser endpoint the provider credential is the service's, and you hold none.

Two different secrets. Do not mix them.

**Vendor grants (GitHub, Cloudflare, and the rest) never live on this machine.** You approve those at the vendor, or paste an API token into the provider's hosted page. The provider holds the token. The gateway's connection store records that the grant exists and never stores the token. That is the whole point of the provider.

**The one local file is the provider's own project key**, so this process can call the provider at all. It is not a GitHub token, not a Cloudflare token, and not an OAuth grant. A local process has no other way to authenticate to the provider, and this plugin does not use the provider's CLI (that CLI writes its own config under the home directory and edits shell startup files).

This file is **once per person on this machine**, not once per root. The harness starts one gateway for every workspace it opens. Step 2 created the empty file. You open that file, paste the project key after the equals sign, save, and restart the harness. You do not paste the key into chat.

The file sits outside every composed root and outside `--home`. When `--env` is omitted, the gateway uses:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/wiser/auth-provider.env` |
| Linux | `$XDG_CONFIG_HOME/wiser/auth-provider.env`, or `~/.config/wiser/auth-provider.env` if that variable is unset |
| Windows | `%APPDATA%\wiser\auth-provider.env` |

Those paths come from the current user profile. They are never a name baked into this plugin. Do not put the file in a root, including `memory/secrets/`. Account access is the gateway. A local-file connector key, if a root has one, is `--secret` or a Provides path, not this file.

The directory that holds this file is the **platform user-config directory**. Person-scoped model weights land in `models/` under it, listed in `tools/AGENTS.md`. Do not write weights into the key file. `--home` is not that `models/` folder.

The file holds three lines:

```
WISER_AUTH_PROVIDER_KEY=
WISER_USER_ID=
WISER_CLASSIFIER_KEY=
```

Paste the project key after the first equals. `WISER_USER_ID` is this person's id at the provider, the same on every machine. If that line is empty, the gateway writes a generated id into it on first use and never changes a key or an id that is already set. `WISER_CLASSIFIER_KEY` is the classifier key, optional; an empty line means the classifier is not subscribed. Copy this file to a new machine; do not copy `~/.wiser/gateway/`.

Which provider, how to get an account, how to make that project key, and how to add a toolkit blueprint (an auth config) in the provider's dashboard are the provider's own business: read `gateway/providers/<provider>/SETUP.md` for the one `gateway/providers/default.json` names. An auth config is a blueprint, not a grant. Connecting the account is still step 4. A gateway started with an empty file still starts, and every action that needs the provider answers `needs_provider` with that same walkthrough, so a harness that shows you the gateway's answer shows you the next step.

## 4. Connect an account

### Disconnecting

**`disconnect` is the only tool that removes anything, and it removes more than the module you name.** One credential backs every module of its toolkit that has no grant of its own, so disconnecting `google-apis/translate` may end `speech`, `voice` and `language` with it. The tool stops first and names every module bound to that credential **at the moment it asks**, along with the account it will revoke. Nothing happens until you say yes. **What you approve is that account and those modules.** A module bound to the account between the stop and your yes is not covered: the confirm is refused, a fresh stop names the current modules, and nothing is revoked. A module that attaches while the revoke itself is running attaches to a credential that is ending, so its record goes with the others.

It revokes at the provider, then asks the provider whether the credential is still there, and removes local records **only** when the provider says it is gone. A grant that is merely suspended keeps its records, because it is coming back. If the provider refuses the revoke, or cannot be reached, nothing local is removed and the answer says what each step did.

Your approval is bound to the account it named and to the modules the stop listed. If something reconnects that service between the stop and your yes, the call is refused rather than acting on a credential you did not approve. If a further module is bound to the account before you answer, the call is refused the same way.

A `readonly` entry cannot call it at all.

Connecting is its own turn, never a side effect of work, and the same on both routes. Ask for it in plain words: "Connect Cloudflare DNS." On the endpoint the provider and its blueprints are the service's, so you only approve at the vendor. The `Connect Account` skill runs `start_connect`, hands you a link or a file path, waits while you approve at the vendor in your own browser or write the file yourself, and then runs `connect_status` to record the grant. No key is ever typed into the conversation; if a skill asks you for one, that skill is wrong and you should stop.

What each vendor asks of you on its side is in that connector's `auth.md`.

## 5. What the gateway says, and what it means

Every answer is one JSON object. A `status` field on it usually means the work did not run, and each status names its own next step. **`disconnect` is the exception**: it answers `disconnected` when the teardown succeeded, and `teardown_incomplete` when it ran and did not finish, so for that tool a status is the outcome rather than a refusal.

**This table is the complete list of what the gateway can answer, for a person reading it.** When you are working through a status with an agent, `skills/Connection Troubleshooter/` is the diagnostic home: it takes the answer in hand, reads `op` and `reason` before the status word, and returns one next step. It covers these statuses and one more, `expired`, which is not a gateway answer but is what a `list_connections` row reads. The two are not copies of each other; this one enumerates, that one diagnoses.

| Status | Meaning | Next step |
|--------|---------|-----------|
| `needs_provider` | No credential file was given, or it is empty | On the local gateway, Set Up Connectors; step 3 supplies the file recipe. From the Wiser endpoint it is the service's own setup, not yours: write to support@wisermemory.com |
| `needs_connect` | This service and module is not connected, or its grant expired | Step 4. **Unless it carries `reason: nothing_to_disconnect`**, which comes from `disconnect` and means there is no recorded account to take down: stop there and do not connect anything |
| `needs_confirmation` | The action is destructive, writes for the first time, or a `confirm: true` did not match a stop for this exact input | Read the summary and say yes or no. **It names every declared value the call supplied**, arrays and objects included. A field the call omitted is absent. A value the stop would not show, a scalar that fails its own declaration or a value nested deeper than 32 levels, is not offered for approval: the call is `invalid_arguments`, naming the field and the reason, and nothing runs. A value cut at 120 characters carries its complete text on `input_values` as `full`, and the summary says so. Call once without `confirm`, show that stop, and repeat the identical call with `confirm: true` only after the person says yes. The approval is used once, lasts fifteen minutes, and is held in memory: a confirm with no matching stop, `reason: unmatched_confirm`, is a fresh stop, and a restart asks again |
| `denied` | The policy for this role forbids it | Use a different role, or leave it denied |
| `needs_connector` | Nothing in this plugin serves that action, or no connector declares it. **Or** a connection row whose connector was retired, which `connect_status` still refreshes: the answer carries `reason: orphaned_record` and `provider_status`, and the row is updated, but it is not `connected` because nothing can execute it | It is a gap; the primitive names it. **Unless it carries `reason: orphaned_record`**, in which case nothing declares this any more, the row now matches the provider, and there is nothing to connect |
| `needs_provider_capability` | The connector asked the provider for something it cannot do here | **From the Wiser endpoint with a `message`**, that connector does not run there: the message says so and names its route. Otherwise, from `execute`, the connector or the provider is wrong, not you; report it. **From `disconnect` it usually means only that this provider will not revoke this credential for you**, which is not a defect: revoke at the vendor by the route that connector's `auth.md` names under Revoking |
| `teardown_incomplete` | A `disconnect` ran and did not end with the credential gone | **Nothing local was removed.** The records that survive are recovery metadata and may be stale: neither their survival nor this status proves the credential is still there. The answer is what to believe, not the rows. `reason` says which case it is and each has one next step; Connection Troubleshooter names them. Do not simply retry: one of the cases means the state is unknown and retrying acts on it blind |
| `invalid_arguments` | A tool was called with something that is not an identifier, or an action was called with an input its published schema refuses. The answer names the field at fault | The agent mis-called the tool or the action, and nothing ran. A mis-called tool is refused before the audit line; a refused action's stop is audited by status, and neither the field name nor any value is. What an action accepts is its `input` in the connector's manifest, and `describe_action` returns it |
| `vendor_error` | The vendor refused | The status code and endpoint are in the answer; the body never is |
| `classifier_unbound` | A first-party classifier action was not sent, because the session has no verified binding with one owning root that does not refuse. The `reason` says which (`no-harness`, `no-pointer`, `stale-session`, `pending`, `not-ancestor`, `refused`, `no-owning-root` and the rest `hooks/AGENTS.md` lists). A harness that runs no plugin hooks always answers this | Nothing to fix when it is expected: routing and every tool fall back to their own path. Where a classifier is meant to answer, start the session inside the one owning root, on a harness that runs plugin hooks |
| `unavailable` | From the Wiser endpoint, with `reason: daily_limit`: this account has used its connector calls for the day | The answer's `message` says when it resets. Wait for it; retrying sooner answers the same |
| `uncertain` | From the Wiser endpoint, on any tool: the outcome of a call could not be confirmed, because one of its provider calls outlasted the endpoint's 20 seconds or failed, or its record could not be saved. **The call may have run**, and the endpoint does not retry it. `action` names the call in doubt: an action id for an `execute`, and `undeclared` for any other tool or for an `execute` of an action nothing declares. **It can be an earlier call than the one just made**: an `execute`, `start_connect`, `connect_status` or `disconnect` left in doubt is settled before the next call runs, and when that fails the next call answers `uncertain` about it and does not run | A read can be asked again. Before repeating a write, a destructive action or a teardown, read the state it would have changed. Where `action` names a call other than the one just made, that earlier call is the one to check, and the call just made did not run. A provider call that needs longer than 20 seconds does not fit the endpoint |
| `needs_subscription` | No classifier is loaded, or the `WISER_CLASSIFIER_KEY` line of the credential file is empty | Pass `--classifier` with an absolute directory if you have one, paste the classifier key after `WISER_CLASSIFIER_KEY=` in the file step 3 names, save, and restart. The first-party actions then appear in `search_actions`. An empty key line is the else path: primitives keep their own step |

## 6. What the gateway writes, and where

For the local gateway, `gateway/AGENTS.md` is the register. In short: a connection store and an audit log under `~/.wiser/gateway/`, both metadata, neither holding a token, and nothing inside the plugin. On the Wiser endpoint the gateway runs in the service and this plugin writes nothing; your app keeps its own sign-in.

## 7. Policy

On the Wiser endpoint the policy is the service's. On the local gateway, `gateway/policy.default.json` ships the rules. To change them, copy it to `~/.wiser/gateway/policy.json` and edit; the copy replaces the rules wholesale. The shipped default denies writes to `readonly`, denies `admin` to `runtime`, and requires confirmation on anything destructive.
