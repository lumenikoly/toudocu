# UC-DOCS-02: Check documentation

- Identifier: UC-DOCS-02
- Status: Completed
- Actor: Developer or CI process
- Module: MOD-MODEL
- Priority: High
- Last updated: 2026-07-31

The developer or CI process checks the documentation contract without generating
site and without executing work task commands.

## Inputs

- documentation catalogue;
- repository root;
- optional `--strict` mode;
- result format `text` or `json`.

## Preconditions

- Docu-docu is available for launch;
- the initiator has the rights to read documentation and repository root.

## Main scenario

1. The initiator calls `docu-docu check ./docs`.
2. Docu-docu reads Markdown files and builds an associated project model.
3. Docu-docu checks mandatory architecture map, detailed questions
   architectural documents, structure, ID, links, roadmap, standards,
   runbooks, custom manifests and work tasks.
4. Docu-docu displays diagnostics in text form or returns
   `ProjectReport` at `--format json`.
5. The initiator uses the exit code and the report to accept the result of the check.

## Error scenarios

- in step 2, inaccessible input directory or invalid repository root fails
  command with code `1`;
- errors in structure, links or connections are included in the report and give the code `1` in any
  mode;
- without `--strict` warnings remain in the report, but do not change the successful exit
  code;
- with `--strict` any warning also results in the code `1`;
- `--stale-days 0` disables only age-based overdue runbook; absent,
  an incorrect or future review date remains a review-required warning;
- an error in reading a single file is reflected in diagnostics with the path to the document.
- missing or incorrect architecture overview type, missing question,
  indirect map and unsafe architectural link are errors of the usual
  mode.

## Postconditions

The source documents have not been modified, the site has not been created, the work task commands have not been
completed. Each diagnostic contains a stable code and, when possible, a path
and line number.

## Business rules

The rules are defined in the documents of the corresponding modules:

- [BR-MODEL-001](../modules/model.md#br-model-001-roadmap-is-the-only-source-of-global-coverage) - roadmap is the only source of global coverage.
- [BR-MODEL-002](../modules/model.md#br-model-002-links-do-not-go-beyond-repository-root) - links do not go beyond the repository root.
- [BR-MODEL-003](../modules/model.md#br-model-003-a-ready-to-run-task-has-a-full-verifiable-contract) - a task ready for work has a full verifiable contract.
- [BR-MODEL-005](../modules/model.md#br-model-005-overview-is-a-direct-map-of-architectural-issues) - overview directly lists each architectural issue.
- [BR-CLI-002](../modules/cli.md#br-cli-002-checks-are-only-run-explicitly) - task checks are launched only explicitly.

## Implementation

- [FLOW-DOCS-CHECK: Documentation contract check](../flows/FLOW-DOCS-CHECK.md)
- [Design Model and Validation](../modules/model.md)
- [CLI and workflow tasks](../modules/cli.md)
- [Validation Rules](../guides/testing.md)

## Examination

- positive fixtures of full and minimal models;
- negative tests of rules of structure, links and connections;
- separate test that `check` does not call the command runner;
- checking the difference between normal and strict modes.
