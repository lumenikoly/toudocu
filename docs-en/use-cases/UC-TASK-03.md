<!-- toudocu
id: UC-TASK-03
status: done
priority: high
module: MOD-CLI
updated: 2026-08-12
-->

# UC-TASK-03: Prepare a new work item


The assignee finds related documents, creates a semantically neutral task
scaffold, and completes it until it can be moved manually to Ready.

## Inputs

- user request;
- documentation root;
- area, title, and work-item type;
- optional scaffold language.

<!-- toudocu:section prerequisites -->
## Preconditions

- Toudocu is available and the documentation root exists;
- the assignee has interpreted the request and selected genuinely related
  entities.

<!-- toudocu:section main-scenario -->
## Main flow

1. The assignee runs `toudocu search <query> ./docs` and reads the relevant
   source documents.
2. They create a draft through `toudocu task init`, explicitly supplying the
   area, title, and type.
3. If the work truly needs new documents, they create only those selected
   scaffolds through `toudocu scaffold`.
4. In the `TASK-*`, they write the scope, exclusions, behavior change,
   constraints, `AC-*` criteria, plan, verification commands, and documentation
   impact.
5. `toudocu task ready TASK-ID ./docs` checks completeness without changing the
   file. A complete draft returns `contract_ready`.
6. The assignee reviews meaning and feasibility, then changes status to Ready
   manually.
7. A repeated `task ready` returns `ready`.

## Error flows

- An invalid type, language, identifier, or result limit returns exit code `1`.
- An existing target file is never overwritten.
- An incomplete contract returns `contract_incomplete` with the missing parts.
- An error in related documentation blocks readiness.
- A status other than Draft or Ready returns `invalid_state`.

<!-- toudocu:section postconditions -->
## Postconditions

The scaffold contains no relationships or requirements invented by Toudocu.
Only the assignee selects documents, writes semantic fields, and changes status.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] The scaffold contains no relationships or requirements invented by
  Toudocu.
- [x] Only the assignee selects documents, writes semantic fields, and changes
  task status.

<!-- toudocu:section business-rules -->
## Business rules

- [BR-CLI-004](../modules/cli.md#br-cli-004-toudocu-does-not-interpret-user-request)
- [BR-MODEL-003](../modules/model.md#br-model-003-a-ready-to-run-task-has-a-full-verifiable-contract)

<!-- toudocu:section implementation -->
## Implementation

- [FLOW-TASK-WORKFLOW](../flows/FLOW-TASK-WORKFLOW.md)
- [ADR-002](../decisions/ADR-002.md)
- [CLI contract](../contracts/cli.md)

## Scenario verification

Coverage includes search and query normalization, safe file creation and ID
allocation, and the `contract_incomplete`, `contract_ready`, and `ready`
results.
