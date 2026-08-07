# Docu-docu

Docu-docu is a dependency-free Go CLI with a public Go facade for verifiable
project documentation in structured Markdown and a backend-independent HTML
portal for ordinary HTTP(S) static hosting.

## Problem

Project documentation quickly diverges from code when statuses, relationships,
acceptance criteria, and verification commands live in inconsistent files or
require manual synchronization.

## Solution

Docu-docu builds a unified model from Markdown, checks stable identifiers,
links, business rules, the roadmap, and work items, then provides the result to
people as HTML and to automation as JSON ProjectReport schema v1.

## Main features

- a minimal start with `docs/index.md` and the required
  `docs/architecture/overview.md` map;
- question-oriented detailed architecture documents;
- strict structural and link validation;
- Git-backed review of source-documentation changes;
- derived roadmap and active-work status;
- separate `UC-*` and `FLOW-*` catalogs with bidirectional relationships;
- optional `STD-*` standards, `RB-*` runbooks, and managed custom sections;
- locally shipped Mermaid diagrams and typed `FLOW-*` processes;
- a typed `SC-*` catalog, interactive map, and playable scenarios;
- traceability `UC → SC → TR → TASK → AC → verification`;
- safe static HTML with search, themes, and responsive navigation;
- compact read-only task context for an LLM agent;
- preparation, archiving, and restoration of verifiable work items;
- execution of explicitly declared checks for the selected task;
- full and HEAD-diff currency refresh through the installable AI skill;
- offline install/status/update/uninstall of the embedded AI skill for Codex,
  Claude Code, and Copilot;
- versioned JSON schemas for the project, task context, and task workflow;
- a public Go API for embedding the model, generator, and typed reports;
- operation as one binary without external runtime dependencies; pinned Go
  modules are linked into the binary.

## Target audience

- developers and technical leads;
- teams that maintain documentation next to code;
- LLM agents that need bounded, machine-readable context;
- CI systems that verify the documentation contract;
- Go developers embedding Docu-docu from the source module.

## Limitations

- the dialect is limited to CommonMark plus explicitly enabled tables, task
  lists, strikethrough, and literal autolinks;
- `task verify --run` commands are treated as trusted repository code;
- `build` output is static and does not edit source documents;
- `serve` changes only explicitly selected canonical workspace files through
  the editor API and does not provide writes to translation roots;
- global progress is defined only by `roadmap.md`.
