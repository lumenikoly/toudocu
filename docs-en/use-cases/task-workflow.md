# UC-TASK-01: Collect work-item context

- Identifier: UC-TASK-01
- Status: Completed
- Actor: Developer or software agent
- Module: MOD-CLI
- Priority: High
- Last updated: 2026-08-12

Before changing code or documentation, the assignee retrieves a bounded context
for one ready work item.

## Inputs

- stable `TASK-*` identifier;
- documentation root;
- repository root;
- `text` or `json` output.

## Preconditions

- Toudocu is available;
- the assignee can read the documentation and repository.

## Main flow

1. The assignee runs:

   ```bash
   toudocu task context TASK-ID ./docs --format json
   ```

2. Toudocu finds exactly one work item with that identifier.
3. Its status must be Ready, In progress, Blocked, or Done.
4. The report contains the complete task contract, required sections from
   explicitly related documents, declared documentation impact, business rules,
   and diagnostics.
5. `TaskContextReport` schema v1 lists `requiredReads`: the files the assignee
   must actually read before working.
6. The assignee plans changes within the task's goal, scope, constraints, and
   exclusions.

## Error flows

- A missing identifier or several work items with the same identifier returns
  code `1`.
- Draft and Cancelled are not valid implementation context.
- Problems in related documents remain in `issues` so the assignee sees them
  before work starts.
- A project read failure ends the command before context is created.

## Postconditions

The assignee has the selected task context. Files are unchanged and no command
from Verification has run.

## Acceptance criteria

- [x] The assignee receives context for exactly one selected work item.
- [x] Collecting context leaves files unchanged and runs no command from
  Verification.

## Business rules

- [BR-CLI-001](../modules/cli.md#br-cli-001-task-context-does-not-execute-commands)

## Implementation

- [FLOW-TASK-WORKFLOW](../flows/FLOW-TASK-WORKFLOW.md)
- [CLI and work-item operations](../modules/cli.md)
- [Project model](../modules/model.md)
- [CLI contract](../contracts/cli.md)
- [Work-item guide](../guides/work-items.md)

## Scenario verification

Coverage includes JSON composition, missing and duplicate identifiers, related
rules and documents, and the guarantee that no commands run.
