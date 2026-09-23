# Hooks

One hook ships here, and it exists for the classifier. `hooks.json` registers it with a harness that loads plugin hooks.

| File | Runs when | What it does |
|------|-----------|--------------|
| `route.mjs` | A request is submitted, before the model starts | Puts the ask to `wiser.route.ask` through the gateway and, when the answer is confident and names a primitive in this root's indexes, adds one line naming that file. `wiser/AGENTS.md` `## Classifier` is what the line serves |

**It prints nothing and sends nothing** unless all three hold: the gateway's presence file says a classifier is attached and its process is alive; the working folder sits inside an owning root, the nearest `AGENTS.md` declaring a `type:`; and nothing at or above that folder declares `classifier_refusal: yes`. A plugin root and a workspace folder declare no `type:`, so a session started in one sends nothing, because the root that will own the request is not yet known.

**It does not send the named asks** `wiser/AGENTS.md` lists, which are handled before any call is made, and **it does not route to a tool**: a request enters at a skill or an expert, so a tool answer leaves the routing table to be read as today. Its line defers to the request: it names a file to load unless the request names another, or names an output that file does not yield.

**With no classifier attached** the hook still starts on every request and exits at once: about one short Node process, no output, and no tokens.

**What it cannot know, and does instead.** Before the model starts, a hook sees only the working folder. **It takes the working folder's root as the owning root**; a session started inside one root that works on a root composed beside it is routed under the first root's decision, so a root that refuses should be worked from a session started inside it. **A refusal anywhere above the working folder also stops it**, which is stricter than a refusal read from the owning root alone. **A gateway started with its own `--home` or `--env`** is not found, and the hook is then silent rather than wrong.

`lib/` holds what the hook shares: the presence and ownership checks, the roster built from the three family indexes, the one-shot gateway call, and the runner that keeps any error or timeout silent. `test/` runs offline: `WISER_HOOK_STUB_FILE`, a JSON file of answers by action id, stands in for the gateway, and is read only when that variable is set.
