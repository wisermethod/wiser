# Suite checks

- Is a suite cited as proof? Yes: run the whole suite as its runner selects it and list failing subtests by name. No: read the individual check's result.
- Did a control break setup? Yes: it proves nothing about the cases inside that setup, whether or not they registered. No: go on.
- Does a test compare paths? Yes: take the real path of its temporary directory and run under the default environment as well as the builder's. No: go on.
