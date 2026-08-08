# API and programmatic interface map

This page helps developers and integrators choose a current Docu-docu
interface. Wire-level Editor and Changes contracts are defined in OpenAPI
3.1.0; Markdown links lead to behavioral companions.

| Interface | Availability | Purpose | Read/write boundary | Result | Contract |
|---|---|---|---|---|---|
| CLI | Installed binary or `go run ./cmd/docu-docu` in the source repository | Check, build, `serve`, search, task workflow, and Git-backed changes | Most commands read documentation; `build` writes output, `task init`, scaffold, and task archive/restore change explicitly selected files, while `task verify --run` separately executes permitted commands | Text, exit code, or JSON schema v1; for `build`, an HTML portal and `report.json` | [CLI contract](../contracts/cli.md) |
| Go API | Root Go package; no published remote module path yet | Embed the model, generator, task workflow, and changes without a separate process | Effects depend on the invoked operation; reading, writing, and execution are not hidden behind one implicit entrypoint; the Markdown AST/parser/renderer are internal | Go model, report, and error types; JSON only on explicit serialization | [Feature overview](features.md#public-go-api) |
| JSON reports | `--format json`, `--report`, and generated `report.json` for supported operations | CI, agents, and integrations read the same typed model used by the portal | Reports do not change Markdown; the CLI may write an explicitly selected report or output | Versioned JSON schema v1: `ProjectReport`, task/search/scaffold reports, and change reports | [CLI contract and report schemas](../contracts/cli.md#json-results) |
| Editor HTTP API | Only a canonical portal started with `docu-docu serve` | List, read, preview, validate, create, and CAS-save workspace files | Reads allowed `.md`, `.yaml`, `.yml`, and `.json`; only explicit guarded create/save writes within the documentation root | JSON schema v1; raw source for a separate read-only request | [OpenAPI](../contracts/editor.openapi.yaml), [behavior](../contracts/editor-http.md) |
| Version status HTTP API | Canonical `docu-docu serve` unless `--no-update-check` is set | Compare the current version with the latest stable release | The browser requests same-origin; Go makes one constrained read-only request to a fixed GitHub endpoint | JSON schema v1 with `up-to-date`, `update-available`, or `unavailable` status | [OpenAPI](../contracts/editor.openapi.yaml), [behavior](../contracts/editor-http.md#version-check) |
| Changes HTTP API | `docu-docu serve`, including direct read-only serving of a translation root; configured locale mounts do not receive the API | Read-only comparison of Git states, files, rendered content, screen overlay, and task impact | Reads local Git revisions and the selected documentation root; does not change Git or Markdown | `ChangeSetReport` and related JSON schema v1, raw content, or sanitized HTML | [OpenAPI](../contracts/changes.openapi.yaml), [behavior](../contracts/changes-http.md) |
| Offline API docs | `/_docu-docu/api-docs/` only in canonical `serve` | Selector for both OpenAPI contracts, operation browsing, and safe Try it out | Same-origin; Try it out is limited to `GET`/`HEAD`; no CDN | Vendored Swagger UI 5.32.12 | [SC-SITE-API-DOCS](../screens/SC-SITE-API-DOCS.md) |
| Manual rebuild | Only a canonical portal in `serve` mode | Explicitly rebuild the model, HTML, and search | Reads the canonical documentation root and writes generated output; does not change Markdown | Success JSON `{documents, pages, warnings, errors}` without `schemaVersion`; errors are plain text | [Editor OpenAPI](../contracts/editor.openapi.yaml), [behavior](../contracts/editor-http.md) |

The Editor API and API docs are absent from every translation portal. A
configured locale mount also receives no Changes API; when a translation root
is served directly, the Changes API remains read-only. No HTTP interface runs
Git write commands, shell commands, or task verification.
