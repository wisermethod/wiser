---
name: vercel
type: connector
category: development
description: Reads projects and deployments and creates a deployment, uploading its files by reference, only with confirmation on every call
version: 0.2.0
---

# Vercel

Reads projects and deployments and creates a deployment, uploading its files by reference, only with confirmation on every call.

## Status

Shipped 2026-09-08. Live connect 2026-09-08: `projects` and `deployments` ACTIVE, re-verified 2026-09-17. Catalog lists `{ projects, pagination }` and `{ deployments, pagination }`.

`create` **has run**: a deployment succeeded live on 2026-09-14, `dpl_AonCe3igyVt1sV2ut38p8vJbe4vA`, READY and PROMOTED.

Upload by reference added 2026-09-17, and it closes a blocking gap rather than a convenience. Until it existed there was no compliant way to deploy an ordinary site through this plugin at all: `skills/Vercel Deploy/` routes every deployment through the gateway, the only payload form was an inline `files` array, and a 962,496-byte site is 1,283,376 base64 characters in a single call. The platform CLI is not a fallback — `skills/Vercel Deploy/SETUP.md` forbids connecting an envelope or owning root to the platform, which `vercel deploy` does by writing a project link into the tree. The inline-only limit closed the only door rather than narrowing it.

Verified 2026-09-17 against a real 38-file, 962,496-byte site: all 38 files uploaded by reference, and the resulting create body was 3,824 bytes against roughly 1,283,328 inline. See `auth.md`.

## Reaching it

Through the gateway by action id. Input fields are declared in `manifest.json`.

```
vercel.projects.list         { team_id?, limit?, slug? }
vercel.projects.get          { id_or_name, team_id?, slug? }
vercel.deployments.list      { project_id?, team_id?, limit?, slug? }
vercel.deployments.upload_file  { path, name?, team_id?, slug? }                     confirmation: always
vercel.deployments.create    { name, dir? | files? | git_source?, project?,
                               project_settings?, target?, skip_auto_detection?,
                               team_id?, slug? }                                     confirmation: always
```

Projects and deployments are separate grants, both write-capable. The three reads use the catalog; `upload_file` and `create` reach the platform directly. `team_id` or `slug` selects the team. Inputs use the manifest names, remapped to platform field casing.

### Giving `create` its files

`create` takes exactly **one** source. Supplying none, or more than one, is `invalid_arguments`, and an empty string, `[]` or `{}` counts as a source you supplied and got wrong, never as one you omitted.

| Source | Meaning |
|--------|---------|
| `dir` | A directory. Every file under it is uploaded by reference and named relative to it |
| `files`, as an array of path strings | Only the files you name are uploaded, each named by its basename |
| `files`, as an array of objects | The platform's own array, passed through: `{ file, sha, size }` for something already uploaded, or `{ file, data }` to inline a small file |
| `git_source` | An existing repository and revision; nothing is uploaded |

A mixture of path strings and objects in one `files` array is refused, as is a duplicate deployment name, which would otherwise let the last file silently win.

`create` returns `{ deployment, uploaded, skipped }`. `uploaded` is the manifest of every file **this call uploaded**, with its digest and size, so the payload is reviewable after the fact; it is empty when you passed the platform's own array or a `git_source`, because nothing was uploaded. `skipped` names every file the screen refused and why; nothing is ever dropped in silence.

### What the path screen does, and what it does not

`upload_file`, `dir` and a path-string `files` array all take caller-named paths, so `standards/script-contract.md` Caller-named paths governs them and its Credentials rule forbids this module reading a credential file. Each path is canonicalized against the filesystem, walking up to the deepest ancestor that exists; a path that cannot be canonicalized is refused rather than compared as the text it was spelled with. The result is then compared **by device and inode**, the identity a hard link keeps and no spelling reaches, against the platform user-config directory and everything resolving inside it. The comparison is recursive over that directory, so a hard link to something nested inside it is caught too. A `dir` walk also requires every file to resolve inside the resolved root, so a symbolic link pointing out of the tree is skipped rather than followed, and a link **to** a directory is never walked, so a `loop -> .` cannot send the walk round forever. An entry named `.git` is excluded whatever kind of entry it is, because a worktree's is a regular file naming a path outside the tree. `.env` and `.env.*` are refused wherever they appear, and a deployment name that is not a safe relative POSIX path is refused before anything is uploaded. Only regular files are sent. An upload's display name may keep the spelling you gave it; the bytes always come from the resolved path.

**This is not a general data-loss boundary and cannot be one.** Two cases are outside it, named here rather than left to be discovered:

- A credential you keep inside the directory you named, under a name this module cannot recognise, is uploaded.
- A credential the gateway itself knows about, bound by `--secret` or sitting in a `--secrets` directory, or a provider key file at a non-default `--env` path, is **not** in the refused set. A module may not read gateway configuration, so it cannot learn those locations. Closing that would need a screening capability the gateway does not yet offer.

`confirmation: always` and the returned `uploaded` manifest are the controls for both. The gateway's confirmation summary names the input *fields* you supplied and not their values, so when you ask someone to confirm a `dir` deployment, state the resolved directory in the request.

### Two limits worth knowing before you rely on them

- **Reference lifetime is not documented.** `create` uploads and deploys in one action, so its window is seconds. A `upload_file` you call separately and cite in a later `create` may find the reference expired; nothing here bounds that.
- **Scale is bounded only by what has been run.** 38 files, 962,496 bytes, largest file 175,488 bytes. Uploads run one at a time. Nothing excludes rate limits, request timeouts, or memory pressure above that.

`project_settings` is required by the platform for a project's **first** deployment and is passed through unchanged. `skip_auto_detection` suppresses the confirmation the platform returns when it detects a framework differing from the project's settings.

## Credentials

This connector holds no credential. Each grant lives with the gateway's provider and is made in your browser. There is no credential file in this directory.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `projects` | write | `list`, `get` |
| `deployments` | write | `list`, `upload_file`, `create` |

Each module has its own grant. Privilege describes the grant, not just these actions.

## Destructive Actions

| Action | Effect | Confirmation |
|--------|--------|--------------|
| `deployments.upload_file` | Sends a local file to the platform's file store | always |
| `deployments.create` | Reads the named source, uploads it, and publishes a deployment | always |

`upload_file` does not publish anything, and it still requires confirmation on every call, because it sends local bytes to an outside service. A confirmed `create` uploads its own files under that one confirmation; it does not ask once per file.

Spent credits cannot be recovered by this connector. This connector does not read or modify environment variables, and does not delete projects.

## Troubleshooting

`needs_connect`: connect the named module in its own human turn using `auth.md`.

`needs_confirmation`: review the action and input, then repeat with `confirm: true` if intended. For a `dir` deployment, confirm against the resolved directory, which the summary does not carry.

`invalid_arguments`: correct the named field. A `reason` of `credential` means the path resolved onto the provider's key directory or a `.env` file; `outside the named directory` means a link pointed out of the tree.

`vendor_error` while **uploading**: the run stopped at that file. No later file was uploaded and no deployment request was sent. `vendor_error` on the **deployment request itself** carries no such guarantee — the platform may have accepted it and the response been lost. Do not repeat the call. Reconcile against a deployment list scoped to the project and team first, as `skills/Vercel Deploy/` step 5 requires.

`vendor_error`: inspect the safe status and endpoint, then check access, input, and quota at the platform. Do not paste a raw vendor error body into chat.

## Reference

- How to connect: [auth.md](auth.md)
- Gateway setup: [gateway/SETUP.md](../../gateway/SETUP.md)
- Platform reference: https://vercel.com/docs/rest-api
