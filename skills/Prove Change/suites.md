# Suite checks

- Is a suite cited as proof? Yes: run the whole suite as its runner selects it on the committed tree, with colour off or control codes stripped, and read the test count and failing subtests by name; a setup that throws before cases register proves nothing about those cases. No: read the individual check's result.
- Was the first run in a staging copy? Yes: run it again where the code ships and replace assertions only that location makes true with ones that hold wherever it ships. No: go on.
- Does a test compare paths? Yes: take the real path of its temporary directory and run under the default environment as well as the builder's. No: go on.
- Does a test hide a tool? Yes: set `PATH` empty, never to the interpreter's own directory. No: go on.
