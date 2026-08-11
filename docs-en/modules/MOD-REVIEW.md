# MOD-REVIEW: Local discussions about changes

- Identifier: MOD-REVIEW
- Status: Ready
- Last updated: 2026-08-10

This module stores local discussions over a Git diff and immutable comment
batches for an AI agent. It does not start the agent or contact an external AI
model.

## Purpose

In the main `serve` portal, a developer can attach a message to changed lines
or a related file, prepare new messages for an agent, and read the agent's
answers in the same discussions.

## Code locations

- `internal/app/review_*.go` — repository view, storage, anchor relocation,
  HTTP handlers, and CLI commands;
- `web/src/features/changes/` and `web/src/styles/changes.css` — discussions in
  the Changes workspace;
- `skills/toudocu/` — the workflow that lets an agent receive and return
  comment batches in order.

## Boundaries

Discussions are available only in the main `serve` portal. Static portals,
translations, and serving a translation directory directly do not include
them. State and snapshots are stored outside the repository in the user's
state directory. Toudocu does not change the working tree, index, refs, or Git
history.

## Business rules

### BR-REVIEW-001: Comments are writable only for the working tree

Every supported comparison can be viewed. Comments and agent batches can be
created or changed only when the comparison ends at `working-tree`, the current
working tree state.

### BR-REVIEW-002: Sending comments does not start the agent

The UI commits new messages from open discussions in one action. After a
separate request from the user, the installed skill retrieves the oldest
pending batch through the CLI and returns one complete schema-v1 response.

### BR-REVIEW-003: Sent content is immutable

The latest unsent message can be edited or deleted. Once sent, both the message
and its batch remain unchanged; continuing the discussion creates a new reply.

## Invariants

- The browser sends only one-based Unicode coordinates. The Go process reads
  selected text and context itself.
- Every write checks the expected version and state hash, takes an operating
  system lock, and atomically replaces the state file.
- A response is accepted only as a whole and must contain exactly one valid
  result for every message in the batch.
- A `fixed` result does not resolve a discussion; discussion state is only
  `open` or `resolved`.
- Actual changes come from the current Git diff, not from the agent's
  `changedPaths` list.

## Stable interfaces

- internal schema-v1 discussion structures, not exported through `api.go`;
- `/_toudocu/api/changes/review/` in the main `serve` portal;
- `toudocu changes feedback pending|respond`;
- [Changes HTTP API](../contracts/changes-http.md);
- [FLOW-REVIEW-FEEDBACK](../flows/FLOW-REVIEW-FEEDBACK.md);
- [Keeping comments attached](../architecture/review-anchoring.md);
- [UC-REVIEW-01](../use-cases/UC-REVIEW-01.md).

## Related use cases

- [UC-REVIEW-01: Discuss changes and hand comments to an agent](../use-cases/UC-REVIEW-01.md)
