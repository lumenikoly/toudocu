# Keep reports outside model context

Text is the default for check, bounded search, changes and task maps. JSON
check includes the whole project model; task list/context embeds Markdown;
changes embeds patches/rendered content; verification embeds command logs.
Never display these wholesale to extract a few fields. Save authorized temporary
reports outside source documentation, then project selected fields in a subprocess.

For check/verification, the bundled offline helper reads JSON from stdin and
returns at most 12 KiB, without project/document bodies or stdout/stderr:

```bash
node <skill-dir>/scripts/report-summary.mjs check < <saved-check.json>
node <skill-dir>/scripts/report-summary.mjs verify < <saved-verification.json>
node <skill-dir>/scripts/report-summary.mjs verify 5 5 < <saved-verification.json>
```

`<skill-dir>` is this SKILL.md's actual directory, not a guessed installation.
Positional arguments are mode, offset (default 0), limit (default 5, max 20).
Every collection reports total/offset/nextOffset; the same offset applies to
each collection independently. Follow remaining relevant pages before declaring
success. Long individual records cause an explicit size error, not silent clipping;
use a smaller page or extract the specific fields/excerpt separately. The helper
is a presentation view, not a public CLI schema or a readiness/validation gate.
Verification retains `target` and `fullVerification`: a target-only `passed`
report is not proof that the whole task or full verification cycle passed.

Capture the producing command's exit code before running any formatter. Never
pipe a failing check through a successful formatter and mistake its exit code
for validation success. Example in a POSIX shell, using an authorized temporary
path and the project's flags:

```bash
toudocu check <docs-root> --repository-root <root> --format json > <saved-check.json>
check_status=$?
node <skill-dir>/scripts/report-summary.mjs check < <saved-check.json>
printf 'Toudocu exit: %s\n' "$check_status"
```

Add strict only when required. A helper error or omitted page never proves the
CLI passed. Do not rerun commands just to read another page of a current report.

For other JSON, select only the requested IDs/paths/statuses/issues; preserve
counts and indicate omissions. Search uses a small limit and precise query.
Changes start with a file map, then selected hunks. Test/build/run logs stay in
separate files; show exit/status summaries and a bounded relevant failure excerpt,
not a fixed tail as proof that earlier errors were absent. Keep raw reports for
further targeted inspection. An old saved report is no proof of current state.
