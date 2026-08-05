# FLOW-DOCS-BUILD: Building a standalone portal

- Identifier: FLOW-DOCS-BUILD
- Script: UC-DOCS-01
- Module: MOD-SITE
- Last updated: 2026-07-28

The diagram visualizes the pipeline of the `build` command. Result requirements, exit
codes and safe clearing defines
[UC-DOCS-01](../use-cases/build-portal.md), not a diagram.

## Process

```mermaid
flowchart TD
    Start["docu-docu build"] --> Resolve["Normalize input, output and repository root"]
    Resolve --> Safe{"Are the paths safe?"}
    Safe -->|No| Reject["Reject operation without deleting and writing"]
    Safe -->|Yes| Read["Read Markdown and local assets"]
    Read --> Model["Build and test a design model"]
    Model --> Generate["Create HTML, search, assets and report.json"]
    Generate --> Result{"Are there any errors or strict warnings?"}
    Result -->|Yes| Failed["Save the portal with diagnostics and return code 1"]
    Result -->|No| Ready["Report the path to index.html and return code 0"]
    Ready --> Open["Open portal via file://"]
```

## Process boundaries

- Unsafe `--output` or `--clean` is blocked until files are modified.
- Model errors remain available in the generated portal and `report.json`.
- The original Markdown is not modified.

## Related documents

- [UC-DOCS-01: Create an offline portal](../use-cases/build-portal.md)
- [MOD-SITE: Static portal](../modules/site.md)
- [MOD-MODEL: Design model and validation](../modules/model.md)
- [CLI contract](../contracts/cli.md)
