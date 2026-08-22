<!-- toudocu
id: STD-GO-001
status: active
scope: Go-код и тесты репозитория
updated: 2026-08-22
-->

# STD-GO-001: Go code quality


This standard keeps the Toudocu implementation small, predictable,
self-contained, and verifiable on supported Go platforms.

<!-- toudocu:section rules -->
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

<!-- toudocu:section automated-checks -->
## Automated checks

- `gofmt -w .`;
- `golangci-lint run ./...` with the standard `errcheck`, `govet`, `ineffassign`,
  `staticcheck`, and `unused` set;
- `go test ./...`;
- `go test -race ./...`;
- `go mod verify`;
- CGO-disabled cross-builds for supported targets.

Developers, work items, or trusted CI workflows run these commands; the
standard itself does not. Golangci-lint remains a local quality tool and is not
a dependency or part of the distributed Toudocu binary.
