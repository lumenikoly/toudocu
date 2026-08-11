# TASK-MODEL-001: Stabilize built-in sections and FLOW route

- Status: Completed
- Type: Maintenance
- Priority: High
- Module: MOD-MODEL
- Transitions: TR-SITE-004
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Toudocu team
- Last updated: 2026-08-10

## Result

The model and portal use an ordered registry of built-in sections, localized
project names, additive JSON `sectionType`, and a single `FLOW-*` catalog at
`processes/index.html`.

## Scope

- `internal/app/sections.go`, model, config parser and portal;
- canonical FLOW catalog route without a legacy source-directory index;
- `$toudocu` init/refresh workflow;
- configuration, model, portal and CLI documentation.

## Out of scope

- building one portal for multiple locales;
- migration fallback from H1 for built-in sections.

## Behavior change

### Before

Navigation and classification of built-in sections depended on directory
strings, and the section title could be derived implicitly from H1.

### After

Stable `SectionType` values and project configuration determine each built-in
section's route, order, label, and JSON representation. `flows/` remains the
source directory and individual-document route, while its catalog is available
only at `processes/index.html`.

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

- `AC-06` → `TR-SITE-004` → `TestScreenPortalAndReportV1`
- `AC-01` → `go test ./... -run TestBuiltinSectionsStableOrderAndLookups`
- `AC-02` → `go test ./... -run TestProjectLocaleConfiguration`
- `AC-03` → `go test ./... -run TestProjectLocaleConfiguration`
- `AC-04` → `go test ./... -run TestMissingProjectConfigurationUsesEnglishAndWarning`
- `AC-05` → `go vet ./... && go test ./... && go test -race ./...`
- `AC-06` → `go test ./... -run TestScreenPortalAndReportV1`
- `AC-07` → `go run ./cmd/toudocu check ./example/docs --repository-root ./example --strict --stale-days 0`
- `ALL` → `go vet ./... && go test ./... && go test -race ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0 && go run ./cmd/toudocu check ./example/docs --repository-root ./example --strict --stale-days 0`
- `QUALITY` → `go test ./...`

## Plan

- [x] Add SectionType, registry and locale/config contracts.
- [x] Translate model, JSON and navigation to registry.
- [x] Record behavior with tests and update documentation.
- [x] Delete the legacy directory `flows/index.html` and rebuild the portals.
- [x] Add full project configuration of the demo portal.

## Documentation impact

Updated configuration reference, module contracts, CLI contract, README, and
skill instructions for init and refresh. The generated portal was rebuilt only
after the strict structural check passed.

## Use-case omission reason

The change stabilizes the internal model and configuration contract; it does
not add a standalone Toudocu user scenario.
