# STD-GO-001: Go Code Quality

- Identifier: STD-GO-001
- Status: Active
- Owner: Docu-docu Team
- Scope: Go code and repository tests
- Last updated: 2026-08-03

The standard keeps Docu-docu implementation small, predictable,
dependency-free and testable on supported Go platforms.

## Rules

1. Do not add external dependency unless proven necessary.
2. Public operations are called only by explicit commands; there is no way without a command
   runs the implicit `build`.
3. Each new validation rule should be accompanied by a behavioral test.
4. Each security fix must be accompanied by a negative test.
5. Do not weaken the check of `repository-root` and secure `--clean`.
6. Save the usual `check`, `build`, `serve` and `task context`
   not executing work item commands.

## Automatic checks

- `gofmt -w .`;
- `go vet ./...`;
- `go test ./...`;
- `go test -race ./...`.

Commands are run from work item or trusted CI workflow, and not directly from
this standard.