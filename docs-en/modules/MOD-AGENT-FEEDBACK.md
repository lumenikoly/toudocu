# MOD-AGENT-FEEDBACK: Local requests to a development agent

- Identifier: MOD-AGENT-FEEDBACK
- Status: Done
- Last updated: 2026-08-13

This module attaches human messages to specific documentation locations and
delivers them to an external development agent through a local queue. Toudocu
does not invoke a language model and does not depend on Codex, Claude Code,
OpenCode, or another provider.

## Purpose

A reader creates a question or change request on a document page or in Changes.
Saving immediately creates a pending queue entry, while the message remains
editable until the agent retrieves it through the command line. The agent
checks the current document and, when needed, the code, then returns a
structured response to the same discussion.

## Code location

- `internal/app/review_types.go`, `review_store.go`, and `review_service.go` —
  the model, local store, first-in-first-out queue, and deterministic anchors;
- `internal/app/review_http.go` — the local version 1 API;
- `internal/app/review_cli.go` — `agent next|respond`;
- `web/src/core/portal.ts` and `web/src/features/changes/index.ts` — two views
  of the same discussion state;
- `.agents/skills/toudocu/references/agent-feedback.md` — the built-in skill's
  queue-processing rules.

## Boundaries

The Portal creates a `document` target only for canonical Markdown. Changes
also creates a `file` target for a regular file in the current working diff. A
range is available only for UTF-8 text up to 2 MiB; a binary, large, or deleted
file receives a whole-file target. A `change_request` for `document` is limited
to canonical documentation, while one for `file` permits related safe
repository paths. The feedback API does not accept patches or write files.

State lives in the operating system's user-data directory and is keyed by the
canonical repository root. It is not stored in Git and remains available to
the CLI while `serve` is stopped. Static portals and translation roots remain
read-only.

## Business rules

### BR-AGENT-FEEDBACK-001: Content is independent of transport

`Discussion`, messages, `DocumentAnchor`, and responses store conversation
content. `AgentDelivery` stores delivery information only. A new transport can
therefore be added without changing discussion history.

### BR-AGENT-FEEDBACK-002: A question does not authorize a change

For `intent=question`, the agent responds without changing files. Only
`intent=change_request` permits the agent to validate the request and change
paths within the target-kind boundary. The user's claim is not considered
proven in either case.

### BR-AGENT-FEEDBACK-003: A pending message is editable

Saving atomically moves a message to `submitted` and creates one pending
`AgentDelivery`. While the delivery is `pending`, the message can be edited or
deleted. After the agent retrieves it, the message is immutable; a follow-up is
a new message in the same discussion.

### BR-AGENT-FEEDBACK-004: The queue is processed in strict order

`agent next` returns only the oldest unfinished delivery. Until it receives a
response, the next delivery is not returned. After the lease expires, the
agent receives the same oldest delivery again. Repeating an identical response
succeeds, while a different response for a completed delivery is rejected as a
conflict.

### BR-AGENT-FEEDBACK-005: A human controls the discussion

An agent response does not close the discussion. The user can close, reopen, or
delete any discussion. Closed threads appear after open threads.

## Invariants

- A saved message appears in the queue immediately.
- A message can be edited only before the agent atomically retrieves it.
- A question does not grant permission to change files.
- The feedback API neither writes repository files nor starts an agent.
- Open discussions and unfinished queue entries are never removed
  automatically.

## Stable interfaces

- `/_toudocu/api/agent/` — [agent feedback HTTP API](../contracts/agent-feedback.openapi.yaml);
- `toudocu agent next --json`;
- `toudocu agent respond [--input response.json] [--json]`;
- [JSON contract](../reference/agent-feedback-json.md);
- [delivery process](../architecture/agent-feedback-delivery.md);
- [user scenario](../use-cases/UC-AGENT-FEEDBACK-01.md).

## Related use cases

- [UC-AGENT-FEEDBACK-01: Discuss documentation with a development agent](../use-cases/UC-AGENT-FEEDBACK-01.md)

## Future extension

Interactive human review would add a separate `ReviewGate` capable of passing
an existing `AgentDelivery` to a waiting agent. Blocking waits, reviewer
confirmation, and reviewer decisions are outside the current version.
