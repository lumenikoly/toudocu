<!-- toudocu
version: 1
id: TASK-API-001
status: done
taskType: feature
priority: high
module: MOD-SITE
useCase: UC-DOCS-03
screens: SC-SITE-HOME, SC-SITE-API-DOCS
transitions: TR-SITE-006
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-10
-->

# TASK-API-001: OpenAPI Contracts and Offline Swagger UI


<!-- toudocu:section result -->
## Result

Two OpenAPI 3.1.0 files define the exact HTTP contracts of the Editor and
Changes APIs. Canonical `serve` displays both contracts in an embedded Swagger
UI that does not need a CDN. The public schema v1 of the reports did not change.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

Wire contracts are duplicated in Markdown, OpenAPI files are not validated as a
distinct source type, and the local portal provides no interactive API catalog.

<!-- toudocu:section after -->
### After

`check` and the editor validate OpenAPI files. The Go route registry and the
OpenAPI operations must match in both directions. Changes API errors use one
JSON format, and `HEAD` is allowed only on the summary route. Canonical `serve`
displays both contracts in the embedded Swagger UI; static and translated
portals do not include it.

<!-- toudocu:section scope -->
## Scope

- OpenAPI validation, Editor/Changes route registries, and HTTP handlers in `internal/app/`;
- vendored Swagger UI assets and dev-only asset-build metadata;
- canonical contracts and the related documentation;
- wire-parity, validation, portal-isolation, and vendored-checksum tests.

<!-- toudocu:section out-of-scope -->
## Out of scope

- new CLI flags, Go exports, or schemaVersion changes in public JSON reports;
- TLS, authentication, CORS, or external `$ref` loading;
- Swagger UI in a static build, locale mounts, or a translation root served directly;
- changes to successful Editor payloads or raw/rendered Changes content media types;
- changes to translation roots and generated example portals.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` Two OpenAPI 3.1.0 files fully describe the active Editor and Changes operations, parameters, statuses, media types, examples, and schema v1 components.
- [x] `AC-02` `check` and editor diagnostics recognize `contracts/**/*.openapi.{yaml,yml,json}` and produce stable positional diagnostics for syntax/root/operation/operationId/path-parameter/internal-ref errors without network resolution.
- [x] `AC-03` The route registries and OpenAPI contracts contain the same paths and methods.
- [x] `AC-04` Changes permits HEAD only for summary and returns a schema-v1 diagnostic envelope for every API error; successful content/render media types are preserved.
- [x] `AC-05` Canonical `serve` provides `GET|HEAD /_toudocu/api-docs/`, a two-spec selector, same-origin assets, CSP/no-store/nosniff, and Try it out only for GET/HEAD.
- [x] `AC-06` Swagger UI 5.32.12, its license, and checksums are vendored; runtime/CI and external-network dependencies are absent.
- [x] `AC-07` A static build copies OpenAPI specs but not Swagger UI assets/navigation; translation portals and direct translation serve contain no UI.
- [x] `AC-08` The Markdown explanations and related architecture documents agree with the contracts without duplicating the HTTP schema or changing translation roots.
- [x] `AC-09` The task includes unit, contract, regression, portal, race, documentation, repository, and browser checks.

<!-- toudocu:section plan -->
## Plan

- [x] Add and validate OpenAPI sources.
- [x] Introduce route registries and normalize Changes errors/methods.
- [x] Embed the offline Swagger UI and isolate static/translation portals.
- [x] Update the source documentation.

<!-- toudocu:section verification -->
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

<!-- toudocu:section documentation-impact -->
## Documentation impact

The work added two OpenAPI contracts, an ADR, a screen, and this task record.
It also updated the related HTTP explanations, standard, modules, use case,
flow, architecture, references, README, and changelog. The historical task did
not modify translation roots or generated portals.
