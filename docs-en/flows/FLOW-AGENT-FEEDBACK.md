# FLOW-AGENT-FEEDBACK: Process the local documentation queue

- Identifier: FLOW-AGENT-FEEDBACK
- Scenario: UC-AGENT-FEEDBACK-01
- Module: MOD-AGENT-FEEDBACK
- Last updated: 2026-08-12

## Process

```mermaid
sequenceDiagram
    actor Human as Developer
    participant UI as Portal or Changes
    participant Core as Server
    participant Store as Local store
    participant Agent as Development agent with the Toudocu skill
    participant Files as Current files

    Human->>UI: Open the shared discussions panel
    alt A current canonical document is available
        Human->>UI: Create a question or reply in an existing thread
    else No current canonical document is available
        Human->>UI: Reply in an existing thread
    end
    opt A message was entered
        UI->>Core: Save the request
        Core->>Store: Atomically store the message and pending delivery
        opt The agent has not received the request yet
            Human->>UI: Edit or delete the request
            UI->>Core: Update the pending message
            Core->>Store: Atomically update the message or delete it with its delivery
        end
    end
    Human->>Agent: Process requests from Toudocu
    loop While pending deliveries remain
        Agent->>Core: toudocu agent next --json
        Core->>Store: Lease the oldest delivery
        Core-->>Agent: Discussion, intent, anchor, and HEAD
        Agent->>Files: Reread the document and gather evidence
        opt The change request is confirmed
            Agent->>Files: Update canonical Markdown and verify it
        end
        Agent->>Core: toudocu agent respond
        Core->>Store: Append the response and complete the delivery
        Core-->>UI: Response in the original discussion
    end
    Human->>UI: Close the thread or send a follow-up
```

## Important conditions

- `question` never grants permission to change documentation.
- `change_request` requires validation of the user's claim.
- A message can be edited only while its delivery is `pending`; retrieval through
  `agent next` and message updates are atomic with respect to each other.
- After a retry, the agent rereads the files because the previous attempt may
  have changed a document partially.
- An agent response does not close a discussion and is not a source of truth for
  the current documentation state.
- The panel shows every project thread on every page of the main `serve`, but a
  new thread can be created only when a current canonical document is available.
- An old line from a modified document is stored as a visible quote in the
  message with an ordinary document anchor; no new anchor type is introduced.

## Related documents

- [UC-AGENT-FEEDBACK-01](../use-cases/UC-AGENT-FEEDBACK-01.md)
- [Request delivery](../architecture/agent-feedback-delivery.md)
- [Agent feedback JSON](../reference/agent-feedback-json.md)
