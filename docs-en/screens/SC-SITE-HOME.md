# SC-SITE-HOME: Portal Home

- Identifier: SC-SITE-HOME
- Type: Page
- Module: MOD-SITE
- Status: Implemented
- Route: `/`
- Last updated: 2026-08-05

The main entry point to the built documentation: it shows project status and
links to documents, the local editor, the changes viewer, and the HTTP API.

## Transitions

| ID | Use case | Action | Condition | Result | Type |
|---|---|---|---|---|---|
| TR-SITE-001 | UC-DOCS-03 | Open a document | A document is selected | SC-SITE-DOCUMENT | navigation |
| TR-SITE-002 | UC-DOCS-03 | Open the editor | The portal is running through serve | SC-SITE-EDITOR | navigation |
| TR-SITE-005 | UC-DOCS-05 | Open changes | The portal is running through serve | SC-CHANGES-WORKSPACE | navigation |
| TR-SITE-006 | UC-DOCS-03 | Open the HTTP API | The canonical portal is running through serve | SC-SITE-API-DOCS | navigation |
