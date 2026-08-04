# Verification

Final verification performed on 2026-07-26.

## Source checks

```text
gofmt: passed
go vet ./...: passed
go test -count=1 ./...: passed
go test -count=1 -race ./...: passed
external Go modules: none
statement coverage: 79.5%
```

Thirty-two top-level behavioural tests cover:

- Markdown analysis and safe rendering;
- tables, code, nested lists and checklists;
- model statistics and roadmap-only global progress;
- use-case-derived roadmap completion with manual contract and deliverable state;
- computed current work, blockers and next result in generated HTML;
- autonomous site generation and the typed ProjectReport schema v1;
- the TaskCheckReport schema v1 verification matrix;
- compact read-only TaskContextReport generation without command execution;
- broken-link diagnostics without generation failure;
- CLI argument compatibility;
- `task check` command planning, command deduplication and continued execution after failures;
- task-local validation gates, process-tree timeouts, start failures and bounded output capture;
- JSON stdout, atomic report output and protection of source documentation;
- the guarantee that ordinary `check` never executes verification commands;
- modules, use cases, business rules, minimal drafts and strict ready work items;
- repository links pinned to an exact ref;
- path traversal blocking;
- task dependency cycle detection;
- duplicate IDs and dangling references;
- health-page output collisions;
- destructive output-path and output-symlink protection;
- full `init → check → build` workflow.

## Starter project

```text
Documents: 12
Warnings: 0
Errors: 0
Generated HTML pages: 21
Broken generated links or anchors: 0
```

The implementation also passes Windows amd64 test-binary and CLI
cross-compilation.

## Release binaries

The release directory contains binaries for:

- Linux amd64;
- Linux arm64;
- macOS amd64;
- macOS arm64;
- Windows amd64.

All files pass `sha256sum -c dist/checksums.txt`.
