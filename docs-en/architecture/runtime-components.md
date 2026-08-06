# Runtime Component Responsibilities

- Document type: Architecture
- Architecture question: How do runtime components divide responsibilities?

The runtime forms a sequential pipeline: the CLI or a direct Go API call
selects an operation, the document/OpenAPI layer extracts a safe
representation, the model validates structure and relationships, and the
selected consumer returns a report, builds a portal, or executes a separately
authorized task workflow.

## Scope

This answer describes the major runtime boundaries of a single Go process.
Local invariants and interfaces belong in the corresponding module documents.

## Components

`internal/markdown` performs one `Parse → Analysis → Render` cycle: the Goldmark
AST remains private, and the project model receives only normalized values and
source ranges. Every structural consumer uses this analysis.

`GitChangeSource` resolves commits/index/working tree and reads status, patches,
and blobs. `ChangeSetBuilder` combines Git metadata with the parser/knowledge
model; source, rendered, semantic, OpenAPI, and task engines degrade
independently. `ChangesHTTPHandler` serves read-only views, while the UI polls a
digest and preserves URL state during invalidation. These components are active
for `changes` and `serve`; static `build` does not depend on Git.

| Boundary | Responsibility | Source of details |
|---|---|---|
| CLI | Parse the command, normalize paths, and select the operation | [MOD-CLI](../modules/cli.md) |
| Go API | Provide a typed facade without access to `internal/app` | [Public Go API overview](../reference/features.md#public-go-api) |
| Markdown | Parse CommonMark/GFM into a private AST, normalize structure, and render content safely | [MOD-MARKDOWN](../modules/markdown.md), [ADR-005](../decisions/ADR-005.md) |
| Project model | Classify documents, validate OpenAPI, resolve relationships, and produce diagnostics | [MOD-MODEL](../modules/model.md) |
| Site | Create a backend-independent static HTTP portal or canonical serve workspace with editor, changes, and offline API docs | [MOD-SITE](../modules/site.md) |

The static generator and serve variant are separated. Serve keeps separate
runtime snapshots for the canonical root and configured translation roots: HTTP
reads only the latest successful snapshot, while the watcher rebuilds the root
that changed. The workspace lists and atomically writes allowed canonical
files; the editor API applies HTTP guards. Every accepted write passes through
the Project model and Site again, so the browser does not form a parallel
model. Declarative Editor/Changes route registries are checked against OpenAPI
operations; Swagger UI reads the same specs as same-origin assets.

The screen graph and task workflow extend the model without bypassing its
validation gate. Concrete operation sequences remain in
[FLOW-DOCS-CHECK](../flows/FLOW-DOCS-CHECK.md),
[FLOW-DOCS-BUILD](../flows/FLOW-DOCS-BUILD.md),
[FLOW-DOCS-SERVE](../flows/FLOW-DOCS-SERVE.md), and
[FLOW-TASK-WORKFLOW](../flows/FLOW-TASK-WORKFLOW.md).
