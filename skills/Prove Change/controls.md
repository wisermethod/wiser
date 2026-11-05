# Control checks

- Does a control replay a file's as-found text? Yes: name the commit, confirm it exists with `git cat-file -e <commit>^{commit}`, and read the file from that commit, never the branch head; a missing commit stops the replay. No: go on.
- Does a control delete a required pattern? Yes: delete every occurrence and the text the pattern reads, not only its matched span; for a lookahead matching an empty span, remove every containing paragraph it tests. No: go on.
- Does a case have several assertions? Yes: prove each claim's assertion against the old code on its own; give each later assertion a defect that passes earlier assertions and reaches it. No: use the case's single assertion.
- Can more than one check refuse the same case? Yes: add a keep-everything and a keep-nothing control; breaking only one refusing check cannot show the case able to fail. No: use its refusing check's control.
- Are control totals about to be cited? Yes: match controls to checks by name both ways and list checks without controls and controls without checks before counting; unmatched names leave coverage incomplete. No: go on.
