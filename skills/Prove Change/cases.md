# Cases and inputs

## Acceptance

- Is a threshold being used on another engine, model or roster? Yes: recalibrate before judging it, using the owner's judgment where the original calibration rested on theirs. No: keep the calibration.
- Is a case expected to pass? Yes: check it against every stop the target declares before registering that expectation; a stop applies: register refusal or change the case. No: go on.

## Chained runs

- Is this run part of a chain that changes one artifact? Yes: before each run after the first starts, have it take a snapshot and record copy of the preceding run's after-state. No: go on.
- Has another run since changed the artifact whose result you are reading? Yes: read that earlier run against the snapshot and record copy the next run took before starting, never the live folder, and recheck every file opened by path against that snapshot's hashes; either copy is missing or a hash differs: leave the earlier result unverified. No: read the run's own after-state.

## Branch contracts

- Does the reader's record shape come from an unmerged branch? Yes: run its proof on that branch's plugin until it merges, rather than the shared checkout. No: use the plugin at the tested commit.

## Real inputs

- Does the claim join one tool's output to another's input? Yes: before its first review, run the producing tool's real output bytes through the consuming tool's own input checks and operation; a stand-in made to look like that output cannot carry the claim. No: go on.
- Does the claim introduce a media tool or path? Yes: before its first review, run the vendor's real output through the target tool's own input checks and operation; a prototype also runs the first caller's real input through those checks, not only its arithmetic. Synthetic fixtures alone cannot carry this claim. No: go on, using the acceptance's inputs only if the join question was also No.
- Does the proof move a file? Yes: file it onto the volume real work uses, including a cross-volume move where that is the real path. No: go on.
- Does the run write records? Yes: read every record against its skill's declared shape, including all keys, types and any key-equals-hash relation, not only fields the verifier uses. No: go on.
- Is a tool being proved? Yes: include one run from the plugin copy a member installs. No: go on.
- Is a gate being proved or described? Proved: name its mode and run the mode its real runner loads; its verdict holds only in that mode. Described: cite the source lines that load it. Neither: go on.

## Fixtures

- Does a guard precede a library route? Yes: place it where the library has parsed the request, such as its before hook, and test every way that route accepts input, including body, bare header and repeated fields of any size with the library's choice of value. No: use the guard's own input paths.
- Does the test claim text fits? Yes: feed real words and count each label's lines as well as overflow. No: go on.
- Does a skill ship the program being checked? Yes: run it once read-only against the real system before review and give the reviewer that output; mocks alone leave it unverified. No: go on.
- Does a skill gate work before handing it on? Yes: compare its rule with the downstream check of the same concept and include a fixture at any boundary where they disagree. No: use the rule's own boundary.
- Is a shared contract being proved? Yes: read every party's stated limits and put one input at the tightest bound before recording a pass. No: go on.
