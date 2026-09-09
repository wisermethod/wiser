# Connecting {{SERVICE_TITLE}}

What you do, on which side, to make `{{SERVICE}}.*` actions run. The Connect Account skill walks this in its own turn; this file is what it reads.

## On the platform's side, first

Only if the platform needs something prepared before the grant: an API token made with named permissions, an application approved by an organisation owner, a plan that includes API access. Numbered steps, in the platform's own vocabulary, ending with the narrowest grant that serves this module. If nothing needs preparing, say "Nothing to prepare" and why.

## Through the gateway

1. Say "Connect {{SERVICE_TITLE}}" and name the module.
2. The skill runs `start_connect` and hands you a link, or a file path if this connector uses the local-file provider.
3. For a link: open it in your own browser and approve at the platform, or paste the token into the provider's hosted page. For a file: write the named variables into that file yourself. In neither case does anything get typed into the conversation, and a skill that asks for that is wrong.
4. The skill runs `connect_status`. On `ACTIVE`, the gateway writes a connection record and the module's actions run from then on.

## The other route

This template covers both: a hosted link (`catalog`) and a bound file (`local-file`). Keep the steps for the one this connector uses. Rewrite this heading as "The route this connector does not use" and name the unused path, so a person is not offered it. A personal token in chat is never a route. The GitHub connector is the worked example.

## Revoking

Always two places: through the gateway, then at the platform. Name where at the platform.

## Last connected

Not yet. The first successful connect is recorded here with its date.
