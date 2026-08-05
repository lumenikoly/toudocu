# FLOW-TASK-WORKFLOW: Working with the task being checked

- Identifier: FLOW-TASK-WORKFLOW
- Scenario: UC-TASK-01, UC-TASK-02, UC-TASK-03
- Module: MOD-CLI
- Last updated: 2026-07-28

The scheme links contract preparation, read-only context acquisition, and explicit
launching checks.

## Process

```mermaid
flowchart TD
    Search["docu-docu search QUERY"] --> Init["docu-docu task init"]
    Init --> Fill["The agent selects entities and fills out the contract"]
    Fill --> Ready["docu-docu task ready TASK-ID"]
    Ready --> Complete{"Is the contract complete?"}
    Complete -->|No| Fill
    Complete -->|Yes| Status["Agent manually changes Draft to Ready"]
    Status --> Context["docu-docu task context TASK-ID"]
    Context --> Find["Find exactly one problem"]
    Find --> Found{"Has the problem been clearly found?"}
    Found -->|No| ContextError["Return code 1 without running commands"]
    Found -->|Yes| Slice["Collect task, connections, restrictions and diagnostics"]
    Slice --> Plan["Plan and execute changes outside of Docu-docu"]
    Plan --> DryRun["Explicitly call task verify --dry-run"]
    DryRun --> Check["After checking the plan, call task verify --run"]
    Check --> Gate["Apply task-local validation gate"]
    Gate --> Valid{"Is the task contract correct?"}
    Valid -->|No| Blocked["Return status blocked without running commands"]
    Valid -->|Yes| Commands["Collect unique teams AC, ALL and DOCS"]
    Commands --> Run["Execute commands sequentially from repository root"]
    Run --> Results["Link results to acceptance criteria"]
    Results --> Passed{"Are all checks successful?"}
    Passed -->|Yes| Success["Return status passed and code 0"]
    Passed -->|No| Failed["Return status failed and code 1"]
```

## Process boundaries

- `task context` never executes system commands.
- `task ready` never changes status or Markdown.
- `task verify --dry-run` never executes commands.
- `task verify --run` only runs explicitly trusted commands after
  local validation gate.
- Only the agent interprets the request, creates semantic connections and confirms
  criteria.
- An error in one command does not stop the others; timeout terminates the tree
  processes.

## Related documents

- [UC-TASK-01: Get work task context](../use-cases/task-workflow.md)
- [UC-TASK-02: Perform work task checks](../use-cases/task-verify.md)
- [UC-TASK-03: Prepare a new work task](../use-cases/UC-TASK-03.md)
- [MOD-CLI: CLI and workflow tasks](../modules/cli.md)
- [Work Task Guide](../guides/work-items.md)
- [CLI contract](../contracts/cli.md)
