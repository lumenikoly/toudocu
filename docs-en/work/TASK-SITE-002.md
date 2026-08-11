# TASK-SITE-002: Edit source documentation in serve

- Status: Completed
- Type: Feature
- Priority: High
- Module: MOD-SITE
- Use case: UC-DOCS-03
- Flow: FLOW-DOCS-SERVE
- Transitions: TR-SITE-001, TR-SITE-002, TR-SITE-003
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Toudocu team
- Last updated: 2026-08-10

## Result

The task added a local workspace to `toudocu serve`. A user can open and create
source documents, see previews and diagnostics, and get updated pages and
search results after saving.

## Behavior change

### Before

`serve` rebuilds the static portal when HTML is opened and on a manual button,
but does not provide access to source files or notice an external change before
the next view or manual rebuild.

### After

`serve` includes a guarded same-origin editor API, a dedicated editor
interface, a rebuild after each write, and a watcher for external changes.
Static output contains no editor markup, server-only scripts, or API links.

## Scope

- `internal/app/server.go`, `internal/app/docs_core.go`, `internal/app/screens.go`, and new Go files for the server/editor workspace;
- `internal/app/site.go`, `internal/app/process_site.go`, `internal/app/screen_site.go`, and generation of the serve variant;
- `internal/app/scaffold.go` and the shared template registry;
- `internal/app/assets/` and `internal/app/embed.go`;
- `package.json`, `package-lock.json`, and `editor-bundle.mjs` for the build-only
  CodeMirror bundle;
- tests in `internal/app/`;
- `README.md`, `THIRD_PARTY_NOTICES.md`, and `CHANGELOG.md`;
- `docs/use-cases/serve-portal.md`;
- `docs/flows/FLOW-DOCS-SERVE.md`;
- `docs/modules/site.md`, `docs/modules/cli.md`, `docs/modules/model.md`;
- `docs/contracts/cli.md` and a new editor HTTP contract under `docs/contracts/`;
- `docs/architecture/overview.md`, `docs/architecture/runtime-components.md`,
  `docs/architecture/trust-boundaries.md`, `docs/architecture/system-boundary.md`,
  and `docs/architecture/failure-isolation.md`;
- `docs/reference/features.md`, `docs/reference/configuration.md`;
- `project-docs/` and `example/project-docs/` only through rebuilding.

## Out of scope

- changing the semantics of `--host`, `--port`, `--open`, or auto-open;
- the `--no-open` and `--edit` parameters;
- an editor or editor API in `build` output;
- TLS, separate authentication, CORS, or remote collaborative editing;
- invoking Git, a shell, task verification, or any commands through the editor
  API;
- general schema validation for arbitrary YAML.

## Acceptance criteria

- [x] `AC-01` `GenerateSite` always creates a self-contained static portal,
  while the serve variant separately adds edit/source actions and server-only
  assets.
- [x] `AC-02` The workspace lists only regular `.md`, `.yaml`, `.yml`, and
  `.json` files inside the docs root, including `screens/hotspots.json`, while
  excluding hidden and excluded files, the output subtree, and all symlink
  paths; other extensions and irregular files are not workspace entries.
- [x] `AC-03` The API accepts only canonical relative POSIX paths and rejects
  absolute paths, `..`, backslashes, NUL, and encoded or repeatedly encoded
  traversal.
- [x] `AC-04` Reads and writes use a SHA-256 digest; save preserves the mode,
  synchronizes the temporary file, checks CAS again, and atomically replaces the
  source: Unix uses a same-directory rename and directory `Sync`, while Windows
  uses write-through replace. Every path component is checked again for a
  symlink/reparse point before writing and replacement.
- [x] `AC-05` A stale digest returns `409 stale_digest`, while a confirmed
  overwrite is performed only by a second request with the digest from the
  conflict response and `confirmOverwrite: true`; a new external conflict
  returns `409` again.
- [x] `AC-06` Markdown diagnostics are built from the complete model with an
  in-memory overlay; JSON receives syntax and hotspot diagnostics, while YAML
  receives only available Toudocu diagnostics; diagnostics do not block save.
- [x] `AC-07` Save/create synchronously update the model, HTML, search, and
  revision; a watcher with a 750 ms interval and 200 ms stabilization notices
  external changes.
- [x] `AC-08` The serve frontend polls file revision through ETag every two
  seconds and distinguishes reload, clean update, and dirty conflict without
  losing text.
- [x] `AC-09` The editor provides a tree, path/dirty/save toolbar, Editor,
  Preview and Split modes, diagnostics navigation, `Ctrl/Cmd+S`, and an
  unsaved-leave guard.
- [x] `AC-10` On mobile, the sidebar works as a drawer and split becomes a
  single view; all main actions are accessible from the keyboard.
- [x] `AC-11` Markdown preview uses the existing safe renderer; other formats
  return `preview_not_supported`, and raw source opens read-only as
  `text/plain`.
- [x] `AC-12` `task init` and the seven scaffold types use one ordered registry
  available to the CLI and browser create operation with shared validation,
  path, and renderer; creation remains atomic through `O_EXCL`.
- [x] `AC-13` All editor JSON responses have `schemaVersion: 1`, `no-store`, and
  one error envelope; malformed input, unknown fields, trailing JSON, a body
  larger than 3 MiB, and content larger than 2 MiB are rejected.
- [x] `AC-14` A write requires JSON content type, `X-Toudocu-Action`, and
  same-origin/`Sec-Fetch-Site`; the API returns no CORS headers and cannot invoke
  commands. With an explicit non-loopback listener, the operator includes local
  network clients in the trust boundary: browser guards protect against
  cross-origin pages but do not authenticate a direct HTTP client; the CLI
  warning remains mandatory.
- [x] `AC-15` The `/files`, `/file`, `/preview`, `/validate`, and `/create`
  methods, ETag/`304`, payloads, statuses, revision, and error envelope conform
  to [`CONTRACT-EDITOR-HTTP`](../contracts/editor-http.md).
- [x] `AC-16` The vendored CodeMirror IIFE bundle and licenses/checksums are
  embedded into Go; the build-only lock pins matching versions, while runtime
  does not require Node.js.
- [x] `AC-17` The documentation records the
  `build = static read-only`, `serve = view/edit/live rebuild` boundary;
  backend, race, static-negative, cross-build, browser desktop/mobile QA,
  semantic review, and strict Toudocu checks pass.

## Plan

- [x] Separate static and serve portal generation.
- [x] Implement a safe workspace, diagnostics overlay, and atomic CAS save.
- [x] Implement the editor HTTP API, live rebuild, and watcher.
- [x] Extract the shared registry of scaffold/task templates.
- [x] Build and embed CodeMirror and implement a responsive editor UI.
- [x] Add negative, concurrency, and end-to-end tests.
- [x] Update the related source documents and rebuild the portals.
- [x] Perform semantic, automated, and browser verification.

## Verification

- `AC-01` → `TR-SITE-001` → `TestDashboardFocusFallbacksAndAlwaysVisibleOverview`
- `AC-09` → `TR-SITE-002` → `TestServeSiteIncludesEditor`
- `AC-17` → `TR-SITE-003` → `TestServeSiteIncludesEditor`
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
- `AC-17` → `go test ./... && go test -race ./... && go run ./cmd/toudocu check ./docs --strict --stale-days 0 && GOOS=windows GOARCH=amd64 go test -c -o /tmp/toudocu-editor-windows.test . && GOOS=darwin GOARCH=amd64 go build -o /tmp/toudocu-editor-darwin ./cmd/toudocu && GOOS=linux GOARCH=amd64 go build -o /tmp/toudocu-editor-linux ./cmd/toudocu && test -s build/editor-qa/report.md && test -s build/editor-qa/semantic-review.txt`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root .`
- `QUALITY` → `go vet ./... && go test ./... && go test -race ./... && go run ./cmd/toudocu check ./docs --strict --stale-days 0`

## Documentation impact

The serve-mode use case and flow, Site/CLI/Model contracts, runtime and trust
boundaries, README, feature/configuration references, and changelog are updated.
A separate editor HTTP contract is added; no new architecture page is needed
because the existing architecture documents already answer the new questions.

## Later change

[TASK-SITE-003](TASK-SITE-003.md) replaced the earlier promise that a static
portal would work through `file://`. The current rule is: `build` produces a
portal for ordinary HTTP(S) hosting, while `serve` is the supported path for
local viewing and editing. See [UC-DOCS-03](../use-cases/serve-portal.md) for
the current end-to-end workflow.
