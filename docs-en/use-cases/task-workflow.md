# UC-TASK-01: Get work task context

- Identifier: UC-TASK-01
- Status: Completed
- Actor: Performer - developer or software agent
- Module: MOD-CLI
- Priority: High
- Last updated: 2026-07-28

The performer receives a limited context of one work task before
changing code or documentation.

## Inputs

- stable `TASK-*` ID;
- documentation catalogue;
- repository root;
- result format `text` or `json`.

## Preconditions

- Docu-docu is available for launch;
- the performer has the rights to read the documentation and the repository.

## Main scenario

1. The performer calls
   `docu-docu task context TASK-ID ./docs --format json`.
2. Docu-docu finds exactly one task with the specified ID.
3. Docu-docu checks that the task status is Ready, In Progress, Blocked or
   Done.
4. Docu-docu collects a complete task contract, fixed sections of related
   entities, documentation-impact documents, business rules and diagnostics.
5. Docu-docu returns `TaskContextReport` schema v1 with `requiredReads`.
6. The performer uses the result, scope of changes and limitations of the task
   for planning work.

## Error scenarios

- in step 2, the missing ID terminates the command with the code `1`;
- multiple tasks with the same ID make the request ambiguous and terminate
  command with code `1`;
- Draft and Canceled are not allowed to receive implementation context;
- related documentation issues remain in the `issues` report and are accessible
  to the contractor before the start of work;
- an error reading the project terminates the command before the context is formed.

## Postconditions

The performer received the context of the selected task. The source files are not modified,
commands from the `Проверка` section were not executed.

## Business rules

The rules are defined in the module document:

- [BR-CLI-001](../modules/cli.md#br-cli-001-task-context-does-not-execute-commands) - the task context does not execute commands.

## Implementation

- [FLOW-TASK-WORKFLOW: Working with the task being checked](../flows/FLOW-TASK-WORKFLOW.md)
- [CLI and workflow tasks](../modules/cli.md)
- [Design Model and Validation](../modules/model.md)
- [CLI contract](../contracts/cli.md)
- [Work Task Guide](../guides/work-items.md)

## Examination

- JSON test of the `TaskContextReport` composition;
- test for missing and ambiguous `TASK-*`;
- checking related rules, dependencies and documents;
- separate test for lack of command execution.
