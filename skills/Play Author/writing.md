# Writing checks

## Records

- Will this skill or a later primitive read a file it writes? Yes: specify its shape in the writing skill, key by key with types. No reader: define the output alone.
- Does a repair add a required key to a stored record? Yes: make the skill accept earlier records, or keep the field out of the record. No repair: keep the declared shape.

## Verification

- Is the run simulated? Yes: give it only what its reader would find on disk. No: use the real run's material.
- Is a case reconstructed from a past event? Yes: include what its sender held then, not only what the account quotes. No: use the current case's material.
- Does the change alter an existing stored-record format or what its reader requires? Yes: apply Records above and give the proof's change run a record the earlier version wrote. No: use the other cases.
- Does it read declarations to place output? Yes: for each declaration include a case whose root lacks it. No: use the other cases.
- Should it catch overreach? Yes: keep one request asking for slightly more than its sources hold. No: use the other cases.

## Repairs

- Does the fix turn live-run behaviour into a rule? Yes: check it against every rule governing the same call before writing, correcting a breach rather than codifying it. No: go on.
