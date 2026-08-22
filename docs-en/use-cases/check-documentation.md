<!-- toudocu
version: 1
id: UC-DOCS-02
status: done
priority: high
module: MOD-MODEL
updated: 2026-08-12
-->

# UC-DOCS-02: Check documentation


A developer or CI checks documentation structure and relationships without
building the portal or running commands from work items.

## Inputs

- documentation root;
- repository root;
- optional `--strict` mode;
- `text` or `json` output.

<!-- toudocu:section prerequisites -->
## Preconditions

- Toudocu is available;
- the caller can read the documentation and allowed repository files.

<!-- toudocu:section main-scenario -->
## Main flow

1. The caller runs `toudocu check ./docs`.
2. Toudocu reads Markdown and builds the connected project model.
3. It checks the required architecture overview, questions in other
   architecture documents, structure, identifiers, links, roadmap, standards,
   runbooks, custom sections, and work items.
4. The default output is readable text. `--format json` returns
   `ProjectReport` schema v1.
5. The caller evaluates the exit code together with report diagnostics.

## Error flows

- An inaccessible root or invalid repository root returns code `1`.
- A structure, link, or relationship error appears in the report and always
  returns code `1`.
- Without `--strict`, warnings remain visible but do not change a successful
  code. With `--strict`, every warning also returns code `1`.
- `--stale-days 0` disables only age-based runbook warnings. A missing,
  invalid, or future verification date still requires review.
- A file read failure keeps the affected path in its diagnostic.
- A missing or invalid `architecture/overview.md`, an architecture document
  without a question, an indirect map, or an unsafe link is an error.

<!-- toudocu:section postconditions -->
## Postconditions

Sources are unchanged, no portal was created, and no Verification command was
run. Every diagnostic has a stable code and, when available, a path, line, and
column.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] A check does not change sources, create a portal, or run a Verification
  command.
- [x] Every diagnostic has a stable code and, when available, a path, line, and
  column.
- [x] A completed `UC-*` without fully checked acceptance criteria or a
  mismatched roadmap produces an error and exit code `1` without changing
  Markdown.

<!-- toudocu:section business-rules -->
## Business rules

- [BR-MODEL-001](../modules/model.md#br-model-001-roadmap-is-the-only-source-of-global-coverage)
- [BR-MODEL-002](../modules/model.md#br-model-002-links-do-not-go-beyond-repository-root)
- [BR-MODEL-003](../modules/model.md#br-model-003-a-ready-to-run-task-has-a-full-verifiable-contract)
- [BR-MODEL-005](../modules/model.md#br-model-005-overview-is-a-direct-map-of-architectural-issues)
- [BR-CLI-002](../modules/cli.md#br-cli-002-checks-are-only-run-explicitly)

<!-- toudocu:section implementation -->
## Implementation

- [FLOW-DOCS-CHECK](../flows/FLOW-DOCS-CHECK.md)
- [Project model](../modules/model.md)
- [CLI and work-item operations](../modules/cli.md)
- [Verification rules](../guides/testing.md)

## Scenario verification

Coverage includes complete and minimal models, structure and relationship
errors, normal versus strict mode, and the guarantee that `check` does not run
work-item commands.
