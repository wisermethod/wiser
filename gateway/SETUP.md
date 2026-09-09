# Gateway Setup

Attaching the connection gateway to a harness, and what to do when it says it needs something.

The gateway is one local process. A harness starts it over stdio, it loads the connectors this plugin ships, and every account it reaches is yours, connected by you, in your own browser, through an authentication provider that holds the grant so this machine does not. Nothing here installs: the gateway has no dependencies and starts on a fresh clone.

## 1. Check it runs

```bash
node gateway/server.js help
```

Usage text, with nothing configured. Then:

```bash
node gateway/server.js --check --connectors "/absolute/path/to/wiser/connectors"
```

One JSON object naming every connector it loaded and every action it will serve. A validation error names the file and the field; the gateway refuses to start until it is fixed. `help` and `--check` do not create the project-key file.

## 2. Attach it

Every local harness that speaks MCP over stdio takes the same three things: the command, its arguments, and nothing in the environment. Use absolute paths; a harness does not start where you think it does.

On first start the gateway creates the directory (0700) and an empty `WISER_AUTH_PROVIDER_KEY=` file (0600) if they are missing. It never overwrites a file that already exists and never writes a key value. `help` and `--check` do not do this. You do not run terminal commands to create the path.

If the project-key file is at the default path for this OS, omit `--env`. Otherwise pass `--env` with an absolute path.

Grok:

```bash
grok mcp add wiser-gateway -- node "/absolute/path/to/wiser/gateway/server.js" --harness grok
```

Then in this session open `/mcps` and press `r` to reload, or start a new chat. The current session does not pick up a newly added server by itself.

Claude Code:

```bash
claude mcp add wiser-gateway -- node "/absolute/path/to/wiser/gateway/server.js" --harness claude-code
```

Any harness that reads an `mcpServers` JSON block:

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

`--harness` is a label for the audit log and nothing else. Two other flags matter:

| Flag | Default | Use it when |
|------|---------|-------------|
| `--home <abs dir>` | `~/.wiser/gateway` | You want the connection store and audit log somewhere else |
| `--role runtime\|readonly` | `runtime` | You want a second entry, `wiser-gateway-readonly`, for an agent that may read and never write |
| `--connectors <abs dir>` | the plugin's own | Your working folder carries connectors of its own; repeat the flag per directory |
| `--secrets <abs dir>` | none | A connector uses the local-file provider and its credential file sits under one directory by the name its manifest gives |
| `--secret <service>=<abs file>` | none | The working folder's `AGENTS.md` binds `secrets:<service>` to a file of its own; repeat per service, and it wins over `--secrets` |

`--home` is screened before anything opens it: refused inside this plugin, beside a credential file, or on a symbolic link.

Restart the harness. Its tool list now carries `execute`, `start_connect`, `connect_status`, `list_connections`, `search_actions` and `describe_action`. Actions that need the provider answer `needs_provider` until step 3.

## 3. Give it a provider credential

Two different secrets. Do not mix them.

**Vendor grants (GitHub, Cloudflare, and the rest) never live on this machine.** You approve those at the vendor, or paste an API token into the provider's hosted page. The provider holds the token. The gateway's connection store records that the grant exists and never stores the token. That is the whole point of the provider.

**The one local file is the provider's own project key**, so this process can call the provider at all. It is not a GitHub token, not a Cloudflare token, and not an OAuth grant. A local stdio gateway has no other way to authenticate to the provider: a hosted MCP session still sends the same key as a header, and this plugin does not use the provider's CLI (that CLI writes its own config under the home directory and edits shell startup files).

This file is **once per person on this machine**, not once per root. The harness starts one gateway for every workspace it opens. Step 2 created the empty file. You open that file, paste the project key after the equals sign, save, and restart the harness. You do not paste the key into chat.

The file sits outside every composed root and outside `--home`. When `--env` is omitted, the gateway uses:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/wiser/auth-provider.env` |
| Linux | `$XDG_CONFIG_HOME/wiser/auth-provider.env`, or `~/.config/wiser/auth-provider.env` if that variable is unset |
| Windows | `%APPDATA%\wiser\auth-provider.env` |

Those paths come from the current user profile. They are never a name baked into this plugin. Do not put the file in a root, including `memory/secrets/`. Account access is the gateway. A local-file connector key, if a root has one, is `--secret` or a Provides path, not this file.

The file holds one line:

```
WISER_AUTH_PROVIDER_KEY=
```

Which provider, how to get an account, how to make that project key, and how to add a toolkit blueprint (an auth config) in the provider's dashboard are the provider's own business: read `gateway/providers/<provider>/SETUP.md` for the one `gateway/providers/default.json` names. An auth config is a blueprint, not a grant. Connecting the account is still step 4. A gateway started with an empty file still starts, and every action that needs the provider answers `needs_provider` with that same walkthrough, so a harness that shows you the gateway's answer shows you the next step.

## 4. Connect an account

Connecting is its own turn, never a side effect of work. Ask for it by name: "Connect Cloudflare DNS." The `Connect Account` skill runs `start_connect`, hands you a link or a file path, waits while you approve at the vendor in your own browser or write the file yourself, and then runs `connect_status` to record the grant. No key is ever typed into the conversation; if a skill asks you for one, that skill is wrong and you should stop.

What each vendor asks of you on its side is in that connector's `auth.md`.

## 5. What the gateway says, and what it means

Every answer is one JSON object. A `status` field on it means the work did not run, and each status names its own next step.

| Status | Meaning | Next step |
|--------|---------|-----------|
| `needs_provider` | No credential file was given, or it is empty | Step 3 |
| `needs_connect` | This service and module is not connected, or its grant expired | Step 4 |
| `needs_confirmation` | The action is destructive or writes for the first time | Read the summary; say yes or no |
| `denied` | The policy for this role forbids it | Use a different role, or leave it denied |
| `needs_connector` | Nothing in this plugin serves that action, or no connector declares it | It is a gap; the primitive names it |
| `needs_provider_capability` | The connector asked the provider for something it cannot do here | The connector or the provider is wrong, not you; report it |
| `invalid_arguments` | A tool was called with something that is not an identifier | The agent mis-called the tool; nothing was logged or run |
| `vendor_error` | The vendor refused | The status code and endpoint are in the answer; the body never is |

## 6. What the gateway writes, and where

`gateway/AGENTS.md` is the register. In short: a connection store and an audit log under `~/.wiser/gateway/`, both metadata, neither holding a token, and nothing inside the plugin.

## 7. Hosted clients

A client that cannot start a local process, such as a hosted chat product, cannot attach this gateway. It can attach the provider's own hosted MCP endpoint instead, which the provider's `SETUP.md` describes. What it gets there is the provider's stock catalog: no connectors from this plugin, no policy, no audit, no `needs_connect` discipline. That is a different, smaller thing, and it is documented here so nobody mistakes it for this one.

## 8. Policy

`gateway/policy.default.json` ships the rules. To change them, copy it to `~/.wiser/gateway/policy.json` and edit; the copy replaces the rules wholesale. The shipped default denies writes to `readonly`, denies `admin` to `runtime`, and requires confirmation on anything destructive.
