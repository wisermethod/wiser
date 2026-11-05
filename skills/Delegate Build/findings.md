# Verify a finding

Apply at Review step 7 before deciding a finding's outcome.

- Does the finding or proposed fix rest on code or third-party tool behaviour? Yes: run that code or tool on the finding's own input, and run the proposed fix on the real data it will meet before briefing or applying it; reading a tool's source alone does not test its behaviour. A run refutes the finding: state the measurement. A run refutes only the proposed fix: reject that fix, keep the supported finding, and choose and test another fix. No: no runtime check is needed.
- Does the disposition state a cost? Yes: read that cost's own record before writing the line, and state only what it supports. No: add no cost claim.
