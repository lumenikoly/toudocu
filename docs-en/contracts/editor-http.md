# Editor HTTP API: Behavior and Boundaries

- Identifier: CON-EDITOR-HTTP-V1
- Status: Completed
- Owner: Docu-docu Team
- Last updated: 2026-08-06

[OpenAPI 3.1.0](editor.openapi.yaml) contains routes, parameters, response codes,
and data schemas. In canonical `serve`, this page also provides a button for
opening the specification in Swagger UI.

This document describes editor guarantees that a single HTTP schema cannot
express: the workspace boundary, write protection, and rebuild behavior.

## Availability

The Editor API exists only in canonical `docu-docu serve`. It is absent from a
static build, locale sections, and direct `serve` of a translation root. Go
enables the editor UI only with the `editor` capability and passes a same-origin
API base in the versioned page bootstrap; the frontend does not derive the
endpoint from the page URL.

The editor sees only allowed `.md`, `.yaml`, `.yml`, and `.json` files inside
the documentation root. OpenAPI files are validated by the same validator used
by `docu-docu check`.

## Writing a file

Save uses a SHA-256 digest to protect against overwriting external changes. A
new file is written to a temporary file in the same directory, inherits the
mode, and atomically replaces the source. On conflict, the editor preserves the
local text and requires separate confirmation with the current digest.

Document creation uses the same template registry as the CLI and does not
overwrite an existing file. Diagnostics warn the user but do not themselves
prevent a save.

## Adding a roadmap deliverable

The roadmap-state read operation returns the current digest, revision,
existing H2 stages, and the next suggested `DLV-ROADMAP-NNN`. The add operation
accepts only a new unfinished `DLV-*` for an existing stage: the ID is converted
to uppercase and must be unique, while the text must be a non-empty single line
without a second roadmap ID. OpenAPI defines the routes, HTTP methods, statuses,
and JSON schemas.

The write uses the same workspace path guard, digest CAS, and atomic replace as
a regular save. The item is inserted after the stage's final checklist item or,
if the stage has none, before the next H2; the original line endings and the
rest of the Markdown are not normalized. A `stale_digest` never overwrites
automatically: the response carries fresh stages, digest, and ID suggestion so
the browser can preserve the form fields and ask the user to retry deliberately.

## Trust boundary

A write request must have a JSON content type, the correct action header, and a
same-origin browser context. This protects the local browser scenario but is not
authentication: a server explicitly exposed on `0.0.0.0` is reachable by other
clients on the trusted local network.

For the generic Editor, only a relative POSIX path inside the canonical
documentation root is allowed.
Empty and absolute paths, `.`, `..`, backslashes, NUL, hidden, excluded, and
output paths, as well as every symlink component, are rejected. The Editor API
does not run Git, a shell, or task verification commands.

## Rebuild

After a successful save, create, or roadmap item addition, the server
synchronously rebuilds the model, HTML, search, and diagnostics. A rebuild
failure is returned to the current request but does not stop the listener.
Manual rebuild uses the same OpenAPI contract, reads canonical sources, and
does not change Markdown.

## Related documents

- [Why the wire contract is separate from behavior](../decisions/ADR-004.md)
- [Static portal module](../modules/site.md)
- [Local viewing and editing](../use-cases/serve-portal.md)
- [Trust boundaries](../architecture/trust-boundaries.md)
