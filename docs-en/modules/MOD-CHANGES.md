# MOD-CHANGES: Documentation changes

- Identifier: MOD-CHANGES
- Status: Ready
- Owner: Toudocu team
- Last updated: 2026-08-10

This module compares two explicitly selected states in the local Git
repository and produces one reproducible report for the CLI, CI, and local
portal.

## Purpose

Show the exact Git patch and, for known documents, add readable differences in
structure, relationships, and rendered output. The analysis does not use an AI
model.

## Code locations

- `internal/app/changes_*.go` — Git reads, comparison, report generation, and
  specialized views;
- `internal/app/server.go` — local API and report invalidation after a working
  tree change;
- `internal/app/changes_http.go` — HTTP route registry and the shared
  schema-v1 error format;
- `web/src/features/changes/` and `web/src/styles/changes.css` — the
  `serve`-only interface. Built assets are embedded from
  `internal/site/assets/generated/`.

## Boundaries

The module does not change the working tree, index, refs, or Git history.
Static `build` does not read history or include the Changes API. Markdown
rendering belongs to `MOD-MARKDOWN`; `MOD-SITE` supplies the page shell.

## Business rules

Paths, HTTP methods, and response schemas are defined in
[Changes OpenAPI](../contracts/changes.openapi.yaml). This module owns
comparison behavior and failure isolation.

### BR-CHANGES-001: Git is the only version source

The old side comes from the Git object database or index. The new side comes
from an explicitly selected commit, the index, or the working tree. Toudocu
keeps no independent history of documentation.

### BR-CHANGES-002: Original diff takes precedence

A failure in semantic analysis, Markdown rendering, Mermaid, or OpenAPI does
not hide an available Git patch or line statistics.

### BR-CHANGES-003: Range is always explicit

The report and UI show both requested and resolved range endpoints, the branch,
`HEAD`, and whether local changes exist. If the base branch is ambiguous, the
user must select it.

### BR-CHANGES-004: Public reports are limited to documentation roots

`ChangeSetReport`, the regular `changes` commands, and specialized document
views cover only configured documentation roots. Every path is relative to the
repository root and cannot read `.git` or escape the allowed roots.

Repository-wide file listing and discussions belong to
[MOD-REVIEW](MOD-REVIEW.md). They do not expand the public `ChangeSetReport`
schema or add source code to documentation reports from the CLI.

## Invariants

- Git runs directly, without a system shell, external diff handler, `textconv`,
  or `fetch`.
- Semantic comparison is reproducible and does not use an AI model.
- A `TASK-*` file is not counted as permanent project documentation.
- Full contents and rendered versions load only when requested.
- Existing `check` and static `build` behavior does not depend on this module.

## Stable interfaces

- `ChangeSetReport` schema v1;
- `changes` and `task changes`, including `--include-assets` and the complete
  translation input selected by `--translation-input`;
- read-only `/_toudocu/api/changes/`;
- diagnostic codes and comparison-range values.

## Related use cases

- [UC-DOCS-05: View documentation changes](../use-cases/UC-DOCS-05.md)
