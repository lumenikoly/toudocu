# Project model and validation

- Identifier: MOD-MODEL
- Status: Completed
- Owner: Docu-docu Team
- Last updated: 2026-08-05

The module reads the documentation directory, builds the associated project model and generates
diagnostics of structure, identifiers, paths and dependencies.

## Purpose

Convert a set of independent Markdown files into a predictable model,
suitable for inspection, HTML rendering and machine reporting.

## Code location

- document model: `internal/app/docs_core.go`, `internal/app/types.go`;
- knowledge and work items: `internal/app/knowledge.go`;
- link resolution: `internal/app/documentation_links.go`;
- general safe operations with paths: `internal/app/utils.go`.

## Module boundaries

The module does not generate HTML files or run task commands. It returns a
model and diagnostics without changing the source documentation. The editor can
provide one in-memory overlay for preview/validation; the ordinary public model
build still reads a filesystem snapshot.

## Business rules

### BR-MODEL-001: Roadmap is the only source of global coverage

Global progress only takes into account `roadmap.md` elements. For related
`UC-*` execution is taken from the use case status, and `CON-*` and `DLV-*` save
state of own checkbox.

### BR-MODEL-002: Links do not go beyond repository root

A local link can only leave the documentation directory internally explicitly
specific repository root. Exit beyond its boundaries is blocked and reflected in
diagnostics.

### BR-MODEL-003: A ready-to-run task has a full verifiable contract

Starting from the “Ready to work” status, the work item contains scope, restrictions,
`AC-*` criteria, plan, verification commands and impact on documentation.

### BR-MODEL-004: Screen documents are the source of the graph

The metadata, states, and transition tables from `screens/SC-*.md` form
typed model `SC-*` and `TR-*`. Arbitrary Mermaid grammar is not
understood as requirements or connections.

### BR-MODEL-005: Overview is a direct map of architectural issues

`architecture/overview.md` is required and has type `Architecture Overview`.
Every other Markdown file under `architecture/` specifies one non-empty
architectural question and is linked directly from the overview; a transitive link
does not count as a listing.

### BR-MODEL-006: OpenAPI contracts are validated as a separate source type

Only `contracts/**/*.openapi.{yaml,yml,json}` receives built-in OpenAPI 3.0/3.1
validation. Root fields, operations/responses, unique `operationId` values,
path parameters, and internal `$ref` values are checked; external references are
never loaded. Arbitrary YAML is not assigned an invented schema.

## Invariants

- each stable ID is unique in its design model;
- standards `STD-*` and runbook `RB-*` are unique, and work item refers only to
  existing typed documents;
- minimal documentation requires `index.md` and
  `architecture/overview.md`; manifest of the appeared quality, runbooks or
  the custom section is checked by warnings;
- architectural broken/blocked links are errors, and the form is non-empty
  the question remains semantic review;
- screen transitions only refer to existing `SC-*`;
- screen routes are unique, and previews and hotspots do not go beyond the repository root;
- each played script reaches the terminal screen or contains diagnostic;
- one `work/*.md` file contains exactly one `TASK-*` or `BUG-*` work item;
- line numbers in public reports begin with one;
- an OpenAPI issue additively includes a column when the parser knows its position;
- normal model assembly does not execute commands;
- the calculated state never overwrites the original Markdown files;
  the user entry to `serve` remains a separate workspace operation.

## Stable interfaces

- `BuildDocumentationModel(Options)` and the other exports from the root `api.go`;
- `ProjectReport` schema v1;
- architectural documents save `documents[].type = architecture`;
- `documents[].sectionType` additively transfers a stable built-in section;
- `Issue` codes;
- ID rules and structures described in [CLI contract](../contracts/cli.md);
- statuses, types and format of tasks from [work task guides](../guides/work-items.md);
- [quality standards](../quality/).

## Related use cases

- [UC-DOCS-02: Documentation Check](../use-cases/check-documentation.md)
- [UC-TASK-01: Work Task Context](../use-cases/task-workflow.md)
- [UC-TASK-02: Checking a work task](../use-cases/task-verify.md)

## Related processes

- [FLOW-DOCS-CHECK: Documentation contract check](../flows/FLOW-DOCS-CHECK.md)
- [FLOW-TASK-WORKFLOW: Working with the task being checked](../flows/FLOW-TASK-WORKFLOW.md)
