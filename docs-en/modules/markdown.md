# Secure Markdown

- Identifier: MOD-MARKDOWN
- Status: Completed
- Owner: Docu-docu Team
- Last updated: 2026-07-28

The module parses a supported subset of Markdown and creates safe
HTML fragments without executing embedded content.

## Purpose

Support project documents, tables, lists, checklists, links, images,
quotes, code and limited Mermaid fences without external Markdown runtime.

## Code location

- analysis: `internal/app/markdown_parse.go`;
- rendering: `internal/app/markdown_render.go`;
- normalization and screening: `internal/app/utils.go`;
- behavioral tests: `internal/app/markdown_test.go`.

## Module boundaries

The module does not implement full CommonMark and does not allow arbitrary HTML. Connections with
the repository and copying of assets are determined by the design model.

## Business rules

### BR-MD-001: Custom HTML is always escaped

Text, attributes, code and metadata are contextually escaped before
inclusion in the generated page.

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
- unknown or unsupported syntax remains safe text;
- local images are limited to safe raster formats;
- `sequenceDiagram` obeys the general rules for communicating Mermaid documents;
- specific sequences of requests are described by significant `FLOW-*`, and
  simple operations remain in API contracts;
- a Mermaid document is related to a use case or architecture.

## Stable interfaces

- `AnalyzeMarkdown`;
- `RenderMarkdown`;
- `RenderMarkdownFragment`;
- `LinkResolver` as the boundary between Markdown and the design model.

## Related use cases

- [UC-DOCS-01: Portal assembly](../use-cases/build-portal.md)
- [UC-DOCS-02: Documentation Check](../use-cases/check-documentation.md)
