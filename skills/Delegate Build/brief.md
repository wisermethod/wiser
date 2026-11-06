# Brief additions

Apply while writing Brief step 4. Resolve an unanswered applicable question before sending the brief.

- Does a Playbook plan the work? Yes: copy its permitted edits word for word. No: use the task's authorized edits.
- Will the builder edit existing prose in an instruction, tool or standard file? Yes: state that every existing sentence stays in its place, word for word, unless a brief item quotes it, or names the span holding it, and gives the text that replaces it there; quoting it, or naming its file or step, as the place to add beside does not. No: add no keep-text line.
- Will the builder write a plugin? Yes: fetch `main`, diff it against the Playbook's recorded baseline commit and read what landed since before building; a branch name never establishes the baseline. Cut a worktree under the Playbook's gate directory from fetched `main` when it matches that commit, otherwise from the recorded commit. Name its absolute path as the only writable plugin checkout in `<targets>`. No recorded baseline or gate directory: settle it before building. No plugin writes: use the assigned checkout.
- Will the builder write proof logs or harnesses? Yes: put them in a separate evidence directory outside the plugin worktree and what ships, and add that directory's absolute path to `<targets>`. No: add no proof destination.
- Will the builder add regression tests? Yes: keep them in the shipped suites. No: add no test destination.
- Does a read bound exclude evidence the plan cites for a proved call? Yes: permit every cited file. No: keep the bound. Does it withhold a section? Yes: name the forbidden line range, never only the lines to read. No: add no range.
- Does the brief name a cited system's interface, fields, inputs or outputs? Yes: read and cite the whole path producing those values, refusals included; the definition line alone is insufficient. No: go on. Does a repair touch a record's shape? Yes: check the brief against that shape's binding conditions before sending it. No: go on.
- Is evidence being handed to a reviewer? Yes: select it with the verifier's own selection code, never a packet-specific selection rule. No: add no packet selector.
- Will text ship? Yes: use neutral examples in the brief. No: add no example constraint.
