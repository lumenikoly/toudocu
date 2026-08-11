# BUG-CLI-001: Reject Changes flags in other commands

- Type: Bug
- Status: Completed
- Severity: Low
- Priority: Normal
- Reproducibility: Always
- Regression: No
- Module: MOD-CLI
- Use case: Not applicable
- Standards: STD-GO-001, STD-DOCS-001
- Last updated: 2026-08-10

## Symptom

The CLI accepted `--base`, `--branch-base`, `--status`, `--module`, and
`--permanent-only` in commands that do not use Changes.

## Expected behavior

A command-specific flag outside `changes`, `changes file`, and `task changes`
ends argument parsing with a nonzero exit code and a clear error.

## Actual behavior

For example, `check ./docs --base definitely-not-a-ref` succeeds and silently
ignores the value.

## Steps to reproduce

1. Run `check` with one of the Changes flags.
2. Observe a successful check instead of an argument error.

## Evidence

The command `check ./docs --base definitely-not-a-ref` exited with code `0`.
The parser filled the `Change*` fields but did not check which command owned
them outside the Changes branch. The repository does not show earlier strict
behavior, so this bug is not marked as a regression.

## Cause

The parser checks applicability for most flags through individual booleans, but
there is no shared gate for Changes flags.

## Relationship to user behavior

This is the general CLI argument contract rather than a separate product use
case: the user receives false confirmation that a parameter was applied in any
command.

## Scope

- `internal/app/cli.go`;
- `internal/app/integration_test.go`;
- `docs/work/BUG-CLI-001.md`.

## Out of scope

- changing the semantics of applicable Changes filters;
- adding new flags;
- changing exit codes for valid commands.

## Plan

1. Record whether each Changes-only flag was supplied.
2. Add a single command-ownership gate.
3. Cover both flag forms with a table-driven regression test.

## Acceptance criteria

- [x] `AC-01` The regression test rejects both forms of every Changes-only flag
  in the build, check, serve, search, scaffold, and task-lifecycle command
  families.
- [x] `AC-02` The same flags remain accepted by `changes`, `changes file`, and
  `task changes`.

## Verification

- `AC-01` → `go test ./internal/app -run TestChangeFlagsRejectedOutsideChanges`
- `AC-02` → `go test ./internal/app -run TestChangeFlagsRejectedOutsideChanges`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

## Regression test

The table-driven test checks both forms of every Changes-only flag in all
unrelated command families and in the three supported Changes commands.

## Documentation impact

Only this historical record changed. The CLI contract already documents which
commands accept these flags.
