# Connecting Zoho

See [gateway/SETUP.md](../../gateway/SETUP.md) for attachment and the gateway's provider setup. Connect Account is a separate human turn.

## On the platform's side, first

Use a Zoho account that can access the requested resources. If the organization restricts third-party apps, obtain its approval for the gateway's provider application. Prepare an OAuth blueprint for each module through the gateway's provider as described by [gateway/SETUP.md](../../gateway/SETUP.md).

## Through the gateway

1. Request "Connect Zoho" and name the module.
2. The skill runs `start_connect` for that service and module. Open its hosted link in your own browser.
3. Sign in to Zoho and approve the requested access in your browser.
4. The skill runs `connect_status`. Only ACTIVE unlocks that module.

This connector uses hosted connect only. No key belongs in this file or the conversation.

## Per-module notes

- `crm`: separate connect, write privilege; Last connected: 2026-09-09.
- `mail`: separate connect, read privilege; Last connected: 2026-09-09.
- `books`: separate connect, read privilege; Last connected: 2026-09-09.
- `desk`: separate connect, read privilege; Last connected: Not yet.
- `inventory`: separate connect, read privilege; Last connected: 2026-09-09.
- `invoice`: separate connect, read privilege; Last connected: 2026-09-09.
- `bigin`: separate connect, read privilege; Last connected: Not yet.

CRM remains a write grant for Leads. Bigin reads Contacts only. Mail, Books, Desk, Inventory, Invoice, and Bigin each require their own connect. Use the Zoho account and organization that hold the requested resources; hosted connect may ask for the applicable data center region and organization.

Books and Invoice read invoices, Desk reads tickets, and Inventory reads contacts.

## Revoking

Revoke each module through the gateway, then remove the application's access at Zoho Accounts connected applications.

## Rate limits

Live limits are UNVERIFIED. If a gateway status reports a rate limit, stop and follow the platform's current retry guidance before another call.

## Last connected

2026-09-09, `crm`, `mail`, `books`, `inventory`, and `invoice` ACTIVE. Hosted OAuth; live envelopes UNVERIFIED. `desk` skipped (no access). `bigin` skipped (no access).
