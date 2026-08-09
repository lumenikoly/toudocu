# TASK-API-001: OpenAPI Contracts and Offline Swagger UI

- Status: Done
- Type: Feature
- Priority: High
- Module: MOD-SITE
- Use case: UC-DOCS-03
- Screens: SC-SITE-HOME, SC-SITE-API-DOCS
- Transitions: TR-SITE-006
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Toudocu Team
- Last updated: 2026-08-05

## Result

Two OpenAPI 3.1.0 contracts are the sources of truth for the wire-level Editor
and Changes APIs, while canonical `serve` exposes them through a fully offline
Swagger UI without changing the reports' public schema v1.

## Behavior change

### Before

Wire contracts are duplicated in Markdown, OpenAPI files are not validated as a
distinct source type, and the local portal provides no interactive API catalog.

### After

`check` and editor diagnostics validate OpenAPI, route registries correspond
bidirectionally to operations, the Changes API uses one JSON error envelope and
limits HEAD to the summary route, and canonical `serve` displays both contracts
in the vendored Swagger UI. Static and translation portals do not receive the UI.

## Scope

- OpenAPI validation, Editor/Changes route registries, and HTTP handlers in `internal/app/`;
- vendored Swagger UI assets and dev-only asset-build metadata;
- canonical contracts, ADR, standard, modules, use case, flow, screens, and
  architecture/reference/README/changelog documentation;
- wire-parity, validation, portal-isolation, and vendored-checksum tests.

## Out of scope

- new CLI flags, Go exports, or schemaVersion changes in public JSON reports;
- TLS, authentication, CORS, or external `$ref` loading;
- Swagger UI in a static build, locale mounts, or direct serving of a translation root;
- changes to successful Editor payloads or raw/rendered Changes content media types;
- changes to translation roots and generated example portals.

## Acceptance criteria

- [x] `AC-01` Two OpenAPI 3.1.0 files fully describe the active Editor and Changes operations, parameters, statuses, media types, examples, and schema v1 components.
- [x] `AC-02` `check` and editor diagnostics recognize `contracts/**/*.openapi.{yaml,yml,json}` and produce stable positional diagnostics for syntax/root/operation/operationId/path-parameter/internal-ref errors without network resolution.
- [x] `AC-03` Declarative route registries correspond bidirectionally to OpenAPI paths and methods.
- [x] `AC-04` Changes permits HEAD only for summary and returns a schema-v1 diagnostic envelope for every API error; successful content/render media types are preserved.
- [x] `AC-05` Canonical `serve` provides `GET|HEAD /_toudocu/api-docs/`, a two-spec selector, same-origin assets, CSP/no-store/nosniff, and Try it out only for GET/HEAD.
- [x] `AC-06` Swagger UI 5.32.12, its license, and checksums are vendored; runtime/CI and external-network dependencies are absent.
- [x] `AC-07` A static build copies OpenAPI specs but not Swagger UI assets/navigation; translation portals and direct translation serve contain no UI.
- [x] `AC-08` Markdown companions and related ADR/standard/module/use-case/flow/screen/architecture/reference/README/changelog sources are consistent without changing translation roots.
- [x] `AC-09` Unit, contract, regression, portal, race, strict-documentation, and repository checks pass; browser QA confirms the selector and safe GET.

## Plan

- [x] Add and validate OpenAPI sources.
- [x] Introduce route registries and normalize Changes errors/methods.
- [x] Embed the offline Swagger UI and isolate static/translation portals.
- [x] Update source documentation and pass semantic gates.
- [x] Run automated and browser verification.

## Verification

- `AC-05` → `TR-SITE-006` → `TestAPIDocsUI`
- `AC-01` → `go test ./... -run 'TestOpenAPIContracts'`
- `AC-02` → `go test ./... -run 'TestOpenAPIValidation|TestEditorOpenAPIDiagnostics'`
- `AC-03` → `go test ./... -run 'TestOpenAPIContractParity'`
- `AC-04` → `go test ./... -run 'TestChangesHTTPContract'`
- `AC-05` → `go test ./... -run 'TestAPIDocsUI'`
- `AC-06` → `go test ./... -run 'TestSwaggerUIVendoredAssets'`
- `AC-07` → `go test ./... -run 'TestStaticSiteExcludesAPIDocs|TestTranslationServeExcludesAPIDocs'`
- `AC-08` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `AC-09` → `go vet ./... && go test ./... && go test -race ./... && make check`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root .`
- `QUALITY` → `go vet ./... && go test ./... && go test -race ./... && go run ./cmd/toudocu check ./docs --strict --stale-days 0 && make check`

## Documentation impact

Two OpenAPI contracts, an ADR, a screen, and this work item are added. The
Markdown HTTP companions, `STD-DOCS-001`, API/CLI references, Site/Changes
modules, architecture answers, `UC-DOCS-03`, `FLOW-DOCS-SERVE`, README, and
CHANGELOG are updated. Translation roots and generated portals are unchanged.
