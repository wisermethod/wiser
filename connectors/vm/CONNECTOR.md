---
name: vm
type: connector
category: development
description: Reads health, facts and mapped host identifiers, runs a root command, reads and writes one file, and controls a systemd unit, with every command, write and unit change confirmed
version: 0.1.0
---

# Virtual machines

Reads health, facts and mapped host identifiers from a router you run, runs one root command, reads and writes one file, and controls one systemd unit. It does not reload the router, does not accept an argument vector for a unit action, and does not return an address.

## Status

Shipped 2026-09-26. Fake-provider checks only; no live call was made.

## Reaching it

Through the gateway, by action id. `machine` matches `^[a-z0-9][a-z0-9-]{0,62}$`. Length bounds below count code points. The gateway applies types, enums, patterns, required fields and item types before the module runs. The module applies `maxLength`, `minItems`, `maxItems`, the nonempty first argument, the encoded write size, and the lone-surrogate refusal.

```
vm.inventory.health       { machine }
vm.inventory.facts        { machine }
vm.inventory.list_hosts   {}
vm.command.run            { machine, argv }          confirmation: always
vm.files.read_file        { machine, path }
vm.files.write_file       { machine, path, content } confirmation: always
vm.units.status           { machine, unit }
vm.units.service          { machine, verb, unit }    confirmation: always
```

`vm.inventory.health` asks whether one mapped host answers. The result is the router's JSON, including an unreachable host.

`vm.inventory.facts` returns the router's output and its truncation flag. The router caps encoded output at 65536 bytes.

`vm.inventory.list_hosts` takes an empty object. The result lists mapped identifiers and whether each is the router host. It does not include an address, and it excludes withdrawn identifiers.

`vm.command.run` posts `{ machine, argv }` to `/exec`. `argv` is 1 to 64 strings, each at most 4096 code points, and the first element must be nonempty. Later elements may be empty. SSH reconstructs the vector as a remote shell command, and a root command can bypass file roots. An element the router cannot represent, including a NUL or a lone UTF-16 surrogate, comes back as outcome `quote_refused`. A body over the router's 262144-byte request cap comes back as outcome `oversize`.

`vm.files.read_file` posts `{ machine, path }` to `/read_file`. `path` matches `^/[^\u0000\r\n]*$`, is at most 4096 code points, and a lone UTF-16 surrogate is refused because it has no UTF-8 encoding. The router enforces its allowlist and its 262144-byte read limit. A path outside the allowlist comes back as outcome `path_refused`. A file over that limit comes back as outcome `oversize`.

`vm.files.write_file` posts `{ machine, path, content }` to `/write_file`. `path` follows the read rule. `content` is a string of at most 60000 code points, a lone UTF-16 surrogate is refused, and the encoded JSON body must be at most 262144 bytes. One call's worst case is that path, that content, and that byte cap. The router enforces confinement and the same request cap.

`vm.units.status` posts `{ machine, argv }` to `/service`, with `argv` built as `['systemctl', 'status', '--no-pager', unit]`. `unit` matches `^[A-Za-z0-9@._:-]{1,120}\.(service|timer|socket|target|path|mount)$`. A nonzero status still returns the router's output.

`vm.units.service` posts `{ machine, argv }` to `/service`, with `argv` built as `['systemctl', verb, unit]`. `verb` is `start`, `stop`, `restart`, `reload`, `enable`, or `disable`. The same unit pattern applies. Caller argv is never sent.

Every action returns the router's JSON, read from `outcome`. `ok`, `remote_failure`, `timeout`, `busy`, `path_refused`, `unknown_machine`, `truncated`, `oversize` and `quote_refused` are results. An outer provider or transport failure stays `vendor_error`.

## Credentials

This connector holds none. The gateway's provider holds the bearer for toolkit `CUSTOM_VM`. There is no credential file here, nothing is unwrapped, and there is no `secrets:vm` key. The bearer is root on every mapped host, so every module's grant privilege is `admin`.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `inventory` | `admin` | `health`, `facts`, `list_hosts` |
| `command` | `admin` | `run` |
| `files` | `admin` | `read_file`, `write_file` |
| `units` | `admin` | `status`, `service` |

A grant is per module. All four modules use one toolkit. How to connect is `auth.md`.

## Destructive Actions

| Action | Effect | Confirmation |
|--------|--------|--------------|
| `vm.command.run` | Runs the vector as root. SSH joins it into a shell command. A root command can bypass file roots. The connector cannot undo it. One call is at most 64 arguments of 4096 code points, and the router answers `oversize` past its 262144-byte request cap. | `always` |
| `vm.files.write_file` | Overwrites one file. The router confines the path to its allowlist. One call is a path of at most 4096 code points, content of at most 60000 code points, and an encoded JSON body of at most 262144 bytes. | `always` |
| `vm.units.service` | Runs `systemctl` with `start`, `stop`, `restart`, `reload`, `enable` or `disable` on one unit. The connector cannot undo it. | `always` |

`vm.files.read_file`, `vm.units.status`, and the inventory actions do not delete, overwrite, send or publish. Router reload and an arbitrary `/service` vector are not actions.

## Troubleshooting

`needs_connect`: connect the named module in its own turn using `auth.md`. Privilege on that stop is `admin`.

`needs_confirmation`: the call is `vm.command.run`, `vm.files.write_file` or `vm.units.service`. Read the summary, then repeat with `confirm: true` only when that call is the one you want.

`denied`: the shipped default policy denies privilege `admin` for the runtime role. These modules declare `admin` because the bearer is root on every mapped host. Until `policy.json` in the gateway home allows service `vm` at privilege `admin`, no request is sent.

`invalid_arguments`: the named field is missing, the wrong type, or outside a published bound. The first `argv` element must be nonempty. A path must be absolute, within 4096 code points, and free of a NUL, a carriage return, a line feed and a lone surrogate. Write content must be within 60000 code points, and the encoded JSON body must be within 262144 bytes.

`vendor_error`: the gateway's provider or the transport failed. The status and the endpoint are the safe fields. A router `outcome` is not this stop.

A router `outcome` of `unknown_machine`, `busy`, `timeout`, `path_refused`, `oversize`, `quote_refused`, `truncated` or `remote_failure` is the router's answer. Read it and decide the next step from that outcome. Do not retry a write or a unit change blindly: a `timeout` does not mean the change was undone.

## Reference

- How to connect: [auth.md](auth.md)
- The gateway and what a module may do: [gateway/AGENTS.md](../../gateway/AGENTS.md)
- What the published input schema must say, and who applies it: [standards/script-contract.md](../../standards/script-contract.md)
