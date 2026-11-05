# Delivery checks

Apply at Verify step 1 before accepting the delivery.

- Did the builder add or change tests? Yes: read their expectations against the brief; green tests can assert the defect. No: inspect the existing coverage the report cites.
- Did an exported function change? Yes: read its whole diff for changes in meaning beyond the brief, even if old tests pass. No: add no export check.
- Does the diff touch an allow-list, gate or policy line? Yes: read every such line against the brief before fold-back. No: add no policy check.
- Does a fix add a setting? Yes: measure it at its default on the real reference input before accepting it. No: add no default measurement.
- Did an executor compute a rule? Yes: inspect its first real output, its first frames where applicable, before trusting review. No: add no computed-output check.
