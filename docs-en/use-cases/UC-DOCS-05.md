# UC-DOCS-05: View documentation changes

- Identifier: UC-DOCS-05
- Status: Completed
- Actor: Developer
- Module: MOD-CHANGES
- Priority: High
- Last updated: 2026-08-03

The developer considers changes to the source documentation in terms of Git,
rendered pages and design entities before completing the task.

## Inputs

- documentation root;
- explicit base and target or default mode `HEAD → working-tree`;
- optional filters and associated task.

## Preconditions

- Git is installed and documentation root is inside the local repository;
- selected revisions are already available locally.

## Main scenario

1. The developer opens `/changes` or runs `docu-docu changes`.
2. Docu-docu resolves and shows base/target without changing Git.
3. The user receives a summary of permanent and work artifacts.
4. The user filters documents and opens source, rendered, semantic or
   specialized diff.
5. For a task, the user compares the declared documentation impact with
   actual changes.

## Alternative scenarios

- Without Git, the portal continues to work, and the changes section explains the limitation.
- A parsing error on one side leaves the source diff available.
- Large or binary file shows metadata and diagnostic without crashing the report.
- When changing the working tree, the current change set becomes stale and is replaced
  new one, preserving the applicable filters.

## Postconditions

- Git repository has not been changed;
- the person and CI receive the same versioned change report;
- task impact warnings remain an observation and not an automatic solution.

## Business rules

- [BR-CHANGES-001](../modules/MOD-CHANGES.md#br-changes-001-git-is-the-only-version-source)
- [BR-CHANGES-002](../modules/MOD-CHANGES.md#br-changes-002-original-diff-takes-precedence)
- [BR-CHANGES-003](../modules/MOD-CHANGES.md#br-changes-003-range-is-always-explicit)
- [BR-CHANGES-004](../modules/MOD-CHANGES.md#br-changes-004-analysis-limited-to-documentation-roots)

## Implementation

- [Documentation changes](../modules/MOD-CHANGES.md)
- [FLOW-DOCS-CHANGES](../flows/FLOW-DOCS-CHANGES.md)
