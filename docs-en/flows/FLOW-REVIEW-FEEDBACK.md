# FLOW-REVIEW-FEEDBACK: Hand comments to an agent

- Identifier: FLOW-REVIEW-FEEDBACK
- Use case: UC-REVIEW-01
- Module: MOD-REVIEW
- Last updated: 2026-08-10

## Flow

```mermaid
sequenceDiagram
    actor User as Developer
    participant UI as Changes workspace
    participant Review as Discussion service
    participant Store as Local storage
    participant Skill as toudocu feedback workflow
    participant Agent as AI agent

    User->>UI: Comment on the change set, a file, a line, or a selection
    UI->>Review: Send the target, coordinates, and expected state version
    Review->>Review: Validate the path and read the text with context
    Review->>Store: Safely store the discussion and snapshot
    User->>UI: Select “Send to agent”
    UI->>Review: Commit all new messages in open discussions
    Review->>Store: Add an immutable batch to the queue
    User->>Agent: Ask it to process Toudocu Changes comments
    Agent->>Skill: $toudocu feedback
    Skill->>Review: Request the oldest pending batch
    Review-->>Skill: Return the batch and its anchors
    Skill->>Agent: Provide validated targets and messages
    Agent->>Agent: Review the comments and change files when justified
    Skill->>Review: Submit one complete result for every message
    Review->>Store: Store the complete response atomically
    Review-->>UI: Display responses in the original discussions
    User->>UI: Resolve the discussion or add another reply
```

## Important behavior

- The browser does not provide selected text, context, or hashes; the server
  reads them itself.
- Repeated pending requests return the oldest batch until a complete response
  has been accepted.
- A response with a missing, duplicate, or invalid item changes no discussion.
- A `fixed` result does not resolve a discussion automatically.
- Neither the UI nor the CLI starts an agent or modifies Git.

## Related documents

- [UC-REVIEW-01](../use-cases/UC-REVIEW-01.md)
- [MOD-REVIEW](../modules/MOD-REVIEW.md)
- [Keeping comments attached](../architecture/review-anchoring.md)
- [CLI contract](../contracts/cli.md)
