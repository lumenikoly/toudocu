# UC-REVIEW-01: Discuss changes and hand comments to an agent

- Identifier: UC-REVIEW-01
- Status: Completed
- Actor: Developer
- Module: MOD-REVIEW
- Priority: High
- Screens: SC-CHANGES-WORKSPACE
- Entry screen: SC-CHANGES-WORKSPACE
- Exit screens: SC-CHANGES-WORKSPACE
- Last updated: 2026-08-12

A developer comments on changes across the local repository, sends the prepared
messages to an AI agent, and receives its answers in the same discussions.

## Preconditions

- the main portal is running through `serve` inside a Git repository;
- the comparison ends at `working-tree`. Discussions are read-only for a commit
  or the index.

## Main flow

1. The developer opens `/changes/` and keeps `working-tree` as the comparison's
   end state.
2. They comment on the whole change set, an entire file, a patch line, or a
   selection in the Full file tab. There is no comment-type field; the form
   accepts message text only.
3. Toudocu stores the path, lines, selected text, and surrounding context in
   local user state outside the repository.
4. Before a message is sent, the developer can edit or delete it and add more
   replies to the discussion.
5. “Send to agent” creates an immutable batch of pending comments. It does not
   start an agent. The UI displays the phrase “Process comments from Toudocu
   Changes,” which the developer can copy.
6. The developer sends that phrase to a connected agent or explicitly invokes
   `$toudocu feedback`. The agent receives the oldest pending batch, checks each
   comment against the repository, changes files when justified, and returns
   one result per message.
7. The answers appear in the original discussions. The developer reviews the
   changes and either resolves the discussion or leaves it open; an agent answer
   never resolves it automatically.

## Alternative flows

- When the comparison ends at `commit` or `index`, the form is disabled and
  explains that comments are writable only for the working tree.
- A file listed under Related is not added to discussion state until its first
  message is saved.
- After a file changes, Toudocu relocates an anchor only when the match is
  unambiguous. Otherwise it marks the anchor `stale`, or `deleted` if the file
  was removed.
- An invalid or incomplete agent response changes no discussion.
- Toudocu does not overwrite corrupt local storage; it reports a diagnostic
  instead.

## Postconditions

- Discussions remain local and are not written into the repository.
- Sent batches and answers cannot be changed retroactively.
- A `fixed`, `notFixed`, or `needsClarification` result does not resolve the
  discussion automatically.

## Acceptance criteria

- [x] Discussions remain local and are not written into the repository.
- [x] Sent batches and answers cannot be changed retroactively.
- [x] A `fixed`, `notFixed`, or `needsClarification` result does not resolve the
  discussion automatically.

## Business rules

- [BR-REVIEW-001](../modules/MOD-REVIEW.md#br-review-001-comments-are-writable-only-for-the-working-tree)
- [BR-REVIEW-002](../modules/MOD-REVIEW.md#br-review-002-sending-comments-does-not-start-the-agent)
- [BR-REVIEW-003](../modules/MOD-REVIEW.md#br-review-003-sent-content-is-immutable)

## Implementation

- [MOD-REVIEW](../modules/MOD-REVIEW.md)
- [SC-CHANGES-WORKSPACE](../screens/SC-CHANGES-WORKSPACE.md)
- [FLOW-REVIEW-FEEDBACK](../flows/FLOW-REVIEW-FEEDBACK.md)
