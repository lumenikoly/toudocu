# SC-SITE-USE-CASE: Use-Case Workspace

- Identifier: SC-SITE-USE-CASE
- Type: Page
- Module: MOD-SITE
- Status: Implemented
- Last updated: 2026-08-05

A single page for a selected `UC-*`, with its description, map, playback, and
relationships. The URL depends on the generated use case and is not declared as
a separate route pattern.

## Transitions

| ID | Use case | Action | Condition | Result | Type |
|---|---|---|---|---|---|
| TR-SITE-004 | UC-DOCS-04 | Show the global map | Always | SC-SITE-SCREEN-MAP | navigation |
