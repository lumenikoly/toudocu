# Compatibility fixtures

`compatibility-corpus.json` defines the stage-0 legacy differential cases. Each
case compares exit code, stdout, stderr, and declared side effects. Isolated
cases copy a project into a temporary Git repository with fixed commit dates.

Coverage includes:

- JSON and text/Markdown output for check, search, changes, file changes, and task changes;
- version, build artifacts, generated routes, and a local serve probe (health, disabled update check, read-only static response, shutdown);
- task ready/candidates/context/tree/verify/init/archive/restore and all scaffold entity kinds;
- staged, unstaged, untracked, rename, copy, and type Git changes, with status/module/type/permanent filters;
- skill install/update/uninstall and isolated agent next/respond plus invalid queue responses;
- Unicode, duplicate headings, raw HTML, malicious/active URLs, SVG/XML, Mermaid, and invalid CLI options.

Allowed normalization is limited to temporary absolute paths, timestamps and
generated archive years, generator/version output, and task verification's
nondeterministic `durationMillis`, plus the installed Go version and platform
in the `go version` verification command's stdout. Change reports additionally validate the
legacy `changeSetDigest` against the unnormalized report, then recalculate it
after replacing only the temporary repository root; the resulting digest is
compared, so a field mismatch cannot be hidden by normalization.

The corpus does not claim platform coverage, browser coverage, or the full
Unicode source-position matrix; those belong to the workspace and browser
tests. It intentionally avoids performance measurements.
