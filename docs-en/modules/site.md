# Static portal

- Identifier: MOD-SITE
- Status: Completed
- Owner: Docu-docu Team
- Last updated: 2026-08-05

The module generates standalone HTML pages, navigation, search and typed
`report.json` from the finished design model.

## Purpose

Make project documentation human-friendly through `file://` or
a small dev server and at the same time provide a full model to CI and agents.

## Code location

- HTML shell and report: `internal/app/site.go`, `internal/app/report_types.go`;
- catalogs of processes and use cases: `internal/app/process_site.go`;
- Screen Map, catalog and screen pages: `internal/app/screen_site.go`;
- local HTTP distribution: `internal/app/server.go`;
- editor workspace, API and platform-specific atomic replace: `internal/app/editor_*.go`;
- built-in resources: `internal/app/embed.go`, `internal/app/assets/`;
- configuration of themes and safe branding: `internal/app/site_config.go`.

## Module boundaries

Static generation does not re-validate or edit business entities
Markdown. Only the explicit `serve` mode provides workspace operations, after
which the model is rebuilt using the `MOD-MODEL` module.

## Business rules

### BR-SITE-001: Cleaning output does not affect protected directories

`--clean` prohibits the system root, the original documentation, its parents
directories and direct output symlinks. The decision is made along the revealed paths.

### BR-SITE-002: The portal works via file protocol

All internal URLs, assets, search and directory pages are generated as
relative files and do not require an HTTP server.

### BR-SITE-003: Dev server does not expose source repository

Regular `serve` routes distribute only the output directory. Separate editor API
allows regular `.md`, `.yaml`, `.yml` and `.json` only inside docs root,
excludes hidden/excluded/output and symlink paths and does not open the rest
repository. By default, listener uses loopback; `--host 0.0.0.0`
explicitly includes available LAN clients in the trust boundary.

### BR-SITE-004: Mermaid works autonomously and in strict mode

Pinned classic bundle Mermaid Tiny copied from `go:embed`, loaded
only when the diagram approaches the viewport and is launched with `securityLevel: strict`.
Syntax error doesn't break page: portal shows message and original
chart code.

### BR-SITE-005: Screen map works autonomously

Map, filters, SVG links, zoom, pan, sidebar and step by step
viewer work via `file://` on local JavaScript and CSS without CDN and
additional runtime.

“User Scripts” is an independent top-level section
for `UC-*`, and "Processes" is the only document directory `FLOW-*` at
`processes/index.html`. The canonical use case page combines
description, map, playback and connections. The “Screens” section opens the catalog
`SC-*`; The general map is available as a separate item when its generation is enabled.
Cards show the number of incoming and outgoing transitions. Transition types
differ in line shape; hotspots appear on hover and focus, and
The terminal screen contains links to the map and a description of the use case.

The main navigation follows a stable registry order of built-in sections;
it does not depend on the order of the Go map traversal. The names of built-in sections are taken from
`project.sections`, and `flows` is output by the `processes` route.

### BR-SITE-006: Topics do not extend trusted surface

`classic`, `paper` and `terminal`, their tokens, color scheme switch,
fallback favicon and browser resources are embedded via `go:embed`. Configuration
selects only fixed options; custom CSS, fonts and theme plugins are not
are loading.

Custom logo, favicon and hero are read only as regular files from
`.docu-docu/assets/`, are checked when building the model and copied to
`assets/branding/`. `build`, `check` and `serve` use the same diagnostics and
remain offline-first.

### BR-SITE-007: Build and serve have different capabilities

`GenerateSite` always produces a standalone read-only result for `file://` without
editor markup, API URL, CodeMirror and server-only rebuild code. `serve` separately
adds live workspace, editor/source actions, polling, API and watcher.

### BR-SITE-008: Record protected by optimistic concurrency

Content is identified by SHA-256 digest. Save checks the digest before and after
records same-directory temp, saves mode, synchronizes data and atomically
replaces the source. The conflict does not lose local text and requires a separate overwrite
with actual digest and explicit `confirmOverwrite`; when deleting the source dirty
buffer can be downloaded. Diagnostics do not block saving.

### BR-SITE-009: Locale portals isolated from canonical workspace

When running `serve` from canonical root configured `translations.<locale>`
create independent read-only snapshots using `/_docu-docu/locales/<locale>/`.
The switch only gets the URL from server-computed targets: Markdown
is compared by relative source path, generated page - by existing
output path, otherwise locale homepage is used. Locale mount does not get
editor, changes API, rebuild controls, source paths or canonical workspace.
`build`, `file://`, and direct `serve` on a translation root remain
single-language and read-only: the server adds no editor markup, write API, or
rebuild controls.

### BR-SITE-010: Soft navigation limited to canonical serve portal

Only canonical portal mode `serve` intercepts regular same-origin
transitions between HTML documents. It preloads up to the last eight
pages after pointer hover or keyboard focus, checks workspace revision and
replaces the document shell without rebuild. Back/Forward, anchors, recovery
scroll and main focus preserve browser semantics. Editor, changes, API,
locale, external and special transitions always remain full navigation;
network error, inappropriate HTML or new revision also lead to complete
loading.

The search index is loaded only the first time a search is accessed and is saved
in memory between soft transitions. Mermaid bundle loads when approached
the first diagram and is reused until the page is completely loaded.

## Invariants

- the original `index.md` is displayed by the dashboard, and not by a duplicate page;
- pages of source Markdown documents, including dashboard and canonical
  use case, allow you to copy the name and safe path to the source;
- side navigation colors the type icon according to the recognized document status,
  and for `TASK-*` and `BUG-*` it further distinguishes between outstanding `☐` and
  completed `☑`; the status text signature remains available regardless of
  colors;
- the active navigation group is expanded, the rest of the groups are by default
  collapsed, and the user's explicit selection is saved locally;
- dashboard shows no more than five recommended entry points; the only one
  The filtered catalog remains the full surface;
- catalogs, Screen Map, traceability and health page do not provide synthetic
  document context;
- in `serve` a separate workspace panel allows you to open the editor and manually
  rebuild the model, HTML and search without stopping the listener; she shows
  area, progress, result or error with retry; via `file://` of these
  no actions or assets;
- save/create and stable external change update model, HTML, search,
  diagnostics and workspace revision synchronously;
- a regular HTTP request does not trigger rebuild; watcher publishes snapshot only
  after a successful build, and locale rebuild does not change the canonical editor or changes state;
- soft transition to canonical `serve` does not trigger rebuild and accepts HTML
  only with the current workspace revision; watcher and manual rebuild complete
  full reboot, which synchronizes runtime and snapshot;
- a regular page does not load the search index or Mermaid before accessing
  searching for or bringing the diagram closer to the viewport;
- Screen Map and playable flow are reinitialized for the new layout; at
  replacing DOM previous page lifecycle cancels listeners and observers;
- the service output conflict receives a separate safe path;
- `ProjectReport` and HTML are built from the same model;
- generated files do not become a source of truth.

## Stable interfaces

- `GenerateSite`;
- `BuildReport`;
- CLI command `serve`;
- [Editor HTTP schema v1](../contracts/editor-http.md);
- `ProjectReport` schema v1;
- HTML entrypoint `index.html` and machine `report.json`.

## Related use cases

- [UC-DOCS-01: Portal assembly](../use-cases/build-portal.md)
- [UC-DOCS-03: Local Server](../use-cases/serve-portal.md)
- [UC-DOCS-04: Screen Map](../use-cases/screen-map.md)

## Related processes

- [FLOW-DOCS-BUILD: Building a standalone portal](../flows/FLOW-DOCS-BUILD.md)
- [FLOW-DOCS-SERVE: Local portal browsing](../flows/FLOW-DOCS-SERVE.md)
