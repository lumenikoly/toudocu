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

Fourteen behavioural tests cover:

- Markdown analysis and safe rendering;
- tables, code, nested lists and checklists;
- model statistics and roadmap-only global progress;
- autonomous site generation and JSON report;
- broken-link diagnostics without generation failure;
- CLI argument compatibility;
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

## Release binaries

The release directory contains binaries for:

- Linux amd64;
- Linux arm64;
- macOS amd64;
- macOS arm64;
- Windows amd64.

All files pass `sha256sum -c dist/checksums.txt`.
