# MOD-CHANGES: Documentation changes

- Identifier: MOD-CHANGES
- Status: Completed
- Owner: Toudocu Team
- Last updated: 2026-08-05

The module turns explicitly selected Git source documentation states into
a deterministic report for the CLI, CI, and local portal.

## Purpose

Receive read-only Git snapshots, accurately show text changes and
complement them with a comparison of the normalized project model without an LLM.

## Code location

- `internal/app/changes_*.go` — comparison, Git adapter, reports, and specialized diffs;
- `internal/app/server.go` — read-only changes API and live invalidation;
- `internal/app/changes_http.go` — declarative route registry and the common schema-v1 error envelope;
- `web/src/features/changes/`, `web/src/styles/changes.css` — serve-only
  browsing interface; the generated bundle is embedded from `internal/site/assets/generated/`.

## Module boundaries

The module does not change the working tree, index, refs or Git history. Static
`build` does not receive history and does not enable the changes API. Markdown rendering
remains the responsibility of `MOD-MARKDOWN`, and the portal shell is `MOD-SITE`.

## Business rules

Wire-level paths, methods, responses, and schemas are defined by
[Changes OpenAPI](../contracts/changes.openapi.yaml); this module owns
comparison and isolation behavior.

### BR-CHANGES-001: Git is the only version source

The old side is read from the object database or index, the new side is read from explicitly
selected revision, index or working tree. Toudocu does not save its own
history of documentation.

### BR-CHANGES-002: Original diff takes precedence

Error semantic, rendered, Mermaid or OpenAPI parsing does not hide available
Git patch and file statistics.

### BR-CHANGES-003: Range is always explicit

The report and UI show requested and resolved base/target, branch, HEAD and dirty
state. An ambiguous base branch requires user selection.

### BR-CHANGES-004: Analysis limited to documentation roots

Public paths are canonical, relative to the repository root and cannot be read
`.git` or files outside the allowed roots.

## Invariants

- Git is called directly without shell, external diff, textconv and fetch;
- semantic diff is deterministic and does not use LLM;
- the task file is not included in the summary of permanent documentation;
- full source and rendered payload are loaded lazily;
- existing `check` and static `build` retain the same result.

## Stable interfaces

- `ChangeSetReport` schema v1;
- CLI `changes` and `task changes`;
- read-only `/_toudocu/api/changes/`;
- diagnostic codes and comparison enums.

## Related use cases

- [UC-DOCS-05: View documentation changes](../use-cases/UC-DOCS-05.md)
