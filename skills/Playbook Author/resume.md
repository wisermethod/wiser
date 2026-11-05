# Resume checks

## Reconciliation

- Are there sibling Playbooks? Yes: read each sibling's Decision Log since this file's last update for decisions changing this file's decided answers. No: go on.
- Does the next action wait on a sibling's merge? Yes: locate it in that Playbook's milestone map and read the branch's edited-file set. Queue every piece it does not edit whose own gates are open, keeping the merge as a gate for dependent or overlapping work. Any eligible pieces? Yes: set Progress to the first; start them only if Resume step 2 permits resuming and step 3 leaves that work current. No: keep the wait. No merge wait: continue.

## Staleness

- Does the plan depend on third-party apps? Yes: re-read each app's release notes at every Resume and compare with Witness. No: go on.
- Does the plan depend on calls? Yes: reconcile who now serves each call and how it is gated, not only counts or versions. No: go on.
- Do target files have commits since the plan's base? Yes: read their commit messages for work already done or changed. No: use the current files. Base unknown: recover it before judging the plan current.
