# TASK-DOCS-001: Add Toudocu self-documentation

- Status: Completed
- Type: Documentation
- Priority: High
- Module: MOD-MODEL
- Use case: UC-DOCS-02
- Owner: Toudocu Team
- Last updated: 2026-08-04

## Result

The repository contains its own consistent documentation that describes
current implementation and undergoes strict testing by Toudocu itself.

## Scope

- `docs/`;
- `README.md`.

## Out of scope

- changing the behavior of CLI or JSON schema;
- publication of release artifacts;
- generating and adding an output portal to Git.

## Acceptance criteria

- [x] `AC-01` Self-documentation passes `toudocu check --strict` without comments.
- [x] `AC-02` Modules, scripts, rules, roadmap and CLI contract are linked by stable IDs.
- [x] `AC-03` README contains a direct link to the project's original documentation.

## Plan

- [x] Capture the current state, architecture and product coverage.
- [x] Describe modules, use cases, business rules and public contracts.
- [x] Add risks, ADR, verification guide and parameter reference.
- [x] Link documents, run strict-check and complete Go loop.

## Verification

- `AC-01` → `go run ./cmd/toudocu check ./docs --strict --stale-days 0`
- `AC-02` → `go test ./... -run 'TestKnowledgeModel|TestMinimalDocumentationCheckAndBuild'`
- `AC-03` → `grep -Fq 'Исходная документация проекта' README.md && grep -Fq 'docs/index.md' README.md`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --strict --stale-days 0`

## Documentation impact

Created source design documents in `docs/`. README now leads to
`docs/index.md`; the generated portal remains a build artifact.