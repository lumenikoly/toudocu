# Separation of responsibilities between runtime components

- Document type: Architecture
- Architecture question: How do runtime components share responsibilities?

Runtime forms a sequential pipeline: CLI or direct Go API call sets
operation, Markdown layer extracts safe representation, model checks
structure and connections, and the selected consumer returns a report, builds a portal or
Performs a separately permitted task workflow.

## Area

The answer shows the large runtime boundaries of a single Go process. Local
invariants and interfaces belong to the corresponding module documents.

## Components

`GitChangeSource` allows commits/index/working tree and reads status, patches
and blobs. `ChangeSetBuilder` combines Git metadata with parser/knowledge model;
source, rendered, semantic, OpenAPI and task engines degrade independently.
`ChangesHTTPHandler` gives read-only views, and the UI polls digest and saves
URL state for invalidation. Components are active for `changes` and `serve`;
static `build` is independent of Git.

| Border | Responsibility | Details source |
|---|---|---|
| CLI | Parse command, normalize paths and select operation | [MOD-CLI](../modules/cli.md) |
| Go API | Provide a stable typed façade without access to `internal/app` | [CON-GO-API-V1](../contracts/go-api.md) |
| Markdown | Extract supported structure and render content safely | [MOD-MARKDOWN](../modules/markdown.md) |
| Project model | Classify documents, resolve connections and generate diagnostics | [MOD-MODEL](../modules/model.md) |
| Site | Create a standalone read-only portal or serve-only editor workspace with live rebuild | [MOD-SITE](../modules/site.md) |

The static generator and serve options are separated. Serve stores separate
runtime snapshots canonical and configured translation roots: HTTP reads only
the last successful snapshot, and the watcher rebuilds the changed root.
Workspace lists and atomically writes allowed canonical files;
editor API applies HTTP guards. Any entry accepted again
passes Project model and Site, so the browser does not generate a parallel model.

Screen graph and task workflow extend the model, but do not bypass its validation
gate. Specific sequences of operations remain in
[FLOW-DOCS-CHECK](../flows/FLOW-DOCS-CHECK.md),
[FLOW-DOCS-BUILD](../flows/FLOW-DOCS-BUILD.md) and
[FLOW-DOCS-SERVE](../flows/FLOW-DOCS-SERVE.md),
[FLOW-TASK-WORKFLOW](../flows/FLOW-TASK-WORKFLOW.md).