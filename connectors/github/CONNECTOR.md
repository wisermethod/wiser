---
name: github
type: connector
category: development
description: Reaches one GitHub account's repositories and issues to read them, list them, and open an issue, and reports the authenticated account
version: 0.1.0
---

# GitHub

The reference connector: the smallest complete example of a module the gateway serves, every action of it stock catalog work behind this plugin's own ids. Reach for it to read a repository, list what an account can see, list or open issues, and confirm which account is connected.

## Status

Live connect 2026-09-08, operator, Grok with `wiser-gateway`: the `repos` module is ACTIVE. Catalog execute of `github.repos.get` on `wisermethod/wiser` returned the repository. `users` and `issues` are separate grants and were not connected. Tests still run against the fake provider.

## Reaching it

Through the gateway. A skill asks for an action by id and the gateway answers with the result or with a status that names the next step; `gateway/SETUP.md` lists them. Nothing in this directory is run directly.

```
github.users.me
github.repos.get            { owner, repo }
github.repos.list_for_user  { per_page?, page? }
github.issues.list          { owner, repo, state? }
github.issues.create        { owner, repo, title, body? }     confirmation: once
```

## Credentials

This connector holds none. The grant lives with the gateway's provider, made by you in your own browser; `auth.md` says what GitHub asks on its side. There is no credential file and no `secrets:github` key.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `users` | read | `me` |
| `repos` | write | `get`, `list_for_user` |
| `issues` | write | `list`, `create` |

Three modules are three grants. The `users` module asks for the narrowest scope so a person can confirm who they are without granting write to anything; the other two share what the provider's GitHub toolkit asks for.

## Destructive Actions

None. `issues.create` writes and is gated `once`: the first call in a session returns `needs_confirmation` with the title and target, and runs on the re-call that carries `confirm: true`. Nothing here deletes, closes, merges, or changes a repository, and adding an action that does is a manifest row with `confirmation: always` and a row in this section, in one change.

## Troubleshooting

**`needs_connect`** The module is not connected. Run the Connect Account skill for `github` and the module named.

**`vendor_error` with status 404 on `repos.get`** Either the repository does not exist or the connected account cannot see it. A private repository the account was not granted reads as absent, not as forbidden.

**`vendor_error` with status 403** A rate limit or a missing scope. The answer carries the endpoint; `users.me` confirms the account is still connected before anything else is tried.

## Reference

- How to connect: `auth.md`
- The gateway and what a module may do: `gateway/AGENTS.md`
- GitHub's REST reference: https://docs.github.com/en/rest
