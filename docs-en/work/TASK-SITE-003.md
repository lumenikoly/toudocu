# TASK-SITE-003: Separate the Go Core from the Portal Frontend Layer

- Status: Completed
- Type: Feature
- Priority: High
- Module: MOD-SITE
- Use case: UC-DOCS-01
- Flow: FLOW-DOCS-BUILD
- Screens: SC-SITE-HOME, SC-SITE-DOCUMENT, SC-SITE-USE-CASE, SC-SITE-SCREEN-MAP, SC-SITE-EDITOR, SC-CHANGES-WORKSPACE
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Docu-docu Team
- Last updated: 2026-08-06

## Result

The user receives one self-contained Docu-docu Go binary: `build` creates a
read-only multi-page portal for ordinary HTTP(S) static hosting without a
running backend, while the existing `serve` adds a local
editor/changes/rebuild runtime. Go remains the sole source of the project model
and the trusted boundary for the filesystem, Git, and task verification;
TypeScript/CSS form a separately built presentation layer embedded into the
binary as ready-made assets.

## Behavior change

### Before

The HTML shell and large fragments of individual workspace pages are assembled
as strings alongside application logic in `internal/app`; CSS and browser
JavaScript are located in `internal/app/assets`, have several disconnected
entrypoints, and partly rely on global variables and DOM markers. The static
portal promises full operation through `file://`, so search data is served as
executable JavaScript and the frontend is constrained by that contract. The
existing Node build handles separate vendored bundles but does not form an
independent frontend workspace.

### After

Go builds the Project Model, page view models, a safe HTML shell, bootstrap
JSON, static data, and serve-only API DTOs, while an independent `web/`
workspace using TypeScript strict and plain CSS implements presentation and
browser behavior. Built deterministic assets are committed to the repository
and embedded through `go:embed`; Node.js is needed only by frontend developers.
`build` contains no editor/API/rebuild code and works without a backend at a
root or nested HTTP(S) path. `serve` uses the same renderer and base frontend,
explicitly adding capability-gated server bundles and same-origin endpoints.
`file://` is removed from the supported and tested product contract, while
local use is documented through `docu-docu serve`.

The current internal arrangement of packages, Go functions, HTML fragments,
DOM hooks, global browser APIs, and legacy asset names does not need to be
preserved. Explicit product boundaries remain stable: the `build` and `serve`
commands, their user-facing flags and exit codes, stable ID-based routes, and
existing JSON schemas. No new `preview` command is introduced.

## Scope

- A new frontend workspace `web/` with TypeScript/CSS source, lockfile,
  esbuild, typecheck, unit tests, and browser tests.
- A new isolated site layer in `internal/site/` and the necessary changes in
  `internal/app/` to move the renderer, view models, static data, routes,
  bootstrap, and serve runtime and remove legacy UI generation.
- `api.go`, `cmd/docu-docu/`, and other existing Go integration points only as
  needed to connect the new site layer, without moving project logic into the
  browser.
- `internal/site/assets/generated/`, its manifest, and `go:embed`; legacy
  frontend assets, root package files, `editor-bundle.mjs`, and
  `swagger-ui-vendor.mjs` are migrated or removed after the complete cutover.
- `Makefile`, `.github/workflows/`, and release scripts if needed for canonical
  frontend build/check, the committed-assets gate, and ordinary Go builds
  without Node.js.
- Go, frontend contract, unit, security, and browser smoke tests.
- `README.md`, `CHANGELOG.md`, and `THIRD_PARTY_NOTICES.md`.
- `docs/architecture/overview.md` and the new
  `docs/architecture/frontend-runtime-boundary.md`.
- `docs/modules/site.md`, `docs/use-cases/build-portal.md`,
  `docs/use-cases/serve-portal.md`, `docs/flows/FLOW-DOCS-BUILD.md`, and
  `docs/flows/FLOW-DOCS-SERVE.md`.
- `docs/contracts/cli.md`; `docs/contracts/editor-http.md`,
  `docs/contracts/changes-http.md`, and their OpenAPI sources only if their wire
  contract or runtime availability changes.
- `docs/reference/features.md`, `docs/reference/api.md`, and
  `docs/reference/configuration.md` only if configuration is introduced.
- `docs/guides/testing.md`, the new `docs/guides/deployment.md`, the new
  `docs/guides/local-workflow.md`, and the new
  `docs/guides/frontend-development.md`.
- Tracked generated portals only through rebuilding after semantic and
  structural gates.

## Out of scope

- Moving Markdown parsing, document classification, validation, relationship
  resolution, readiness, semantic diff, path normalization, permission checks,
  Git comparison, or verification mapping into TypeScript.
- A second TypeScript documentation model, an SPA, a client-side router, or
  mandatory client-side routing.
- React, Vue, Svelte, or another application framework without a separate ADR.
- Node.js, npm, a frontend dev server, CDN, database, or external backend as a
  user runtime dependency or part of the release archive.
- A new `preview` command, separate static-server command, or mandatory
  `baseURL` parameter.
- Editor API, rebuild API client, server URL, write action, or task execution in
  static output.
- Changing editor workspace rules, path/symlink/CAS/size guards, Git read-only
  semantics, or the separation between `task verify --run` and non-executing
  commands.
- Custom CSS, web fonts, theme plugins, a user JavaScript plugin API, cloud
  backend, authentication, or remote collaboration.
- A complete visual redesign of pages: the task introduces an architectural
  boundary, tokens, and basic reusable components, not a new visual concept.
- Supporting and testing direct opening of generated `index.html` through
  `file://` in CI; incidental rendering of basic HTML is not intentionally
  blocked.
- Preserving the current internal package/DOM/asset implementation after the
  migration is complete.

## Acceptance criteria

- [x] `AC-01` Go remains the sole source of the Project Model, diagnostics,
  document relationships, task readiness, and semantic diff; the frontend
  receives only prepared view values, static data, bootstrap, and API DTOs and
  contains none of the prohibited project/security rules.
- [x] `AC-02` The centralized Go renderer uses `html/template`, typed page view
  models, and partials instead of large HTML concatenations in HTTP handlers;
  the main Markdown content is present in source HTML and remains readable if
  JavaScript fails.
- [x] `AC-03` Every interactive page receives a safely serialized bootstrap
  contract with `schemaVersion`, `runtime`, relative asset/data bases,
  locale/appearance, and explicit capabilities; absolute filesystem paths are
  not serialized, unknown fields are ignored, and optional fields are not
  required.
- [x] `AC-04` `web/` uses TypeScript strict, standard DOM APIs, plain CSS, CSS
  custom properties, esbuild, and `tsc --noEmit`; `npm run typecheck`,
  `npm run test`, `npm run build`, `npm run watch`, `make web`, and
  `make web-check` are canonical and reproducible commands.
- [x] `AC-05` The frontend build deterministically creates a manifest,
  `portal.css`, `portal.js`, `serve.js`, `editor.js`, `changes.js`, and required
  content-based chunks in `internal/site/assets/generated/`; assets are
  committed, contain no timestamps/random values, and are available to the Go
  renderer only through the manifest.
- [x] `AC-06` `go build ./...` after clone requires no Node.js and includes only
  ready-made browser assets through `go:embed`; TypeScript source and
  `node_modules` are not included in the binary, and CI fails when generated
  assets diverge from frontend source.
- [x] `AC-07` `docu-docu build` creates a backend-independent read-only MPA with
  all HTML, CSS, JavaScript, JSON, and local assets; output contains no
  editor/rebuild clients, server-only markup, API URLs, localhost, external
  runtime requests, write actions, or task-command execution.
- [x] `AC-08` Static output works over ordinary HTTP(S) both at the root and at
  nested paths; document links, manifest assets, dynamic chunks, and static JSON
  resolve relative to Go-provided base paths without hard-coded `/assets/` or
  `/data/` and without a mandatory `baseURL`.
- [x] `AC-09` The search index and additional
  navigation/relations/screens/use-case JSON are produced from the same Go
  Project Model as derived data, loaded with relative `fetch`, and contain no
  secrets, environment data, absolute paths, editor digests, or repository
  context outside the allowed documentation model.
- [x] `AC-10` `docu-docu serve` uses the same renderer and `portal.js`, while Go
  explicitly enables the `serve`, `editor`, `changes`, `rebuild`, and
  `taskWorkspace` capabilities and only the required bundles; endpoints come
  from Go bootstrap, remain same-origin, and are not derived by the frontend
  from URLs or filesystem paths.
- [x] `AC-11` Portal, serve, editor, and changes bundles are technically
  isolated: the static runtime cannot access server APIs, heavy features load
  lazily only when the capability/page is present, and a Mermaid, editor
  preview, or specialized diff failure does not hide Markdown content or an
  available source diff.
- [x] `AC-12` Shared tokens and the Button, IconButton, Badge, Tabs, Disclosure,
  Dialog, Tooltip, CommandMenu, Tree, DataTable, EmptyState, Diagnostic, and
  DiffBlock components know nothing about the canonical Project Model; theme,
  colorScheme, accent, density, and contentWidth preserve their semantics, and
  keyboard, focus, Escape, arrow keys, reduced motion, and non-color states are
  covered by tests.
- [x] `AC-13` The frontend identifies document/page kinds only by the stable
  identifiers `document`, `architecture`, `module`, `use-case`, `flow`,
  `screen`, `standard`, `runbook`, and `task`, does not classify a page by H1,
  and receives user-facing labels from a centralized locale catalog without
  branching component business logic by language.
- [x] `AC-14` Bootstrap, static data, and serve features have isolated states
  for bootstrap unavailable, unsupported schema, static JSON unavailable,
  diagram render failed, API unavailable, rebuild failed, save conflict, file
  unavailable, diff payload unavailable, empty collection, and capability
  unavailable; failure of one component does not hide the main Markdown
  content.
- [x] `AC-15` Security regression covers Markdown/script injection, dangerous
  URLs, HTML termination in bootstrap JSON, absence of server APIs and absolute
  paths from static output, oversized/stale editor writes, and inability to run
  a work item command through the UI; existing Go path, symlink, CAS, size, and
  command guards are not weakened.
- [x] `AC-16` Public `build` and `serve` commands, existing flags/exit codes,
  stable ID-based routes, and the `ProjectReport`, `ChangeSetReport`, and
  `TaskVerifyReport` schemas remain stable; `preview` is absent. Compatibility
  of internal Go/UI implementation details is not tested.
- [x] `AC-17` Browser smoke serves static output through an ordinary HTTP server
  and checks home, a nested document, CSS/JS, search, appearance, use-case tabs,
  Mermaid success/fallback, and the same scenario under a nested URL path;
  `file://` is absent from tests.
- [x] `AC-18` Browser smoke for `serve` checks rebuild, editor open/save/CAS
  conflict, degradation of changes source/semantic/rendered diffs, and
  unavailability of server-only functions without a capability.
- [x] `AC-19` README, build/local-workflow/deployment/frontend guides, module,
  use cases, flows, architecture question map, release/migration notes, and
  applicable contracts/references describe `serve` for local work and
  `build + static HTTP hosting` for publication and no longer promise
  `file://`; a regression test checks canonical public sources while excluding
  historical work items and release records from the prohibition.
- [x] `AC-20` After cutover, the repository contains no legacy inline scripts,
  dead CSS selectors, duplicated browser logic, or parallel old and new UIs;
  licenses/notices for new frontend dependencies are current, and the complete
  Go, frontend, browser, security, and documentation regression passes.

## Plan

- [x] Record an inventory of current assets, HTML string generation, DOM/URL
  hooks, and static/serve-only behavior; add a browser smoke baseline before
  changing the contract.
- [x] Extract the Go application/site boundary, page view models,
  `html/template` renderer, partials, and versioned bootstrap contract; keep the
  Project Model as the source of all representations.
- [x] Create `web/`, a strict TypeScript/CSS structure, component primitives,
  an esbuild manifest, and deterministic generation into embedded assets; move
  base portal behavior without a visual redesign.
- [x] Add static JSON resources and unified relative asset/data resolution,
  move browser tests to HTTP and nested paths, and remove `file://` from the
  product contract without adding a new CLI command.
- [x] Split entries and capabilities into `portal`, `serve`, `editor`,
  `changes`, and lazy feature chunks; prove through negative tests that static
  output contains no server-only code or URL.
- [x] Move editor, changes, task workspace, diagrams, and screen/use-case
  interaction to the new frontend contract without changing Go security and
  model responsibilities.
- [x] Introduce design tokens, shared accessible components, and unified
  loading/empty/error states while preserving existing appearance settings;
  move labels into a locale catalog and use stable page-kind IDs instead of
  analyzing H1 or localized DOM.
- [x] Configure the `make`/CI regeneration gate, Go-only clone build, frontend
  unit and browser suites, static/serve/security regression, and
  reproducibility check.
- [x] Perform one cutover: remove legacy UI generation/assets and exclude the
  temporary duplicate implementation from the final branch.
- [x] Update every listed source of truth, add a separate architecture-question
  document and a direct overview link, update release and migration notes, and
  then pass the semantic and structural gates.

## Verification

- `AC-01` → `go test ./...`
- `AC-02` → `go test ./...`
- `AC-03` → `go test ./... && make web-check`
- `AC-04` → `make web-check`
- `AC-05` → `make web && git diff --exit-code -- internal/site/assets/generated`
- `AC-06` → `go build ./... && make web-check`
- `AC-07` → `go test ./...`
- `AC-08` → `make browser-test`
- `AC-09` → `go test ./... && make browser-test`
- `AC-10` → `go test ./... && make browser-test`
- `AC-11` → `make test && make browser-test`
- `AC-12` → `make web-check && make browser-test`
- `AC-13` → `make web-check && make browser-test`
- `AC-14` → `make web-check && make browser-test`
- `AC-15` → `go test ./... && make browser-test`
- `AC-16` → `go test ./...`
- `AC-17` → `make browser-test`
- `AC-18` → `make browser-test`
- `AC-19` → `go test ./... -run 'TestFileProtocolPublicContract|TestStaticHTTPDocumentationContract' && go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `AC-20` → `make check && make web-check && make browser-test && go run ./cmd/docu-docu build ./docs --repository-root . --clean`
- `ALL` → `make check && make web-check && make browser-test && make build`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `go vet ./... && go test ./... && go test -race ./... && go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`

## Documentation impact

The portal product contract changes: self-contained means no backend after
`build`, while publication and interactive static data require ordinary
HTTP(S). The architecture map and separate answer about the Go/frontend
boundary, `MOD-SITE`, build/serve use cases and flows, README,
CLI/features/API references, testing/deployment/frontend-development guides,
root `CHANGELOG.md`, and notices are updated. Editor/Changes Markdown/OpenAPI
contracts and the configuration reference change only when their wire contract,
runtime availability, or parameters actually change. Translation roots are not
part of this task's implementation or documentation context and are updated
only through a separate, explicit locale workflow.
