# TASK-DOCS-002: Add standards, runbooks, and custom sections

- Status: Completed
- Type: Feature
- Priority: High
- Module: MOD-MODEL
- Use case: UC-DOCS-02
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Toudocu team
- Last updated: 2026-08-10

## Result

Toudocu supports optional `STD-*` standards, `RB-*` operational procedures,
and project-specific top-level sections. They are part of schema v1, have
their own portal catalogs, and can be linked to a work item explicitly.

## Behavior change

### Before

Unknown directories were unstructured Markdown. Standards and operational
procedures had no dedicated rules, work-item links, or portal pages.

### After

When `quality/`, `runbooks/`, or a custom section exists, it has an explicit
`index.md` and validated metadata. None of these sections becomes mandatory for
every project. A task context includes only the `STD-*` and `RB-*` documents
named by that task.

## Scope

- the model, Markdown parser, and diagnostics in `internal/app/`;
- scaffolding and task commands;
- specialized portal catalogs;
- the embedded skill, canonical documentation, and `AGENTS.md`.

## Out of scope

- external dependencies;
- automatic comparison of task scope with the standard glob area;
- execution of commands directly from the standard;
- creating a placeholder runbook when no real operational procedure exists;
- changing the schema v1 version.

## Acceptance criteria

- [x] `AC-01` Standards, runbooks and custom manifests are validated with errors and warnings separated.
- [x] `AC-02` Freshness respects `--stale-days` boundaries, including disabling age-based overdue with `0` value.
- [x] `AC-03` Task references, the conditional `QUALITY` set, task context, and additive JSON fields preserve empty collections as `[]`.
- [x] `AC-04` Russian and English scaffolds are created atomically and do not invent a runbook owner or review date.
- [x] `AC-05` The portal keeps the `processes` route and adds catalogs, filters, and four runbook metrics.
- [x] `AC-06` Toudocu's own documentation contains only confirmed standards and does not create a fictional runbook.

## Plan

- [x] Add typed model, diagnostics, freshness and custom manifests.
- [x] Expand task workflow, schema v1 and scaffolds.
- [x] Add specialized catalogs and portal tests.
- [x] Update the source documentation.

## Verification

- `AC-01` → `go test ./... -run 'TestQualityMetadataStatusAliasesAndValidationBoundaries|TestTypedKnowledgeErrorsAndCustomManifest'`
- `AC-02` → `go test ./... -run TestStandardsRunbooksAndFreshness`
- `AC-03` → `go test ./... -run 'TestQualityTaskContextAndConditionalVerification|TestQualityDanglingReferencesAndAdditiveJSON'`
- `AC-04` → `go test ./... -run TestStandardAndRunbookScaffoldsAndCatalogs`
- `AC-05` → `go test ./... -run TestStandardAndRunbookScaffoldsAndCatalogs`
- `AC-06` → `go run ./cmd/toudocu check ./docs --strict --stale-days 0`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --strict --stale-days 0`
- `QUALITY` → `go test ./... -run 'TestStandardsRunbooks|TestQualityTask|TestStandardAndRunbook|TestTypedKnowledge'`

## Documentation impact

The work updated the README, changelog, home page, model, validation use case,
CLI contract, references, and embedded skill. It added the standards and
runbooks guide and the `docs/quality/` section. Generated portals remain
derived from Markdown.
