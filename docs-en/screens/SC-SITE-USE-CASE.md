<!-- toudocu
id: SC-SITE-USE-CASE
status: done
screenKind: page
module: MOD-SITE
preview: ../assets/screens/site-use-case.png
updated: 2026-08-12
-->

# SC-SITE-USE-CASE: Use-case page


A single page for a selected `UC-*`, with its description, map, playback, and
relationships. The URL depends on the generated use case and is not declared as
a separate route pattern.

## Transitions

<!-- toudocu:table transitions columns=id,useCase,action,condition,target,kind -->
| ID | Use case | Action | Condition | Result | Type |
|---|---|---|---|---|---|
| TR-SITE-004 | UC-DOCS-04 | Show the global map | Always | SC-SITE-SCREEN-MAP | navigation |
