# UC-DOCS-05: View documentation changes

- Identifier: UC-DOCS-05
- Status: Completed
- Actor: Developer
- Module: MOD-CHANGES
- Priority: High
- Screens: SC-SITE-HOME, SC-CHANGES-WORKSPACE
- Start screen: SC-SITE-HOME
- Terminal screens: SC-CHANGES-WORKSPACE
- Last updated: 2026-08-12

Before finishing work, a developer can see which files changed, how the text
changed, and what those edits mean for the documentation model.

## Inputs

- documentation root;
- explicit start and end states, or default `HEAD → working-tree`;
- optional filters, assets, complete translation input, or related work item.

## Preconditions

- Git is installed and the documentation root is inside a local repository;
- selected commits or refs already exist locally.

## Main flow

1. For the browser journey, the developer runs `toudocu serve ./docs` and opens
   `/changes/`. For a terminal report, they run `toudocu changes ./docs`.
2. By default, Toudocu compares `HEAD` with the whole working tree, including
   staged and unstaged edits, deletions, and new files. Another range must be
   chosen explicitly.
3. In the browser, the developer sees file and line counts and can filter by
   name, status, scope, and kind: all files, documentation, or other repository
   files.
4. They choose a file from Changed or a manually related file from Related.
5. Diff shows the exact Git patch. Full file shows the current UTF-8 file or the
   last version of a deleted file. Documentation may also provide Before and
   after, Semantics, Relationships, OpenAPI, Mermaid, asset, or screen-map
   views.
6. For a related `TASK-*`, the developer separately runs
   `toudocu task changes <ID> ./docs` and compares declared documentation impact
   with the real Git diff. A warning requires review but is not proof of an
   error.

## Alternative flows

- If Git is unavailable, the rest of the portal keeps working and Changes
  explains the limitation.
- If one document version cannot be parsed, the exact Git patch remains
  available and only the optional view receives the error.
- A binary or oversized file shows known metadata and a clear diagnostic
  instead of attempted text rendering.
- When the working tree changes, the page receives a new report and preserves
  applicable filters when possible.

## Postconditions

- Git state is unchanged.
- Browser, CLI, and CI consume the same versioned report.
- Task-impact warnings remain prompts for human review, not automatic
  decisions.

## Acceptance criteria

- [x] Viewing changes leaves Git state unchanged.
- [x] Browser, CLI, and CI consume the same versioned report.
- [x] A task-impact warning does not make the decision for the reviewer.

## Business rules

- [BR-CHANGES-001](../modules/MOD-CHANGES.md#br-changes-001-git-is-the-only-version-source)
- [BR-CHANGES-002](../modules/MOD-CHANGES.md#br-changes-002-original-diff-takes-precedence)
- [BR-CHANGES-003](../modules/MOD-CHANGES.md#br-changes-003-range-is-always-explicit)
- [BR-CHANGES-004](../modules/MOD-CHANGES.md#br-changes-004-public-reports-are-limited-to-documentation-roots)

## Implementation

- [MOD-CHANGES](../modules/MOD-CHANGES.md)
- [FLOW-DOCS-CHANGES](../flows/FLOW-DOCS-CHANGES.md)
