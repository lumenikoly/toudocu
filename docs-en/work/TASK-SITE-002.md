# TASK-SITE-002: Editing source documentation in serve

- Status: Completed
- Type: Feature
- Priority: High
- Module: MOD-SITE
- Use case: UC-DOCS-03
- Flow: FLOW-DOCS-SERVE
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Docu-docu Team
- Last updated: 2026-07-31

## Result

`docu-docu serve` provides a local live workspace in which the user
securely edits and creates source documents, sees previews and diagnostics,
and the portal synchronously updates the model, HTML and search. `docu-docu build` remains
stand-alone read-only portal for `file://`.

## Behavior change

### Before

`serve` rebuilds the static portal when opening HTML and on a manual button,
but does not provide access to the source files and does not notice the external change until
next viewing or manual reassembly.

### After

`serve` always includes a protected same-origin editor API, separate Operate UI,
live rebuild after recording and watcher of external changes. Static generation is not
receives editor markup, server-only scripts or API links.

## Scope

- `internal/app/server.go`, `internal/app/docs_core.go`, `internal/app/screens.go` and new Go files server/editor workspace;
- `internal/app/site.go`, `internal/app/process_site.go`, `internal/app/screen_site.go` and generation of the serve option;
- `internal/app/scaffold.go` and general template registry;
- `internal/app/assets/` and `internal/app/embed.go`;
- `package.json`, `package-lock.json` and `editor-bundle.mjs` for build-only
  CodeMirror bundle;
- tests in `internal/app/`;
- `README.md`, `THIRD_PARTY_NOTICES.md` and `CHANGELOG.md`;
- `docs/use-cases/serve-portal.md`;
- `docs/flows/FLOW-DOCS-SERVE.md`;
- `docs/modules/site.md`, `docs/modules/cli.md`, `docs/modules/model.md`;
- `docs/contracts/cli.md` and new editor HTTP contract in `docs/contracts/`;
- `docs/architecture/overview.md`, `docs/architecture/runtime-components.md`,
  `docs/architecture/trust-boundaries.md`, `docs/architecture/system-boundary.md`
  and `docs/architecture/failure-isolation.md`;
- `docs/reference/features.md`, `docs/reference/configuration.md`;
- `project-docs/` and `example/project-docs/` only through rebuilding.

## Out of scope

- changing the semantics of `--host`, `--port`, `--open` or auto-open;
- parameters `--no-open` and `--edit`;
- editor or editor API as a result of `build`;
- TLS, separate authentication, CORS or remote co-editing;
- launching Git, shell, task verification or any commands via editor API;
- general schema validation of arbitrary YAML.

## Acceptance criteria

- [x] `AC-01` `GenerateSite` always creates a standalone static portal, and
  The serve option separately adds edit/source actions and server-only assets.
- [x] `AC-02` Workspace only lists the regular `.md`, `.yaml`, `.yml` and
  `.json` inside docs root, including `screens/hotspots.json` but excluding hidden,
  excluded, output subtree and any symlink paths; other extensions and
  irregular files are not workspace entries.
- [x] `AC-03` API only accepts canonical relative POSIX paths and
  rejects absolute, `..`, backslash, NUL, encoded and re-encoded traversal.
- [x] `AC-04` Read and write use SHA-256 digest; save saves mode,
  synchronizes the temp file, re-checks the CAS and atomically replaces the source:
  Unix uses same-directory rename and directory `Sync`, Windows -
  write-through replace. Each path component is re-checked against symlink /
  reparse before writing and replacing.
- [x] `AC-05` Stale digest returns `409 stale_digest`, and confirmed
  overwrite is executed only by the second request with digest from the conflict response and
  `confirmOverwrite: true`; the new external conflict returns `409` again.
- [x] `AC-06` Markdown diagnostics are built using the full model with in-memory overlay;
  JSON receives syntax and hotspots diagnostics, YAML - only available Docu-docu
  diagnostics; diagnostics do not block save.
- [x] `AC-07` Save/create synchronously updates the model, HTML, search and revision;
  watcher notices external changes with an interval of 750 ms and stabilization of 200 ms.
- [x] `AC-08` Serve frontend polls file revision via ETag every two times
  seconds and without loss of text distinguishes between reload, clean update and dirty conflict.
- [x] `AC-09` Editor provides tree, path/dirty/save toolbar, Editor,
  Preview and Split, diagnostics navigation, `Ctrl/Cmd+S` and unsaved-leave guard.
- [x] `AC-10` On mobile, the sidebar works as a drawer, and split becomes one
  presentation; all basic actions are accessible from the keyboard.
- [x] `AC-11` Markdown preview uses the existing secure renderer;
  other formats return `preview_not_supported`, raw source opens
  read-only as `text/plain`.
- [x] `AC-12` `task init` and seven scaffold types use one ordered
  registry accessible by CLI and browser create with general validation, path and renderer;
  creation remains atomic `O_EXCL`.
- [x] `AC-13` All editor JSON responses have `schemaVersion: 1`, `no-store` and a single
  error envelope; malformed, unknown fields, trailing JSON, >3 MiB body and >2 MiB
  content are rejected.
- [x] `AC-14` Entry requires JSON content type, `X-Docu-docu-Action` and same-origin /
  `Sec-Fetch-Site`; The API does not issue CORS headers and cannot run commands.
  With an explicit non-loopback listener, the operator includes local network clients in
  trust boundary: browser guards protect against cross-origin pages, but do not serve
  direct HTTP client authentication; warning CLI remains required.
- [x] `AC-15` Methods `/files`, `/file`, `/preview`, `/validate`, `/create`, ETag /
  `304`, payloads, statuses, revision and error envelope correspond
  [`CONTRACT-EDITOR-HTTP`](../contracts/editor-http.md).
- [x] `AC-16` Vendored CodeMirror IIFE bundle and licenses/checksums built into Go;
  build-only lock locks in consistent versions, and runtime doesn't require Node.js.
- [x] `AC-17` The documentation fixes the `build = static read-only` boundary,
  `serve = view/edit/live rebuild`; backend, race, static-negative, cross-build,
  browser desktop/mobile QA, semantic review and strict Docu-docu checks pass.

## Plan

- [x] Separate static and serve generation of the portal.
- [x] Implement secure workspace, diagnostics overlay and atomic CAS save.
- [x] Implement editor HTTP API, live rebuild and watcher.
- [x] Remove the general registry scaffold/task templates.
- [x] Build and embed CodeMirror, implement an adaptive editor UI.
- [x] Add negative, concurrency and end-to-end tests.
- [x] Update related sources of truth and rebuild portals.
- [x] Perform semantic, automated and browser verification.

## Verification

- `AC-01` → `go test ./... -run 'TestStaticSiteExcludesEditor|TestServeSiteIncludesEditor'`
- `AC-02` → `go test ./... -run 'TestEditorWorkspaceFiles|TestEditorWorkspaceExclusions'`
- `AC-03` → `go test ./... -run 'TestEditorPathValidation'`
- `AC-04` → `go test ./... -run 'TestEditorAtomicSave|TestEditorAtomicFailure'`
- `AC-05` → `go test ./... -run 'TestEditorStaleDigest'`
- `AC-06` → `go test ./... -run 'TestEditorDiagnostics'`
- `AC-07` → `go test ./... -run 'TestEditorRebuild|TestEditorWatcher'`
- `AC-08` → `go test ./... -run 'TestEditorPollingStateMachine|TestEditorAssetsContract'`
- `AC-09` → `go test ./... -run 'TestEditorKeyboardAndDirtyGuards|TestEditorAssetsContract'`
- `AC-10` → `go test ./... -run 'TestEditorResponsiveContract|TestEditorAssetsContract'`
- `AC-11` → `go test ./... -run 'TestEditorPreviewAndRaw'`
- `AC-12` → `go test ./... -run 'TestScaffoldRegistryParity|TestEditorCreate'`
- `AC-13` → `go test ./... -run 'TestEditorJSONContract|TestEditorLimits'`
- `AC-14` → `go test ./... -run 'TestEditorWriteGuards|TestEditorCannotExecuteCommands'`
- `AC-15` → `go test ./... -run 'TestEditorAPIContract'`
- `AC-16` → `go test ./... -run 'TestEditorVendoredAssets'`
- `AC-17` → `go test ./... && go test -race ./... && go run ./cmd/docu-docu check ./docs --strict --stale-days 0 && GOOS=windows GOARCH=amd64 go test -c -o /tmp/docu-docu-editor-windows.test . && GOOS=darwin GOARCH=amd64 go build -o /tmp/docu-docu-editor-darwin ./cmd/docu-docu && GOOS=linux GOARCH=amd64 go build -o /tmp/docu-docu-editor-linux ./cmd/docu-docu && test -s build/editor-qa/report.md && test -s build/editor-qa/semantic-review.txt`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root .`
- `QUALITY` → `go vet ./... && go test ./... && go test -race ./... && go run ./cmd/docu-docu check ./docs --strict --stale-days 0`

## Documentation impact

The use case and flow of the serve mode, Site/CLI/Model contracts, runtime and
trust boundaries, README, feature/configuration references and changelog.
A separate editor HTTP contract is added; new architectural page
necessary because new questions belong to existing sources of truth.