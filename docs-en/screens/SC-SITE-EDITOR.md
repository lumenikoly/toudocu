# SC-SITE-EDITOR: Editor

- Identifier: SC-SITE-EDITOR
- Type: Screen
- Module: MOD-SITE
- Status: Implemented
- Preview: `../assets/screens/site-editor.png`
- Last updated: 2026-08-06

The source-documentation workspace in `serve` mode: file selection, preview,
diagnostics, creation, and protected saving.

The editor's exact route is `/_docu-docu/editor/`.

## Shell and states

The shared workspace header shows project branding, links to the portal, Editor,
and Changes, marks Editor as active through `aria-current`, and provides
appearance and color-scheme controls. The current path, mobile file button,
source, create, and save actions are in the context panel below the header.

Changing `classic`/`paper`/`terminal` or `system`/`light`/`dark` applies
immediately and persists across the other surfaces. It does not recreate
CodeMirror or lose the selection, undo history, or dirty buffer. On narrow
screens the tree opens in a local panel, and the page gains no horizontal scroll.

## Transitions

| ID | Use case | Action | Condition | Result | Type |
|---|---|---|---|---|---|
| TR-SITE-003 | UC-DOCS-03 | Return to the portal | Always | SC-SITE-HOME | return |
