# TASK-DOCS-004: Add refresh workflow to update documentation

- Status: Completed
- Type: Documentation
- Priority: High
- Module: MOD-MODEL
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Toudocu Team
- Last updated: 2026-07-31

## Result

The user explicitly runs a full or diff-limited documentation refresh;
skill checks Markdown against current sources of truth, applies provable
updates and terminates semantic and structural gates.

## Behavior change

### Before

Skill only updated the documentation for a specific request and did not have an explicit
workflow for systematic review of relevance.

### After

`$toudocu refresh` checks the entire project, and `$toudocu refresh diff`
checks staged, unstaged and untracked changes against `HEAD` and
dependent documentation. Both modes can update, delete and rename
documents with an unambiguous evidence base.

## Scope

- `skills/toudocu/`;
- `internal/app/cli.go`;
- `skill_templates_test.go`;
- `integration_test.go`;
- `README.md`;
- `CHANGELOG.md`;
- `AGENTS.md`;
- `docs/`;
- `project-docs/`;
- `example/project-docs/`.

## Out of scope

- new Go command `toudocu refresh`;
- separate read-only refresh workflow;
- merge-base or comparison with default branch;
- changing the code to comply with the documentation;
- updating `Last verified` without actually checking the runbook.

## Acceptance criteria

- [x] `AC-01` Skill routes `$toudocu refresh` and `$toudocu
  refresh diff` into a separate workflow without weakening the exclusivity of init.
- [x] `AC-02` Full mode checks all documentation, and diff mode uses
  `HEAD`, includes staged, unstaged and untracked files and expands coverage through
  documentation dependencies.
- [x] `AC-03` Workflow applies evidence-first update, secure policy
  dates, provable delete/rename/ID migration and honestly reports unresolved
  findings.
- [x] `AC-04` Semantic and structural gates precede conditional reassembly
  tracked portals; generated output is not editable as a source.
- [x] `AC-05` RU/EN guidance, metadata and user documentation
  synchronously describe both teams as skill-level workflows.
- [x] `AC-06` Go CLI still rejects `toudocu refresh` and full loop
  tests and strict verification complete without warnings/errors.

## Plan

- [x] Add refresh reference and command routing.
- [x] Synchronize managed guidance, metadata and self-documentation.
- [x] Fix full, diff, safety and no-CLI contracts with tests.
- [x] Conduct an independent semantic review and eliminate the comments.
- [x] Perform full verification and rebuild tracked portals.

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

## Documentation impact

Public workflow skill, RU/EN managed guidance, README are updated,
changelog, self-documentation, root `AGENTS.md` and both tracked portal.

## Use-case omission reason

The change determines the orchestration of the installed AI-skill and does not add
observable Go CLI command or script.