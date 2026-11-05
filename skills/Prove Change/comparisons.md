# Comparison checks

## Provenance

- Does an arm run a model? Yes: name the model that actually ran it, the baseline included, and have the harness set its executor's model itself even when copying a session manifest. No: record that no model ran.

## Before running

- Will runs write into a member folder? Yes: give each run a reset copy before it starts; arms never share a writable folder and two apps never run on one folder at once. No: go on.
- Is the claim deterministic output? Yes: register and compare the run splits, including worker counts, and network states, online and offline; name those compared and limit the claim to them. No: go on.
- Is this a simulated-member round? Yes: read frozen build copies, compare builds on scores and a blind judge, and use host observation for anything a host displays; a simulation does not see the screen. No: go on.
- Is output quality the skill's value, or is this a quality bench? Yes: prove quality before building around it or starting Expand, on a fixed bench of several briefs, at least three blind readers per pair, and a pass rule, decision rule, noise check and tally fixed before the first run; compare one run against one run, snapshot each arm's first delivery before anything else touches it, and read first deliveries in two replicates. Measure a review or revision loop separately rather than giving extra rounds to one arm, and take the operator's look at lettered outputs before showing any tally. No: go on.
- Does a scripted requester line admit several readings? Yes: make it say one thing or register every reading it admits. No: keep it.
- Can the skill ask unregistered requester questions? Yes: register a neutral-answer policy before any case runs, such as accepting the skill's recommendation or saying an item does not exist, and record each answer verbatim. No: go on.
- Is added fault detection being measured? Yes: calibrate planted faults on the plain reader first and keep those it misses at a measured rate; faults it always names cannot discriminate. No: go on.
- Will a simulated approver look again after corrections? Yes: from its second look, accept minor findings as known limits; still change blocking, major, truth, contract and floor findings. No: go on.
- Is an answer blind or withheld? Yes: verify its seal by hash alone and open it only after the answer; a script that must test the sealed answer does so without printing it. No: go on.
