# UC-DOCS-03: View documentation on a local server

- Identifier: UC-DOCS-03
- Status: Ready
- Actor: Developer
- Module: MOD-SITE
- Priority: Medium
- Screens: SC-SITE-HOME, SC-SITE-EDITOR, SC-SITE-DOCUMENT, SC-SITE-API-DOCS
- Start screen: SC-SITE-HOME
- Terminal screens: SC-SITE-DOCUMENT, SC-SITE-API-DOCS
- Allow cycle: Yes
- Last updated: 2026-08-11

A developer runs the portal on their computer, reads documentation, and edits
source files when needed. After a save, Toudocu rereads the sources and displays
the updated result.

## Inputs

- project documentation root;
- portal output directory;
- server host and port;
- optional `--no-update-check` for a fully self-contained run;
- `.md`, `.yaml`, `.yml`, and `.json` files inside the documentation root;
- a local Git repository when Changes is needed.

## Preconditions

- Toudocu is available;
- the developer can read documentation and write to the documentation and
  output roots.

## Main flow

1. The developer runs `toudocu serve ./docs`.
2. Toudocu reads the documentation, builds the portal, and prints
   `http://127.0.0.1:8080`.
3. The developer opens the address, navigates or searches, and opens a document.
4. To edit, they select Edit or open `/_toudocu/editor/`, choose a file, and
   change the source. Markdown has a preview and line-specific diagnostics.
5. On save, the server confirms that no external edit has intervened, safely
   replaces the file, and rebuilds the model, HTML, and search index.
6. The browser displays the new page. If a file changes externally, an ordinary
   page refreshes; an editor with unsaved text keeps that text and reports a
   conflict.
7. The developer presses `Ctrl+C` in the terminal to stop the server.

## Additional journeys

- Changes displays the local Git diff and discussions. See
  [UC-DOCS-05](UC-DOCS-05.md) and [UC-REVIEW-01](UC-REVIEW-01.md).
- On the roadmap page, Add deliverable appends one `DLV-ROADMAP-NNN` line to a
  selected existing stage after checking that the file is still current.
- `/_toudocu/api-docs/` displays Editor and Changes contracts and permits only
  safe `GET` and `HEAD` requests from the UI.
- Configured translations appear as locale links and remain read-only. A
  missing translated page opens that locale's home page.
- When a newer stable release exists, the main portal offers its official
  release page. `--no-update-check` disables this network request completely.

## Error flows

- A failed initial build prevents the server from starting.
- An unavailable host or port returns code `1`.
- A failed, oversized, or invalid release response does not interrupt the
  portal and shows no notice.
- An externally changed open file returns `409 stale_digest`. The editor keeps
  local text and asks the user to reload or deliberately overwrite. A second
  conflict requires another decision.
- If the roadmap changed, its dialog preserves entered fields, refreshes the
  stages, and asks for another submission; there is no automatic overwrite.
- If an open file is deleted externally, the editor lets the user download the
  unsaved text.
- An oversized, malformed, cross-origin, or unsafe-path request returns a JSON
  error and changes no file.
- A later rebuild failure appears in the UI or server log, while the running
  HTTP server keeps the last successful portal.
- A translation that fails its initial build shows `Unavailable`; a later
  failure does not replace its last working snapshot.
- `--host 0.0.0.0` exposes the server to the local network without TLS or
  authentication, and Toudocu prints a warning.

## Postconditions

While the command runs, the portal is available over HTTP. The Editor API can
read and change only allowed files inside the documentation root. Changes may
separately read eligible files in the current repository for diffs, full text,
and discussions, but it never writes Git. After `Ctrl+C`, the server and local
APIs disappear. `/_toudocu/locales/<locale>/` is read-only and has no Editor,
Changes, discussions, API docs, or workspace commands.

## Business rules

- [BR-SITE-003](../modules/site.md#br-site-003-the-local-server-exposes-files-only-through-explicit-interfaces)
- [BR-SITE-007](../modules/site.md#br-site-007-build-and-serve-have-different-capabilities)
- [BR-SITE-010](../modules/site.md#br-site-010-soft-navigation-limited-to-canonical-serve-portal)
- [BR-SITE-014](../modules/site.md#br-site-014-roadmap-changes-use-only-a-constrained-operation)
- [BR-SITE-015](../modules/site.md#br-site-015-version-check-does-not-affect-portal-availability)

## Implementation

- [FLOW-DOCS-SERVE](../flows/FLOW-DOCS-SERVE.md)
- [Static portal](../modules/site.md)
- [CLI and work-item operations](../modules/cli.md)
- [CLI contract](../contracts/cli.md)
- [Editor HTTP API](../contracts/editor-http.md)
- [Editor OpenAPI](../contracts/editor.openapi.yaml)
- [Changes OpenAPI](../contracts/changes.openapi.yaml)

## Scenario verification

Coverage includes initial build and shutdown, saves and external edits, path
and link safety, version conflicts, keyboard and mobile behavior, roadmap,
manual rebuild, translations, Editor and Changes, and `--no-update-check`.
