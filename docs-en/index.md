# Toudocu

Toudocu is a dependency-free Go CLI with a public Go facade for verifiable
project documentation in structured Markdown and a backend-independent HTML
portal for ordinary HTTP(S) static hosting.

## Problem

Project documentation quickly diverges from code when statuses, relationships,
acceptance criteria, and verification commands live in inconsistent files or
require manual synchronization.

## Solution

Toudocu builds a unified model from Markdown, checks stable identifiers,
links, business rules, the roadmap, and work items, then provides the result to
people as HTML and to automation as JSON ProjectReport schema v1.

## Main features

Toudocu turns Markdown next to the code into a connected, verifiable
documentation system.

- **One project portal.** Search, navigation, the architecture map, user
  scenarios, and current work status live in one coherent interface.
- **A verifiable document model.** Validation checks links, stable identifiers,
  document structure, and explicitly declared relationships.
- **End-to-end traceability.** A use case and screen connect to a task,
  acceptance criterion, and command that verifies the result.
- **Semantic change review.** The Git-backed workspace shows source, rendered,
  and semantic documentation diffs before publication.
- **Task context for an AI agent.** A compact read-only package contains only
  the requirements, rules, screens, dependencies, and checks related to the
  selected task.
- **Embedded documentation AI skill.** An offline package connects Toudocu to
  Codex, Claude Code, and Copilot and adds explicit workflows for initialization,
  full or diff currency refresh, and translation. The CLI installs, checks,
  updates, and removes a managed copy without network access and never
  overwrites user changes. Start with the
  [installation guide](guides/skill-installation.md), then use the
  [agent-workflow guide](guides/agent-workflows.md) for ordinary CLI, portal,
  task, and documentation scenarios.
- **Verifiable work items.** A work item combines scope, acceptance criteria,
  and verification commands; Toudocu checks readiness, executes explicitly
  authorized commands, and records the result.
- **Self-contained publication.** One Go binary creates a static portal without
  a CDN, database, npm, or external runtime for local viewing or ordinary
  static hosting.

## Target audience

- developers and technical leads;
- teams that maintain documentation next to code;
- LLM agents that need bounded, machine-readable context;
- CI systems that verify the documentation contract;
- Go developers embedding Toudocu from the source module.

## Limitations

- the dialect is limited to CommonMark plus explicitly enabled tables, task
  lists, strikethrough, and literal autolinks;
- `task verify --run` commands are treated as trusted repository code;
- `build` output is static and does not edit source documents;
- `serve` changes only explicitly selected canonical workspace files through
  the editor API and does not provide writes to translation roots;
- global progress is defined only by `roadmap.md`.
