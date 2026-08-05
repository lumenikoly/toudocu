# TASK-MODEL-001: Stabilize built-in sections and FLOW route

- Status: Completed
- Type: Maintenance
- Priority: High
- Module: MOD-MODEL
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Docu-docu Team
- Last updated: 2026-08-03

## Result

The model and portal use an ordered registry of built-in partitions,
localized project names, additive JSON `sectionType` and a single
directory `FLOW-*` via route `processes/index.html`.

## Scope

- `internal/app/sections.go`, model, config parser and portal;
- canonical route of the FLOW directory without legacy index in the source directory;
- `$docu-docu` init/refresh workflow;
- configuration, model, portal and CLI documentation.

## Out of scope

- multi-local assembly of one portal;
- migration fallback from H1 for built-in sections.

## Behavior change

### Before

Navigation and classification of built-in sections depended on directory lines, and
The section title may have been implicitly derived from H1.

### After

Stable SectionType and project configuration determine the route, order,
name and JSON representation of the built-in section; `flows` remains source
directory and the route of individual documents, and its directory becomes only
`processes`.

## Acceptance criteria

- [x] `AC-01` Twelve SectionTypes have a stable order and derived lookup.
- [x] `AC-02` Config accepts project-only locale and full sections map.
- [x] `AC-03` Invalid locales are rejected, but unknown valid locales are accepted.
- [x] `AC-04` Navigation, routes, HTML lang and report use SectionType.
- [x] `AC-05` Full Go and strict documentation verification pass.
- [x] `AC-06` The FLOW directory exists only as `processes/index.html`, its
  label is taken from `project.sections.flows`, and the FLOW page activates this
  navigation section.
- [x] `AC-07` Demo project sets full localized `project.locale` and
  `project.sections` and undergoes strict documentation check without warning.

## Verification

- `AC-01` → `go test ./... -run TestBuiltinSectionsStableOrderAndLookups`
- `AC-02` → `go test ./... -run TestProjectLocaleConfiguration`
- `AC-03` → `go test ./... -run TestProjectLocaleConfiguration`
- `AC-04` → `go test ./... -run TestMissingProjectConfigurationUsesEnglishAndWarning`
- `AC-05` → `go vet ./... && go test ./... && go test -race ./...`
- `AC-06` → `go test ./... -run TestScreenPortalAndReportV1`
- `AC-07` → `go run ./cmd/docu-docu check ./example/docs --repository-root ./example --strict --stale-days 0`
- `ALL` → `go vet ./... && go test ./... && go test -race ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0 && go run ./cmd/docu-docu check ./example/docs --repository-root ./example --strict --stale-days 0`
- `QUALITY` → `go test ./...`

## Plan

- [x] Add SectionType, registry and locale/config contracts.
- [x] Translate model, JSON and navigation to registry.
- [x] Record behavior with tests and update documentation.
- [x] Delete the legacy directory `flows/index.html` and rebuild the portals.
- [x] Add full project configuration of the demo portal.

## Documentation impact

Updated reference configuration, module contracts, CLI contract, README and
init/refresh instructions skill. Generated portal is rebuilt only after
successful strict structural check.

## Use-case omission reason

The change stabilizes the internal model and configuration contract; it's not
adds a standalone custom Docu-docu script.