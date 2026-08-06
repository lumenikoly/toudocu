# FLOW-DOCS-CHECK: Documentation contract check

- Identifier: FLOW-DOCS-CHECK
- Script: UC-DOCS-02
- Module: MOD-MODEL
- Last updated: 2026-07-28

The diagram shows a read-only documentation check. Full set of rules and
determines the conditions for successful completion
[UC-DOCS-02](../use-cases/check-documentation.md).

## Process

```mermaid
flowchart TD
    Start["docu-docu check"] --> Resolve["Check login and repository root"]
    Resolve --> Read["Read Markdown without following symlinks"]
    Read --> Parse["Parse structure, metadata, links and Mermaid"]
    Parse --> Validate["Check ID, connections, roadmap and work items"]
    Validate --> Report["Generate diagnostics or ProjectReport"]
    Report --> Errors{"Are there any errors?"}
    Errors -->|Yes| Failed["Return code 1"]
    Errors -->|No| Strict{"Is strict enabled and there are warnings?"}
    Strict -->|Yes| Failed
    Strict -->|No| Passed["Return code 0"]
```

## Process boundaries

- The team does not create the site and does not change the source documents.
- Commands from the `Проверка` sections of work tasks are not executed.
- In normal mode, warnings are included in the report, but do not change the successful exit
  code.

## Related documents

- [UC-DOCS-02: Check documentation](../use-cases/check-documentation.md)
- [MOD-MODEL: Design model and validation](../modules/model.md)
- [MOD-CLI: CLI and workflow tasks](../modules/cli.md)
- [Validation Rules](../guides/testing.md)
