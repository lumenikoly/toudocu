<!-- toudocu
id: TASK-DOCS-001
status: done
taskType: documentation
priority: high
module: MOD-MODEL
useCase: UC-DOCS-02
updated: 2026-08-10
-->

# TASK-DOCS-001: Add Toudocu self-documentation


<!-- toudocu:section result -->
## Result

The repository contains Toudocu's source documentation. It describes the
implemented behavior and is validated by Toudocu itself in strict mode.

<!-- toudocu:section scope -->
## Scope

- `docs/`;
- `README.md`.

<!-- toudocu:section out-of-scope -->
## Out of scope

- changing the behavior of CLI or JSON schema;
- publication of release artifacts;
- generating and adding an output portal to Git.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` Source documentation passes `toudocu check --strict` without diagnostics.
- [x] `AC-02` Modules, use cases, rules, roadmap, and CLI contract are connected by stable IDs.
- [x] `AC-03` README links directly to the project's source documentation.

<!-- toudocu:section plan -->
## Plan

- [x] Capture the current state, architecture and product coverage.
- [x] Describe modules, use cases, business rules and public contracts.
- [x] Add risks, ADR, verification guide and parameter reference.
- [x] Link documents, run strict-check and complete Go loop.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `go run ./cmd/toudocu check ./docs --strict --stale-days 0`
- `AC-02` → `go test ./... -run 'TestKnowledgeModel|TestMinimalDocumentationCheckAndBuild'`
- `AC-03` → `grep -Fq 'Исходная документация проекта' README.md && grep -Fq 'docs/index.md' README.md`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --strict --stale-days 0`

<!-- toudocu:section documentation-impact -->
## Documentation impact

Created the canonical `docs/` root. README now links to
`docs/index.md`; the generated portal remains a build artifact.
