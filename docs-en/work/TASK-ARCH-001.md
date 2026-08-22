<!-- toudocu
id: TASK-ARCH-001
status: done
taskType: feature
priority: high
module: MOD-MODEL
useCase: UC-DOCS-02
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-10
-->

# TASK-ARCH-001: Organize architecture documentation around questions


<!-- toudocu:section result -->
## Result

`docs/architecture/overview.md` is the required architecture map. Every other
Markdown document under `architecture/` answers one explicit question and is
linked directly from the overview.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

The `architecture/` directory was an optional collection of documents with no
required map, explicit questions, or strict rules for local links.

<!-- toudocu:section after -->
### After

A regular `check` requires a valid overview, one non-empty question in each
detailed document, direct links to every document including nested ones, and
safe local links that point to existing files. The skill provides separate
Russian and English templates and applies semantic rules `ARCH001`–`ARCH013`.

<!-- toudocu:section scope -->
## Scope

- document and link parsing in `internal/app/`;
- architecture-contract and template tests;
- `skills/toudocu/`;
- source documentation, README, changelog, and `AGENTS.md`.

<!-- toudocu:section out-of-scope -->
## Out of scope

- new Go command `toudocu init`;
- changing `ProjectReport` schema v1 or `documents[].type` type;
- automatic migration of legacy architecture;
- checking punctuation, question words or architectural meaning in the CLI;
- Toudocu documents about deployment or data ownership without confirmation
  architectural issue.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` A regular check reports stable errors when the overview is
  missing, has the wrong type, a question is absent, or a document is not in
  the overview's direct map.
- [x] `AC-02` Broken or disallowed architecture links are errors. A non-empty
  question does not have to end with a question mark.
- [x] `AC-03` JSON schema remains v1, and overview is serialized with
  `type: architecture`.
- [x] `AC-04` The skill has separate Russian and English templates for the
  overview and detailed answers. Minimal `init` creates `index.md` and the
  overview; legacy architecture stops initialization instead of being migrated
  automatically.
- [x] `AC-05` Managed guidance and semantic review use the same type boundaries,
  direct overview map, and `ARCH001`–`ARCH013` codes.
- [x] `AC-06` Toudocu architecture is split into evidence-backed answers, and
  the portal is built from source Markdown.

<!-- toudocu:section plan -->
## Plan

- [x] Add metadata aliases and structural architecture diagnostics.
- [x] Expand behavioral and schema contract tests.
- [x] Update templates, the initialization workflow, managed guidance, and
  semantic review rules.
- [x] Convert Toudocu and demo documentation to the new structure.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `go test ./... -run 'TestArchitectureContract'`
- `AC-02` → `go test ./... -run 'TestArchitectureContract'`
- `AC-03` → `go test ./... -run 'TestArchitectureSchemaContract'`
- `AC-04` → `go test ./... -run 'TestUseToudocuArchitecture|TestUseToudocuInitContract'`
- `AC-05` → `go test ./... -run 'TestUseToudocuArchitecture'`
- `AC-06` → `go run ./cmd/toudocu build ./docs --output ./project-docs --repository-root . --clean --strict --stale-days 0 && go run ./cmd/toudocu build ./example/docs --output ./example/project-docs --repository-root ./example --clean --strict --stale-days 0`
- `ALL` → `go test -count=1 ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0 && go run ./cmd/toudocu check ./example/docs --repository-root ./example --strict --stale-days 0`
- `QUALITY` → `go test ./... -run 'TestArchitectureContract|TestArchitectureSchemaContract|TestUseToudocuArchitecture'`

<!-- toudocu:section documentation-impact -->
## Documentation impact

The work updated the architecture contract, skill initialization and guidance,
Toudocu documentation, README, CLI reference, model, use case, changelog, and
documentation standard.
