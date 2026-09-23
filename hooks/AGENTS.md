# Hooks

One hook ships here, and it exists for the classifier. `hooks.json` registers it with a harness that loads plugin hooks.

| File | Runs when | What it does |
|------|-----------|--------------|
| `route.mjs` | A request is submitted, before the model starts | Puts the ask to `wiser.route.ask` through the gateway and, when the answer is confident and names a primitive in this root's indexes, adds one line naming that file. `wiser/AGENTS.md` `## Classifier` is what the line serves |

**It prints nothing and sends nothing** unless all three hold: the gateway's presence file says a classifier is attached and its process is alive; the working folder sits inside an owning root, the nearest `AGENTS.md` declaring a `type:`; and nothing at or above that folder declares `classifier_refusal: yes`. A plugin root and a workspace folder declare no `type:`, so a session started in one sends nothing, because the root that will own the request is not yet known.

**With no classifier attached** the hook still starts on every request and exits at once: about one short Node process, no output, and no tokens.

`lib/` holds what the hook shares: the presence and ownership checks, the roster built from the three family indexes, the one-shot gateway call, and the runner that keeps any error or timeout silent. `test/` runs offline, with a stub in place of the gateway.
