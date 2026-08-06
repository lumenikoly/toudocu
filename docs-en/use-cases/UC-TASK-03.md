# UC-TASK-03: Prepare a new work task

- Identifier: UC-TASK-03
- Status: Completed
- Actor: Performer - developer or software agent
- Module: MOD-CLI
- Priority: High
- Last updated: 2026-07-29

The performer finds relevant documents, creates a neutral framework for the task, and
brings her contract to a state suitable for manual translation to Ready.

## Inputs

- user request;
- documentation catalogue;
- area, title and task type;
- optional framework language.

## Preconditions

- Docu-docu is available for launch;
- the documentation directory exists;
- the performer independently interpreted the request and selected the entities.

## Main scenario

1. The executor calls `docu-docu search` and examines the appropriate source documents.
2. The executor calls `docu-docu task init` with explicit area, title and type.
3. If necessary, the executor creates the selected entities via `scaffold`.
4. The performer fills in scope, out of scope, behavior change, criteria,
   plan, verification mappings and documentation impact.
5. The executor calls `docu-docu task ready TASK-ID`.
6. For a full Draft, Docu-docu returns `contract_ready` without changing the Markdown.
7. The contractor checks the meaning of the contract and manually changes the status to Ready.
8. Repeated `task ready` returns `ready`.

## Error scenarios

- invalid type, language, ID or limit terminates the command with the code `1`;
- the existing target file is not overwritten;
- an incomplete contract returns `contract_incomplete`;
- related documentation error blocks readiness;
- status other than Draft or Ready is returned by `invalid_state`.

## Postconditions

The framework is created without fictitious connections or requirements. Performer only
interprets the request, fills in the semantic fields and changes the status of the task.

## Business rules

- [BR-CLI-004](../modules/cli.md#br-cli-004-docu-docu-does-not-interpret-user-request) - Docu-docu does not select entities or change status.
- [BR-MODEL-003](../modules/model.md#br-model-003-a-ready-to-run-task-has-a-full-verifiable-contract) - readiness checks the complete contract.

## Implementation

- [FLOW-TASK-WORKFLOW](../flows/FLOW-TASK-WORKFLOW.md)
- [ADR-002](../decisions/ADR-002.md)
- [CLI contract](../contracts/cli.md)

## Examination

- search ranking and normalization tests;
- atomic create and allocation TASK ID tests;
- readiness tests for Draft and Ready.
