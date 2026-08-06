# Secure Markdown

- Identifier: MOD-MARKDOWN
- Status: Completed
- Owner: Docu-docu Team
- Last updated: 2026-08-06

The module turns CommonMark and allowed GFM constructs into one normalized
model and safe HTML without executing embedded content.

## Purpose

Support project documents, tables, lists, checklists, links, images,
quotes, code and limited Mermaid fences without external Markdown runtime.

## Code location

- AST, analysis, and renderer: `internal/markdown/`;
- conversion to the project model: `internal/app/markdown_parse.go`;
- portal integration: `internal/app/markdown_render.go`;
- normalization and escaping: `internal/app/utils.go`;
- behavioral tests: `internal/app/markdown_test.go`.

## Module boundaries

The Goldmark AST is encapsulated inside the module and is not part of the public
Go façade or JSON. CommonMark, tables, task lists, strikethrough, and literal
autolinks are enabled; attributes, front matter, footnotes, definition lists,
and typographer are outside the dialect. Repository relationships and asset
copying are defined by the project model.

## Business rules

### BR-MD-001: User HTML is a policy error

Raw block or inline HTML, including inside tables, produces
`forbidden-raw-html`. `check` and `build` fail, while preview and rendered diff
show the source only as escaped text.

### BR-MD-002: Dangerous protocols and active assets are blocked

Links with dangerous schemes, as well as HTML, JavaScript, SVG and XML from documentation
do not become active portal resources.

### BR-MD-003: Mermaid remains a visualization

Only `flowchart`, `stateDiagram-v2` and `sequenceDiagram` are allowed up to
50,000 bytes. Mermaid front matter and directives are prohibited. Nodes and transitions are not
become requirements, acceptance criteria or roadmap elements.
The generated screen map receives a structure only from tables
`screens/SC-*.md`, not from Mermaid source.

## Invariants

- fenced code is not parsed as headers, links or tasks;
- identical headings receive unique anchors;
- source ranges use 0-based byte offsets and 1-based line/column values;
- metadata is only the first top-level unordered list immediately after the H1;
- unknown or unsupported syntax remains safe text;
- local images are limited to safe raster formats;
- `sequenceDiagram` obeys the general rules for communicating Mermaid documents;
- specific sequences of requests are described by significant `FLOW-*`, and
  simple operations remain in API contracts;
- a Mermaid document is related to a use case or architecture.

## Stable interfaces

High-level document-model operations, `check`, `build`, `serve`, editor, and
changes use one normalized model. The low-level parser/renderer is intentionally
not a public Go API.

## Related use cases

- [UC-DOCS-01: Portal assembly](../use-cases/build-portal.md)
- [UC-DOCS-02: Documentation Check](../use-cases/check-documentation.md)
