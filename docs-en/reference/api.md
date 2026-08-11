# API and programmatic interface map

Use this table to choose an interface Toudocu actually provides. OpenAPI 3.1.0
defines exact Editor and Changes HTTP fields; adjacent Markdown explains
behavior and security boundaries.

| Interface | Availability | Purpose | Read and write boundary | Details |
|---|---|---|---|---|
| CLI | Installed binary; `go run ./cmd/toudocu` in the source repository | Check, build, `serve`, search, changes, and work items | Most commands are read-only. `build` writes output, task creation and archiving move explicitly selected files, and `task verify --run` starts authorized commands | [CLI contract](../contracts/cli.md) |
| Go API | Root package of this source module | Embed the model, generator, work-item operations, and changes without another process | Side effects depend on the called function and are not hidden behind one universal entry point | [Public Go API](features.md#public-go-api) |
| JSON reports | `--format json`, `--report`, and `report.json` | CI, agents, and integrations | A report does not change Markdown; the CLI writes only an explicit report or output path | [CLI schemas](../contracts/cli.md#json-results) |
| Editor HTTP API | Main `toudocu serve` portal only | List, read, preview, validate, create, and safely save files; add one `DLV-*` | Allowed `.md`, `.yaml`, `.yml`, and `.json` inside the canonical documentation root | [OpenAPI](../contracts/editor.openapi.yaml), [behavior](../contracts/editor-http.md) |
| Version HTTP API | Main `serve` without `--no-update-check` | Compare the running version with the latest stable release | The browser calls the local server; Go makes one bounded read-only GitHub request | [Behavior](../contracts/editor-http.md#version-check) |
| Changes HTTP API | `serve`; read-only when a translation root is served directly | Return `ChangeSetReport` and specialized documentation views | Reads local Git and the selected documentation roots; changes nothing | [OpenAPI](../contracts/changes.openapi.yaml), [behavior](../contracts/changes-http.md) |
| Review HTTP API | Main `serve` only | List eligible files across the repository, store discussions, and display agent responses | Every range is readable; writes require `working-tree`; state lives outside the repository | [OpenAPI](../contracts/changes.openapi.yaml), [behavior](../contracts/changes-http.md#repository-wide-discussions) |
| Feedback CLI | Binary or source repository | Move pending batches between Changes and the installed skill | Reads and writes local discussion state only; starts neither an agent nor Git | [CLI contract](../contracts/cli.md#agent-responses-to-comments) |
| HTTP API reference | `/_toudocu/api-docs/` in the main `serve` portal only | Browse both OpenAPI contracts and try safe requests | Same-origin; Try it out permits only `GET` and `HEAD`; no CDN | [Screen](../screens/SC-SITE-API-DOCS.md) |
| Manual rebuild | Main `serve` only | Reread documents and rebuild the model, HTML, and search | Reads canonical sources and writes derived output only; does not change Markdown | [Editor OpenAPI](../contracts/editor.openapi.yaml) |

The `toudocu` import path is intended for the source tree or an explicit local
`replace`. The CLI remains the public distribution interface.

Translation portals have no Editor, API reference, or review writes. No HTTP
interface writes Git, invokes a system shell, or runs work-item verification.
