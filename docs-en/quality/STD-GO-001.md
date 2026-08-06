# STD-GO-001: Go code quality

- Identifier: STD-GO-001
- Status: Active
- Owner: Docu-docu Team
- Scope: Repository Go code and tests
- Last updated: 2026-08-06

This standard keeps the Docu-docu implementation small, predictable,
self-contained, and verifiable on supported Go platforms.

## Rules

1. Do not add an external dependency without an ADR, a pinned version, notices,
   a license check, and demonstrated need. A pure-Go dependency must preserve a
   self-contained binary and CGO-disabled cross-builds.
2. Public operations are invoked only by explicit commands; a path without a
   command does not trigger an implicit `build`.
3. Every new validation rule is accompanied by a behavioral test.
4. Every security fix is accompanied by a negative test.
5. Do not weaken `repository-root` checks or safe `--clean` behavior.
6. Keep ordinary `check`, `build`, `serve`, and `task context` from executing
   work-item commands.

## Automated checks

- `gofmt -w .`;
- `go vet ./...`;
- `go test ./...`;
- `go test -race ./...`;
- `go mod verify`;
- CGO-disabled cross-builds for supported targets.

Commands are run from a work item or trusted CI workflow, not directly from
this standard.
