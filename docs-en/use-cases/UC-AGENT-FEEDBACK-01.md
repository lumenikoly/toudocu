<!-- toudocu
version: 1
id: UC-AGENT-FEEDBACK-01
status: done
priority: high
module: MOD-AGENT-FEEDBACK
screens: SC-SITE-DOCUMENT, SC-CHANGES-WORKSPACE
startScreen: SC-SITE-DOCUMENT
terminalScreens: SC-SITE-DOCUMENT, SC-CHANGES-WORKSPACE
updated: 2026-08-14
-->

# UC-AGENT-FEEDBACK-01: Discuss a changed file with a development agent


A developer asks a question about documentation or a changed file, or requests
a verified target change. A development agent retrieves the request through a
local command and returns a response to the original discussion.

<!-- toudocu:section prerequisites -->
## Preconditions

- the canonical portal is running through `toudocu serve` inside a Git
  repository;
- the development agent has the Toudocu skill installed and can run Toudocu
  commands;
- the target is in canonical documentation or is a regular file in the current
  working Git diff.

<!-- toudocu:section main-scenario -->
## Main scenario

1. The developer selects document text, including headings, and opens the
   context menu. The menu can copy text, copy context, or add a discussion
   message.
2. The developer chooses `question` or `change_request`, enters a message, and
   saves it. Saving atomically creates a pending queue entry, reads only the
   target document and local state, and does not build the Changes Git
   projection.
3. The message can be edited or deleted until the agent retrieves it through
   `agent next`. After retrieval, it is immutable.
4. The shared discussion panel stays on the current tab and shows every project
   thread, open threads first. The same threads are available on every page of
   the main Portal and in Changes, so replying, editing, closing, or deleting
   does not require switching tabs. A new question is available only when a
   current canonical document exists.
5. Copy prompt immediately copies the fail-closed instruction below and does
   not change the queue:

   ```text
   $toudocu feedback
   ```

6. After receiving the instruction and before reading documentation, the
   roadmap, `UC-*`, `TASK-*`, acceptance criteria, or status, the development
   agent runs `toudocu agent next --json`. If the command returns
   `pending=false`, the agent stops without reading or changing files.
   Otherwise, it reads only the retrieved delivery, its target, discussion
   history, needed Git diff, and minimum context.
7. For `question`, the agent responds without changing files. For
   `change_request`, it changes `target.path` and only additional files the
   human unambiguously named when they remain inside the target kind's safe
   boundary. If an additional path is ambiguous, the agent returns
   `needs_clarification`.
8. Without running validation commands, the agent must submit `AgentResponse`
   through `toudocu agent respond` before moving to the next request or exiting.
   For `changed`, the message confirms the edits and lists `changedPaths`. The
   response appears in the original thread, and the delivery becomes
   `responded`.
9. The developer closes the discussion or sends a follow-up. A follow-up creates
   a new queue entry in the same thread.

## Alternative scenarios

- If the queue is empty, `agent next --json` returns `pending=false` and exit
  code `0`.
- An open thread without a new message is not pending work: after a response,
  the next `agent next` returns `pending=false`.
- If a delivery is already leased to a handler, a second handler receives
  `AGENT_INBOX_BUSY`. After the lease expires, the oldest delivery becomes
  available again.
- If the document changed, Toudocu relocates the anchor when there is one exact
  text match or one unique pair of stored contexts. Otherwise its state becomes
  `stale` or `deleted`.
- For `stale`, the agent rereads the current document. If it cannot determine
  the intent reliably, it returns `needs_clarification`.
- In unified diff, a new-side selection creates an exact file range. An
  old-side selection creates a file discussion, while the
  path, old line numbers, and deleted text are stored as a visible quote in the
  message. Mixed selections allow copying only. A fully deleted file supports
  a whole-file discussion.
- Repeating an identical response does not create another message. A different
  response for the same completed delivery returns `AGENT_RESPONSE_CONFLICT`.
- Corrupt local state is not overwritten and returns
  `AGENT_STATE_CORRUPTED`.

<!-- toudocu:section postconditions -->
## Postconditions

- the conversation and queue are stored outside the repository and survive a
  restart;
- messages retrieved by the agent and agent responses are immutable;
- the filesystem and ordinary rebuild remain the source of actual changes;
- Toudocu did not start a language model or change working code.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] The conversation and queue are stored outside the repository and survive
  a restart.
- [x] Pending messages are editable, while messages retrieved by the agent and
  agent responses are immutable.
- [x] The filesystem and ordinary rebuild remain the source of actual changes.
- [x] Toudocu does not start a language model or change working code.

<!-- toudocu:section business-rules -->
## Business rules

- [BR-AGENT-FEEDBACK-001](../modules/MOD-AGENT-FEEDBACK.md#br-agent-feedback-001-content-is-independent-of-transport)
- [BR-AGENT-FEEDBACK-002](../modules/MOD-AGENT-FEEDBACK.md#br-agent-feedback-002-a-question-does-not-authorize-a-change)
- [BR-AGENT-FEEDBACK-003](../modules/MOD-AGENT-FEEDBACK.md#br-agent-feedback-003-a-pending-message-is-editable)
- [BR-AGENT-FEEDBACK-004](../modules/MOD-AGENT-FEEDBACK.md#br-agent-feedback-004-the-queue-is-processed-in-strict-order)
- [BR-AGENT-FEEDBACK-005](../modules/MOD-AGENT-FEEDBACK.md#br-agent-feedback-005-a-human-controls-the-discussion)

<!-- toudocu:section implementation -->
## Implementation

- [MOD-AGENT-FEEDBACK](../modules/MOD-AGENT-FEEDBACK.md)
- [FLOW-AGENT-FEEDBACK](../flows/FLOW-AGENT-FEEDBACK.md)
- [SC-SITE-DOCUMENT](../screens/SC-SITE-DOCUMENT.md)
- [SC-CHANGES-WORKSPACE](../screens/SC-CHANGES-WORKSPACE.md)
