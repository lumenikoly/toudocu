# TASK-ARCH-001: Implement Question-Driven Architectural Documentation

- Status: Completed
- Type: Feature
- Priority: High
- Module: MOD-MODEL
- Use case: UC-DOCS-02
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Docu-docu Team
- Last updated: 2026-07-31

## Result

`docs/architecture/overview.md` is a required architecture map, and
every other Markdown document in `architecture/` responds to one explicit
architectural question and is directly listed in the overview.

## Behavior change

### Before

The `architecture/` directory was an optional set of specialized
Markdown documents without mandatory map, explicit question and increased
strictness of local links.

### After

Regular `check` requires a correct architecture overview, one non-empty question
for each detailed document, a direct recursive document map and
secure existing local links. Skill provides separate
RU/EN templates, safe init and semantic gate `ARCH001`–`ARCH013`.

## Scope

- `internal/app/docs_core.go`;
- `documentation_links.go`;
- `internal/app/markdown_parse.go`;
- `integration_test.go`;
- `screens_test.go`;
- `skill_templates_test.go`;
- `skills/docu-docu/`;
- `docs/`;
- `example/docs/`;
- `project-docs/`;
- `example/project-docs/`;
- `README.md`;
- `CHANGELOG.md`;
- `AGENTS.md`.

## Out of scope

- new Go command `docu-docu init`;
- changing `ProjectReport` schema v1 or `documents[].type` type;
- automatic migration of legacy architecture;
- checking punctuation, question words or architectural meaning in the CLI;
- Docu-docu documents about deployment or data ownership without confirmation
  architectural issue.

## Acceptance criteria

- [x] `AC-01` A regular check produces stable errors for a missing or
  mistyped overview, missing question and document out
  direct recursive map overview.
- [x] `AC-02` Architectural broken/blocked links are errors, and
  a non-punctuation non-blank question is acceptable.
- [x] `AC-03` JSON schema remains v1, and overview is serialized with
  `type: architecture`.
- [x] `AC-04` RU/EN skill assets contain separate overview/detail templates,
  minimal init creates `index.md` and overview, and legacy architecture
  stops init without automatic migration.
- [x] `AC-05` Managed guidance and semantic gate synchronously set type boundaries,
  direct overview map and codes `ARCH001`–`ARCH013`.
- [x] `AC-06` Docu-docu and Service Desk architecture divided into confirmed
  question-oriented documents, and both portals are reassembled only from
  original Markdown after independent review.

## Plan

- [x] Add metadata aliases and structural architecture diagnostics.
- [x] Expand behavioral and schema contract tests.
- [x] Update templates, init workflow, managed guidance and semantic gate.
- [x] Migrate Docu-docu and demo Service Desk documentation.
- [x] Perform an independent semantic review and eliminate the comments.
- [x] Go through full Go/Docu-docu verification and rebuild portals.

## Verification

- `AC-01` → `go test ./... -run 'TestArchitectureContract'`
- `AC-02` → `go test ./... -run 'TestArchitectureContract'`
- `AC-03` → `go test ./... -run 'TestArchitectureSchemaContract'`
- `AC-04` → `go test ./... -run 'TestUseDocu-docuArchitecture|TestUseDocu-docuInitContract'`
- `AC-05` → `go test ./... -run 'TestUseDocu-docuArchitecture'`
- `AC-06` → `go run ./cmd/docu-docu build ./docs --output ./project-docs --repository-root . --clean --strict --stale-days 0 && go run ./cmd/docu-docu build ./example/docs --output ./example/project-docs --repository-root ./example --clean --strict --stale-days 0`
- `ALL` → `go test -count=1 ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0 && go run ./cmd/docu-docu check ./example/docs --repository-root ./example --strict --stale-days 0`
- `QUALITY` → `go test ./... -run 'TestArchitectureContract|TestArchitectureSchemaContract|TestUseDocu-docuArchitecture'`

## Documentation impact

The public architecture contract, skill init and guidance are updated,
self-documentation Docu-docu, demo Service Desk, README, CLI/reference,
model, use case, changelog, documentation standard and monitored portals.