# Connectors

Authenticated access to outside platforms; `standards/primitives.md` owns the type's definition, invocation rules, and frontmatter. The directory is flat, and the index below is grouped by category.

The index is **hand-maintained**. `standards/primitives.md` says a family index is generated from primitive frontmatter at release. This root carries no generator, so nothing generates this file: it is written by hand from the frontmatter of what actually shipped, and it is corrected by hand when a connector is added, removed, renamed, or recategorized.

## How a connector is reached

Not by running anything in its directory. The gateway, `gateway/server.js`, loads every directory here at start, and a skill or expert asks for an action by id, `service.module.action`, through the gateway's `execute` tool. `gateway/AGENTS.md` says what a connector module receives and may do, and `gateway/SETUP.md` says how a person attaches the gateway and connects an account.

A connector directory holds four things: `CONNECTOR.md`, the typed file; `manifest.json`, every module and action with its privilege, risk, confirmation and execution preference; `index.js`, the actions; and `auth.md`, what a person does on the vendor's side to connect. A `tests/` directory runs the module against the gateway's fake provider and touches no account.

## What a connector writes

Nothing. A module may not write a file, install a package, or read a credential; the gateway's inventory in `gateway/AGENTS.md` is the whole of what this family writes, and it is written by the gateway.

## What a grant is made of

Five layers stand between a module and a vendor call. Which layer holds what answers most questions about connecting.

| Layer | Where it lives | What it holds |
|-------|----------------|---------------|
| Toolkit | Provider | The vendor surface: its base URL and the auth schemes it may carry. Shipped by the provider, or upserted by the gateway for a vendor the provider does not ship |
| Auth config | Provider | How to authenticate that toolkit: the scheme, and for OAuth the app and the scopes |
| Connected account | Provider | **The credential**, created when a person consents or pastes a key. The only place a secret exists |
| Connection record | `connections.json` | A pointer: this service and module use that connected account. Written once, when the grant goes ACTIVE |
| Module | Here | Nothing. It asks for a call by action id and sees none of the above |

A credential is therefore changed where it lives, on the connected account, and never by connecting again: `start_connect` creates a new account rather than replacing the one a record points at. Two ACTIVE accounts on one toolkit leave the pointer ambiguous, and the gateway takes that toolkit out of service rather than choosing. A record is written once and no shipped path removes one, so an account deleted at the provider still reads ACTIVE here.

## Grants are per module

A connection record is keyed by service and module. Two modules on one service are two grants and two `needs_connect` stops, even where the vendor would have accepted one broader grant, because the provider holds one grant per toolkit and a record that pretends otherwise cannot be honoured. The facade is naming and shared scope, never a shared token.

## Adding one

`skills/Connector Author/` does this from an approved plan; `experts/Connector Advisor/` produces the plan. After Connector Author writes the module, Connect Account is the human grant in its own turn. In use, the copy lands in the owning root's own `connectors/` and the gateway loads it with `--connectors`; this plugin is read-only in use, so a connector meant to ship here arrives by an authoring Playbook, never by a session. Copy `system/templates/Connector Template/`, never a connector from this directory. Every action id a primitive cites must resolve, and every action a manifest declares must exist in `index.js`; the gateway's `--check` refuses to start otherwise.

<!-- generated:index -->

### Development

| Connector | Description |
|-----------|-------------|
| `cloudflare/CONNECTOR.md` | Reaches Cloudflare DNS, the account's zones, Pages, and rulesets, with every removal confirmed |
| `github/CONNECTOR.md` | Reaches one GitHub account's repositories and issues to read them, list them, and open an issue, and reports the authenticated account |
| `vercel/CONNECTOR.md` | Reads projects and deployments and creates a deployment, uploading its files by reference, only with confirmation on every call |
| `stripe/CONNECTOR.md` | Reads customers and charges through one billing grant |
| `monday/CONNECTOR.md` | Lists boards and reads a page of board items |
| `supabase/CONNECTOR.md` | Lists projects and reads one project |
| `google-cloud/CONNECTOR.md` | Reads Google Cloud projects and IAM policy, lists and enables services, and creates restricted API keys, with every mutation stopping for confirmation |

### Analytics

| Connector | Description |
|-----------|-------------|
| `google/CONNECTOR.md` | Reads search performance, URL index state, sitemap details, analytics reports, Drive files, Calendar events, Gmail messages, spreadsheet values, documents, and presentations through eight separate grants |
| `clarity/CONNECTOR.md` | Exports Clarity metrics for the last one, two, or three days |
| `bing/CONNECTOR.md` | Reads Bing Webmaster Tools verified sites, search and page performance, crawl diagnostics, URL inspection, feeds, inbound links, and keyword research through one grant |

### Communication

| Connector | Description |
|-----------|-------------|
| `usebouncer/CONNECTOR.md` | Reads verification credits, verifies single addresses and batches, and resumes batch results by identifier |
| `zoom/CONNECTOR.md` | Lists meetings for a user and reads one meeting |
| `linkedin/CONNECTOR.md` | Reads the connected profile and one post |
| `microsoft/CONNECTOR.md` | Reads Outlook messages, Calendar events, OneDrive files, SharePoint lists, Excel values, and joined teams through six separate grants |

### Media

| Connector | Description |
|-----------|-------------|
| `replicate/CONNECTOR.md` | Lists curated model collections, starts confirmed predictions, and returns prediction status and output URLs |
| `google-apis/CONNECTOR.md` | Run PageSpeed Insights on one public URL, translate text through Google Cloud Translation, synthesize speech through Cloud Text-to-Speech, transcribe audio through Cloud Speech-to-Text, and annotate text through Cloud Natural Language |
| `google-vision/CONNECTOR.md` | Detects faces and returns eye coordinates for faces with both eyes available |
| `figma/CONNECTOR.md` | Reads file metadata and lists the files in a project |

### Research

| Connector | Description |
|-----------|-------------|
| `courtlistener/CONNECTOR.md` | Read CourtListener case law search, one docket, one opinion cluster, and the courts list |
| `dataforseo/CONNECTOR.md` | Reaches DataForSEO SERP, keyword, and backlink research through two grants, each recorded write because it spends, with every billed call confirmed |
| `tinyfish/CONNECTOR.md` | Search the web and fetch content from up to ten HTTPS URLs through Tiny Fish |
| `notion/CONNECTOR.md` | Searches pages and databases and reads page properties |
| `huggingface/CONNECTOR.md` | Reads model information and lists dataset metadata |

### CRM

| Connector | Description |
|-----------|-------------|
| `zoho/CONNECTOR.md` | Reads mail, Books and Invoice invoices, Desk tickets, Inventory and Bigin contacts through six read grants, and reads, searches, and creates CRM leads with confirmation |
| `hubspot/CONNECTOR.md` | Reads and searches contacts |

<!-- /generated:index -->
