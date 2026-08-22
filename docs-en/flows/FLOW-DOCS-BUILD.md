<!-- toudocu
id: FLOW-DOCS-BUILD
module: MOD-SITE
useCase: UC-DOCS-01
updated: 2026-08-10
-->

# FLOW-DOCS-BUILD: Building a Static HTTP Portal

- Scenario: UC-DOCS-01

The diagram follows `build` from the command to a directory that can be
published on ordinary HTTP hosting. Exact options and exit codes are defined in
[UC-DOCS-01](../use-cases/build-portal.md).

## Process

```mermaid
flowchart TD
    Start["toudocu build"] --> Resolve["Normalize input, output and repository root"]
    Resolve --> Safe{"Are the paths safe?"}
    Safe -->|No| Reject["Reject the operation without deleting or writing"]
    Safe -->|Yes| Read["Read Markdown and local assets"]
    Read --> Model["Build and validate the project model"]
    Model --> Generate["Create HTML, static JSON, assets and report.json"]
    Generate --> Result{"Are there errors or strict warnings?"}
    Result -->|Yes| Failed["Preserve the portal with diagnostics and return code 1"]
    Result -->|No| Ready["Report the path to index.html and return code 0"]
    Ready --> Publish["Publish output on HTTP(S) static hosting"]
    Publish --> Open["Open the portal at the root or a nested URL path"]
```

## Important behavior

- An unsafe `--output` or `--clean` is blocked before any file is changed.
- Model errors remain available in the generated portal and `report.json`.
- Source Markdown is not modified.
- A Go backend is not required after the build; the frontend loads only its own
  relative resources from output.

## Related documents

- [UC-DOCS-01: Create a static HTTP portal](../use-cases/build-portal.md)
- [MOD-SITE: Static portal](../modules/site.md)
- [MOD-MODEL: Project model and validation](../modules/model.md)
- [CLI contract](../contracts/cli.md)
