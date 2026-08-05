# Docu-docu

Docu-docu - dependency-free CLI on Go with a public Go facade for the testable
project documentation in structured Markdown and stand-alone HTML portal,
working through `file://`.

## Problem

Project documentation quickly diverges from the code when statuses, connections,
acceptance criteria and verification commands are stored in inconsistent files or
require manual synchronization.

## Solution

Docu-docu builds a unified model from Markdown, checks stable identifiers,
links, business rules, roadmap and work items, and then gives the result to a person
in HTML and automation in JSON ProjectReport schema v1.

## Main features

- minimum start with `docs/index.md` and a required card
  `docs/architecture/overview.md`;
- question-oriented detailed architectural documents;
- strict structural and reference validation;
- calculated state of roadmap and active work;
- separate directories `UC-*` and `FLOW-*` with two-way connections;
- optional standards `STD-*`, runbook `RB-*` and managed custom sections;
- autonomous Mermaid diagrams and `FLOW-*` typed processes;
- typed catalog `SC-*`, interactive map and playable scenarios;
- traceability `UC → SC → TR → TASK → AC → verification`;
- secure static HTML with search, themes and responsive navigation;
- compact read-only task context for the LLM agent;
- performing explicitly declared checks of the selected task;
- full and HEAD-diff refresh of relevance through an installed AI-skill;
- versioned JSON schema for the project, task context and task workflow;
- public Go API for embedding a model, rendering and typed reports;
- work with one binary without external runtime dependencies; fixed
  Go modules are linked inside a binary.

## Target audience

- developers and technical managers;
- teams that maintain documentation next to the code;
- LLM agents who need limited and machine-readable context;
- CI systems that check the documentation contract;
- Go developers embedding Docu-docu from the source module.

## Restrictions

- an intentionally limited subset of Markdown is supported;
- `task verify --run` commands are considered trusted repository code;
- the portal is static and does not edit source documents;
- global progress is determined only by `roadmap.md`.