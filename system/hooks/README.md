# Pre-commit check

This file travels with a clone. Git does not enable it. Once per clone, from
the plugin root:

    cp system/hooks/pre-commit .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit

The check scans the staged set only. It refuses operator build-workspace
paths so a reader who installs this plugin is not sent to a directory that
does not ship. It accepts the user-root homonym declared by
`standards/user-root.md` C3 and C8.

The pattern-definition line in `pre-commit` is a narrow disposition for the
expressions the check itself must contain. A planted operator citation on
any other line of that same file still fails.
