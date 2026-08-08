# UC-DOCS-03: View documentation on local server

- Identifier: UC-DOCS-03
- Status: Completed
- Actor: Developer
- Module: MOD-SITE
- Priority: Medium
- Screens: SC-SITE-HOME, SC-SITE-EDITOR, SC-SITE-DOCUMENT, SC-SITE-API-DOCS
- Start screen: SC-SITE-HOME
- Terminal screens: SC-SITE-DOCUMENT, SC-SITE-API-DOCS
- Allow cycle: Yes
- Last updated: 2026-08-08

The developer views and edits documentation via a local HTTP server
and receives an updated model and portal after saving or external changes.

## Inputs

- project-documentation directory;
- output directory;
- server address and port;
- optional `--no-update-check` for a fully self-contained run;
- regular `.md`, `.yaml`, `.yml`, and `.json` files inside the documentation directory.

## Preconditions

- Docu-docu is available for launch;
- the developer has read and write rights to the documentation and the output directory.

## Main scenario

1. The developer runs `docu-docu serve ./docs`.
2. Docu-docu builds the portal in the output directory.
3. Docu-docu starts an HTTP server on `127.0.0.1:8080` and reports the address.
4. The developer opens the portal in a browser.
5. The portal requests same-origin version status. If a stable release is
   newer, a suggestion to open the official release appears below the header;
   the developer may dismiss it for that version.
6. If the developer navigates to `/_docu-docu/api-docs/`, they select the Editor
   or Changes contract, expand an operation, and optionally execute a safe
   `GET`/`HEAD`; the scenario ends at `SC-SITE-API-DOCS`.
7. Otherwise, on the roadmap page the developer may choose an existing stage,
   review the suggested `DLV-ROADMAP-NNN`, change the ID, and add a one-line
   deliverable. Docu-docu performs a CAS insertion and returns the page to the stage.
8. Or the developer opens `/_docu-docu/editor/`; the Editor receives a
   revision, a safe file list, and the shared template registry.
9. The developer opens the source, changes the text, checks the Markdown preview
   and positional diagnostics, and saves it.
10. Docu-docu compares the SHA-256 digest, atomically replaces the file, and synchronously
   rebuilds model, HTML, search and diagnostics.
11. When transitioning between canonical HTML documents, the portal can prefetch the
   target page, check the current revision and replace the document layout without
   rebuild. Back/Forward, anchors, scroll and keyboard focus continue to work.
12. Browser polling receives a new revision: the normal page is reloaded,
   a clean editor updates, while a dirty editor retains its text and shows a
   conflict.
13. HTTP navigation returns the last successful snapshot and does not start a rebuild.
   Watcher stabilizes external changes and rebuilds only the changed
   documentation root; a manual canonical-portal rebuild shows the scope
   “model, HTML, and search”, progress, and the result before reloading.
14. If `serve` is launched from canonical root with `translations.<locale>`, header
   offers locale tags. The corresponding Markdown opens in the selected
   locale, while a missing page leads to that locale's homepage.
15. The developer stops the server with `Ctrl+C`.

## Error scenarios

- at step 2, a reading or generation error does not leave the server running;
- in step 3, a busy or unavailable port terminates the command with the code `1`;
- a timeout, malformed or oversized GitHub response, or development version
  shows no update suggestion and does not affect other features;
- stale digest returns `409 stale_digest`; explicit overwrite is repeated with
  current digest and `confirmOverwrite: true`, and the request without confirmation and
  second external conflict get `409` again;
- a stale roadmap digest does not permit overwrite: the dialog retains the ID,
  text, and selected stage, refreshes the stages/digest/suggestion, and requires
  another explicit submission;
- when a dirty file is deleted externally, the editor retains the buffer and offers to download
  it without showing inapplicable load/overwrite actions;
- malformed, oversized, cross-origin, and unsafe-path requests receive a JSON
  error envelope and do not change the source;
- a subsequent rebuild error returns HTTP 500 for the current request or is
  written to the watcher server log, but does not stop the listener;
- a manual rebuild error remains on the current page, clears the loading state,
  and offers to retry the action;
- HTML loading error, inappropriate page or mismatched revision in
  soft transition time performs normal full navigation;
- a translation portal whose first build fails shows a safe page
  `Unavailable`; subsequent error does not replace last-known-good snapshot;
- `--host 0.0.0.0` opens the server for the local network without TLS and authorization;
  Docu-docu displays an explicit warning.

## Postconditions

While the command is running, ordinary routes serve output, and a separate
editor API reads and modifies only the permitted workspace inside the docs
root. Other repository files are unavailable. After the process stops, the API
disappears and the port is released. The locale mount
`/_docu-docu/locales/<locale>/` is read-only: it contains no Editor, Changes,
workspace, API docs, or canonical API.

## Business rules

The rules are defined in the module document:

- [BR-SITE-003](../modules/site.md#br-site-003-dev-server-does-not-expose-source-repository) - the dev server does not expose the source repository.
- [BR-SITE-007](../modules/site.md#br-site-007-build-and-serve-have-different-capabilities) - build remains static read-only, serve provides a live workspace.
- [BR-SITE-010](../modules/site.md#br-site-010-soft-navigation-limited-to-canonical-serve-portal) - soft transitions do not change offline/file and locale semantics.
- [BR-SITE-014](../modules/site.md#br-site-014-roadmap-changes-use-only-a-constrained-operation) - serve adds only a new `DLV-*` with CAS and does not make the browser parse Markdown.
- [BR-SITE-015](../modules/site.md#br-site-015-version-check-does-not-affect-portal-availability) - the update notice exists only in canonical serve and degrades without an error.

## Implementation

- [FLOW-DOCS-SERVE: Local portal browsing](../flows/FLOW-DOCS-SERVE.md)
- [Static portal](../modules/site.md)
- [CLI and workflow tasks](../modules/cli.md)
- [CLI contract](../contracts/cli.md)
- [HTTP contract editor API](../contracts/editor-http.md)
- [Editor OpenAPI](../contracts/editor.openapi.yaml)
- [Changes OpenAPI](../contracts/changes.openapi.yaml)

## Verification

- initial assembly and HTTP distribution of the portal;
- save/create and watcher rebuild model, HTML, search and diagnostics;
- path, symlink, body/content limits, same-origin guards and CAS conflicts;
- Markdown preview, JSON/YAML diagnostics and raw `text/plain`;
- desktop/mobile keyboard flow without losing dirty text;
- roadmap happy path, changed suggested ID, progress, CAS preservation,
  keyboard/Escape/focus behavior, and mobile layout;
- manual rebuild from the workspace panel with visible scope, progress, result, and
  subsequent page reload;
- inaccessibility of the button outside `serve` and handling of manual rebuild errors;
- HTTP 500 when rebuilding fails without stopping the process;
- inaccessibility of the repository source files;
- default-loopback and network-warning checks;
- root and nested transitions, Back/Forward, anchors and keyboard navigation;
- search, Mermaid, Screen Map and playable flow after several soft transitions;
- full navigation for editor, changes, locale and external links, as well as
  fallback for network error and revision mismatch;
- absence of eager search index and Mermaid requests on a regular page.
- update notice, per-version dismissal, `--no-update-check`, silent failure,
  and absence of the endpoint/capability in static and translation portals.
