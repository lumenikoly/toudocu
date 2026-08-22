<!-- toudocu
id: TASK-CLI-003
status: done
taskType: maintenance
module: MOD-CLI
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-21
-->

# TASK-CLI-003: Make Go CLI output English

<!-- toudocu:section result -->
## Result

All labels and messages produced by the Go CLI are in English, regardless of
the language of source documentation.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

CLI help, text reports, success messages, and server-start output mixed Russian
and English. JSON diagnostics were already in English.

<!-- toudocu:section after -->
### After

The Go CLI uses English for its labels, explanations, and messages. Russian
scaffolds selected with `--lang ru` translate only reader-facing text. Hidden
annotations — field names, section kinds, and permitted values — are identical
in Russian and English scaffolds. The CLI does not translate reader-facing
headings or other source-document text.

<!-- toudocu:section scope -->
## Scope

- user-facing help, text reports, success messages, and startup output in
  `internal/app/`;
- behavioral tests for representative text responses from commands;
- the CLI-language invariant in `docs/contracts/cli.md`;
- the boundary between CLI interface text and source data in
  `docs/modules/cli.md`.

<!-- toudocu:section out-of-scope -->
## Out of scope

- translating canonical project documentation or configured translation roots;
- removing `--lang ru` scaffolds;
- translating reader-facing headings, paths, or metadata values;
- choosing the CLI interface language at runtime.

<!-- toudocu:section use-case-omission-reason -->
## Reason for omitting a use case

This change standardizes how existing commands are presented; it does not add a
new user scenario.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` General and contextual help use English interface text without
  Russian labels.
- [x] `AC-02` Text output from `check`, `build`, `serve`, `changes`, `search`,
  `task`, and `agent` uses English labels and messages.
- [x] `AC-03` Russian scaffolds remain supported and use the same hidden
  machine annotations as English scaffolds.
- [x] `AC-04` The public CLI contract states that the Go CLI uses English and
  preserves source-document values.

<!-- toudocu:section plan -->
## Plan

- [x] Translate existing Go user-facing strings in place.
- [x] Update affected test expectations and add a regression check.
- [x] Update the CLI contract and module rule.
- [x] Run the required Go and documentation checks.
- [x] Obtain an independent review of the work-item behavior and contract.

<!-- toudocu:section verification -->
## Verification

- `AC-01` -> `go test ./internal/app -run 'TestCLIHelpUsesEnglish|TestContextualHelp'`
- `AC-02` -> `go test ./internal/app`
- `AC-03` -> `go test ./internal/app -run 'TestTaskInitAndScaffoldAtomicCreate|TestScaffoldLanguageDefaultsToProjectLocale|TestTaskInitWithParent'`
- `AC-04` -> `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `ALL` -> `go test ./...`
- `DOCS` -> `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` -> `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section documentation-impact -->
## Documentation impact

- `docs/contracts/cli.md` — language of help, messages, and text reports;
- `docs/modules/cli.md` — boundary between CLI interface text and source data.
