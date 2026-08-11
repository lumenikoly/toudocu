# Secure Markdown

- Identifier: MOD-MARKDOWN
- Status: Ready
- Owner: Toudocu team
- Last updated: 2026-08-10

This module parses the supported CommonMark and GFM syntax once, produces one
normalized structure, and renders safe HTML. Embedded content is never
executed.

## Supported content

Toudocu supports headings, paragraphs, emphasis, block quotes, links, safe
images, lists, task lists, tables, strikethrough, autolinks, code, and a limited
set of Mermaid diagrams. No external Markdown service is required.

## Code locations

- `internal/markdown/` — parsing, analysis, and HTML rendering;
- `internal/app/markdown_parse.go` — conversion into the project model;
- `internal/app/markdown_render.go` — portal integration;
- `internal/app/utils.go` — normalization and escaping.

## Boundaries

The internal Goldmark tree is not part of the public Go API or JSON reports.
CommonMark plus Table, TaskList, Strikethrough, and Linkify are enabled.
Attributes, front matter, footnotes, definition lists, and typographer are not
supported. The project model validates repository links and copied assets.

## Business rules

### BR-MD-001: User HTML is a policy error

Raw block or inline HTML, including HTML inside a table, produces
`forbidden-raw-html`. `check` and `build` fail; preview and rendered diff show
the source only as escaped text.

### BR-MD-002: Dangerous protocols and active assets are blocked

Links with dangerous schemes and documentation-hosted HTML, JavaScript, SVG,
or XML cannot become active portal resources.

### BR-MD-003: Mermaid remains a visualization

Only `flowchart`, `stateDiagram-v2`, and `sequenceDiagram` are allowed, up to
50,000 bytes. Mermaid front matter and directives are forbidden. Nodes and
arrows do not become requirements, acceptance criteria, or roadmap items. The
screen map comes from tables in `screens/SC-*.md`, not from Mermaid text.

## Invariants

- Fenced code is not parsed as headings, links, or tasks.
- Repeated headings receive distinct anchors.
- Source ranges use zero-based byte offsets and one-based line and column
  numbers.
- Metadata is only the first top-level unordered list immediately after H1.
- Unknown syntax remains safe text.
- Local images are limited to safe raster formats.
- Meaningful request sequences belong in `FLOW-*`; simple operations stay in
  API contracts.
- A document containing Mermaid is related to a use case or architecture.

## Stable interfaces

`check`, `build`, `serve`, Editor, and Changes all use the same normalized
model. Low-level parser and renderer functions are intentionally private.

## Related use cases

- [Build the portal](../use-cases/build-portal.md)
- [Check documentation](../use-cases/check-documentation.md)
