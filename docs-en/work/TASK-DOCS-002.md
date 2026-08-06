# TASK-DOCS-002: Add extensible Quality, Runbooks and Custom sections

- Status: Completed
- Type: Feature
- Priority: High
- Module: MOD-MODEL
- Use case: UC-DOCS-02
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Docu-docu Team
- Last updated: 2026-07-31

## Result

Docu-docu supports optional `STD-*` standards, operational
procedures `RB-*`, user top-level sections, their task connections,
schema-v1 collections, scaffolds and stand-alone portal catalogs.

## Behavior change

### Before

Unknown directories remained completely free-form, and Quality and Runbooks did not
had standardized contracts, task connections and a specialized portal.

### After

The appeared `quality/`, `runbooks/` and custom sections receive explicit manifest and
typed validation without new globally required files; task workflow
only transfers the explicitly bound `STD-*` and `RB-*`.

## Scope

- `internal/app/docs_core.go`;
- `quality.go`;
- `internal/app/knowledge.go`;
- `internal/app/types.go`;
- `report_types.go`;
- `internal/app/markdown_parse.go`;
- `internal/app/scaffold.go`;
- `internal/app/task_context.go`;
- `internal/app/task_ready.go`;
- `internal/app/task_verify.go`;
- `internal/app/site.go`;
- `quality_test.go`;
- `skills/docu-docu/`;
- `docs/`;
- `AGENTS.md`.

## Out of scope

- external dependencies;
- automatic comparison of task scope with the standard glob area;
- execution of commands directly from the standard;
- creating your own runbook without a real operational procedure;
- change the version of schema v1 or generator.

## Acceptance criteria

- [x] `AC-01` Standards, runbooks and custom manifests are validated with errors and warnings separated.
- [x] `AC-02` Freshness respects `--stale-days` boundaries, including disabling age-based overdue with `0` value.
- [x] `AC-03` Task references, conditional `QUALITY`, context and additive JSON save empty collections as `[]`.
- [x] `AC-04` RU/EN scaffolds are created atomically and do not invent the owner or check date of the runbook.
- [x] `AC-05` The standalone portal saves `processes` and adds catalogs, filters and four runbook metrics.
- [x] `AC-06` Self-documentation contains only verified standards and does not create a fictitious runbook.

## Plan

- [x] Add typed model, diagnostics, freshness and custom manifests.
- [x] Expand task workflow, schema v1 and scaffolds.
- [x] Add specialized catalogs and portal tests.
- [x] Update self-documentation and undergo semantic review.
- [x] Perform a full Go loop, strict-check, and secure portal rebuild.

## Verification

- `AC-01` → `go test ./... -run 'TestQualityMetadataStatusAliasesAndValidationBoundaries|TestTypedKnowledgeErrorsAndCustomManifest'`
- `AC-02` → `go test ./... -run TestStandardsRunbooksAndFreshness`
- `AC-03` → `go test ./... -run 'TestQualityTaskContextAndConditionalVerification|TestQualityDanglingReferencesAndAdditiveJSON'`
- `AC-04` → `go test ./... -run TestStandardAndRunbookScaffoldsAndCatalogs`
- `AC-05` → `go test ./... -run TestStandardAndRunbookScaffoldsAndCatalogs`
- `AC-06` → `go run ./cmd/docu-docu check ./docs --strict --stale-days 0`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --strict --stale-days 0`
- `QUALITY` → `go test ./... -run 'TestStandardsRunbooks|TestQualityTask|TestStandardAndRunbook|TestTypedKnowledge'`

## Documentation impact

Updated `README.md`, `CHANGELOG.md`, `docs/index.md`, `docs/modules/model.md`,
`docs/use-cases/check-documentation.md`, `docs/contracts/cli.md`,
`docs/reference/features.md`, `docs/guides/work-items.md` and
`skills/docu-docu/SKILL.md`; added guide
`docs/guides/quality-runbooks.md`, original section `docs/quality/`, updated
reference skill model and eight RU/EN skill templates standards, runbooks and their
manifest. The generated portals remain derived from Markdown.