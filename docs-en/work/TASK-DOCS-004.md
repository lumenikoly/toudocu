<!-- toudocu
version: 1
id: TASK-DOCS-004
status: done
taskType: documentation
priority: high
module: MOD-MODEL
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-10
-->

# TASK-DOCS-004: Add refresh workflow to update documentation


<!-- toudocu:section result -->
## Result

The user can explicitly refresh all documentation or limit the work to current
Git changes. The skill compares Markdown with the implementation, changes only
facts supported by repository evidence, and normally finishes with semantic
and structural review.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

The skill updated individual documents for a specific request but offered no
single workflow for reviewing the whole documentation set.

<!-- toudocu:section after -->
### After

`$toudocu refresh` covers all source documentation. `$toudocu refresh diff`
starts with staged, unstaged, and untracked changes relative to `HEAD`, then
adds documents affected by those changes. Either mode may update, delete, or
rename a document when the repository provides clear evidence.

<!-- toudocu:section scope -->
## Scope

- `skills/toudocu/`;
- CLI argument handling that confirms there is no Go `refresh` command;
- template and integration tests;
- README, changelog, `AGENTS.md`, and source documentation.

<!-- toudocu:section out-of-scope -->
## Out of scope

- new Go command `toudocu refresh`;
- separate read-only refresh workflow;
- merge-base or comparison with default branch;
- changing the code to comply with the documentation;
- updating `Last verified` without actually checking the runbook.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` The skill routes `$toudocu refresh` and `$toudocu refresh diff`
  to a dedicated workflow without treating either call as `init`.
- [x] `AC-02` Full mode reads all documentation. Diff mode uses `HEAD`, includes
  staged, unstaged, and untracked files, and follows documentation dependencies.
- [x] `AC-03` The workflow starts from evidence, changes dates and identifiers
  safely, and reports unresolved discrepancies honestly.
- [x] `AC-04` Semantic and structural review happens before a tracked portal is
  rebuilt. Generated output is never edited as a source.
- [x] `AC-05` Russian and English guidance describe both calls as skill
  workflows, not Go CLI commands.
- [x] `AC-06` The Go CLI rejects `toudocu refresh`.

<!-- toudocu:section plan -->
## Plan

- [x] Add refresh reference and command routing.
- [x] Synchronize managed guidance, metadata and self-documentation.
- [x] Cover full mode, diff mode, safety rules, and the absence of a Go command.
- [x] Review the documentation independently for meaning.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `go test ./... -run 'TestUseToudocuRefresh'`
- `AC-02` → `go test ./... -run 'TestUseToudocuRefresh'`
- `AC-03` → `go test ./... -run 'TestUseToudocuRefresh'`
- `AC-04` → `go test ./... -run 'TestUseToudocuRefresh'`
- `AC-05` → `go test ./... -run 'TestUseToudocuRefresh|TestUseToudocuMetadata|TestUseToudocuProjectGuidanceTemplates'`
- `AC-06` → `go test ./... -run 'TestCLIArguments|TestUseToudocuRefresh'`
- `ALL` → `go test -count=1 ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0 && go run ./cmd/toudocu check ./example/docs --repository-root ./example --strict --stale-days 0`
- `QUALITY` → `go test ./... -run 'TestUseToudocu'`

<!-- toudocu:section documentation-impact -->
## Documentation impact

The work updated the embedded skill, Russian and English managed guidance,
README, changelog, Toudocu's own documentation, and the root `AGENTS.md`.

<!-- toudocu:section use-case-omission-reason -->
## Use-case omission reason

This is a workflow of the installed AI skill, not a new Go CLI command or
user-facing script.
