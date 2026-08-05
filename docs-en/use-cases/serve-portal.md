# UC-DOCS-03: View documentation on local server

- Identifier: UC-DOCS-03
- Status: Completed
- Actor: Developer
- Module: MOD-SITE
- Priority: Medium
- Last updated: 2026-08-04

The developer views and edits documentation via a local HTTP server
and receives an updated model and portal after saving or external changes.

## Inputs

- catalog of design documentation;
- output directory;
- server address and port;
- the usual `.md`, `.yaml`, `.yml` and `.json` inside the documentation directory.

## Preconditions

- Docu-docu is available for launch;
- the developer has read and write rights to the documentation and the output directory.

## Main scenario

1. The developer calls `docu-docu serve ./docs`.
2. Docu-docu assembles the portal into the output directory.
3. Docu-docu starts an HTTP server on `127.0.0.1:8080` and reports the address.
4. The developer opens the portal or `/_docu-docu/editor/` in the browser.
5. The Editor receives a revision, a safe list of files and a general registry of templates.
6. The developer opens the source, changes the text, checks the Markdown preview and
   positional diagnostics and saves it.
7. Docu-docu compares SHA-256 digest, atomically replaces file and synchronously
   rebuilds model, HTML, search and diagnostics.
8. When transitioning between canonical HTML documents, the portal can receive in advance
   target page, check the current revision and replace the document layout without
   rebuild. Back/Forward, anchors, scroll and keyboard focus continue to work.
9. Browser polling receives a new revision: the normal page is reloaded,
   the clean editor is updated, and the dirty editor saves the text and shows
   conflict.
10. HTTP navigation returns the last successful snapshot and does not start rebuild.
   Watcher stabilizes external changes and rebuilds only the changed
   documentation root; manual reassembly canonical portal shows the area
   “model, HTML and search”, progress and summary before reboot.
11. If `serve` is launched from canonical root with `translations.<locale>`, header
   offers locale tags. The corresponding Markdown opens in the selected
   locale, and the missing page is on its homepage.
12. The developer stops the server with the `Ctrl+C` combination.

## Error scenarios

- at step 2, a reading or generation error does not leave the server running;
- in step 3, a busy or unavailable port terminates the command with the code `1`;
- stale digest returns `409 stale_digest`; explicit overwrite is repeated with
  current digest and `confirmOverwrite: true`, and the request without confirmation and
  second external conflict get `409` again;
- when deleting a dirty file externally, the editor saves the buffer and offers to download
  it without showing inapplicable load/overwrite actions;
- malformed, oversized, cross-origin and unsafe-path requests receive JSON errors
  envelope and do not change the source;
- subsequent rebuild error returns HTTP 500 for the current request or
  server log watcher, but does not stop listener;
- manual rebuild error remains on the current page, clears the state
  downloads and prompts you to repeat the action;
- HTML loading error, inappropriate page or mismatched revision in
  soft transition time performs normal full navigation;
- translation portal with unsuccessful first build shows secure page
  `Unavailable`; subsequent error does not replace last-known-good snapshot;
- `--host 0.0.0.0` opens the server for the local network without TLS and authorization;
  Docu-docu displays an explicit warning.

## Postconditions

While the command is running, regular routes distribute output, and a separate editor API
reads and modifies only allowed workspace within docs root. Other files
repositories are not available. After the process is stopped, the API disappears and the port is freed.
Locale mount `/_docu-docu/locales/<locale>/` is read-only: it does not contain
editor, changes, workspace or canonical API.

## Business rules

The rules are defined in the module document:

- [BR-SITE-003](../modules/site.md#br-site-003-dev-server-does-not-expose-source-repository) - the dev server does not expose the source repository.
- [BR-SITE-007](../modules/site.md#br-site-007-build-and-serve-have-different-capabilities) - build remains static read-only, serve provides a live workspace.
- [BR-SITE-010](../modules/site.md#br-site-010-soft-navigation-limited-to-canonical-serve-portal) - soft transitions do not change offline/file and locale semantics.

## Implementation

- [FLOW-DOCS-SERVE: Local portal browsing](../flows/FLOW-DOCS-SERVE.md)
- [Static portal](../modules/site.md)
- [CLI and workflow tasks](../modules/cli.md)
- [CLI contract](../contracts/cli.md)
- [HTTP contract editor API](../contracts/editor-http.md)

## Examination

- initial assembly and HTTP distribution of the portal;
- save/create and watcher rebuild model, HTML, search and diagnostics;
- path, symlink, body/content limits, same-origin guards and CAS conflicts;
- Markdown preview, JSON/YAML diagnostics and raw `text/plain`;
- desktop/mobile keyboard flow without losing dirty text;
- manual reassembly from the workspace panel with a visible area, progress, total and
  subsequent page reload;
- inaccessibility of the button outside `serve` and handling of manual rebuild errors;
- HTTP 500 when rebuilding fails without stopping the process;
- inaccessibility of the repository source files;
- check default loopback and network warning.
- root and nested transitions, Back/Forward, anchors and keyboard navigation;
- search, Mermaid, Screen Map and playable flow after several soft transitions;
- full navigation for editor, changes, locale and external links, as well as
  fallback for network error and revision mismatch;
- absence of eager search index and Mermaid requests on a regular page.
