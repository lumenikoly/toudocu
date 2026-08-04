# Verification

Final verification performed on 2026-07-25.

## Source checks

```text
gofmt: passed
go vet ./...: passed
go test -count=1 ./...: passed
go test -count=1 -race ./...: passed
external Go modules: none
```

Twenty-nine top-level behavioural tests cover:

- Markdown analysis and safe rendering;
- tables, code, nested lists and checklists;
- model statistics and roadmap-only global progress;
- use-case-derived roadmap completion with manual contract and deliverable state;
- computed current work, blockers and next result in generated HTML;
- autonomous site generation and JSON report;
- the TaskCheckReport schema v1 verification matrix;
- broken-link diagnostics without generation failure;
- CLI argument compatibility;
- `task check` command planning, command deduplication and continued execution after failures;
- task-local validation gates, timeouts, start failures and bounded output capture;
- JSON stdout, atomic report output and protection of source documentation;
- the guarantee that ordinary `check` never executes verification commands;
- modules, use cases, business rules and work items;
- repository links pinned to an exact ref;
- path traversal blocking;
- task dependency cycle detection;
- duplicate IDs and dangling references;
- health-page output collisions;
- destructive output-path protection;
- full `init → check → build` workflow.

## Starter project

```text
Documents: 12
Warnings: 0
Errors: 0
Generated HTML pages: 21
Broken generated links or anchors: 0
```

The P2 implementation also passes a Windows amd64 test-binary cross-compilation.

## Release binaries

The release directory contains binaries for:

- Linux amd64;
- Linux arm64;
- macOS amd64;
- macOS arm64;
- Windows amd64.

All files pass `sha256sum -c dist/checksums.txt`.
