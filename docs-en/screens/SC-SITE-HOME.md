# SC-SITE-HOME: Portal Home

- Identifier: SC-SITE-HOME
- Type: Page
- Module: MOD-SITE
- Status: Implemented
- Route: `/`
- Preview: `../assets/screens/site-home.png`
- Last updated: 2026-08-08

The main entry point to the built documentation is presented as a project
passport: a cover with title, description, and metadata is followed by one
status line, three to five recommended routes, and the complete, permanently
visible `index.md` overview. The status line selects its destination in this
order: `status.md` → nearest deliverable document → work catalog → risks. The
cover description is not repeated in the overview, while context actions and
serve actions sit in its header. The home page links to documents, the local
editor, the changes viewer, and the HTTP API. In canonical `serve`, a compact,
non-blocking suggestion to open a newer official Toudocu release may appear
below the header; it can be dismissed for that version.

## Transitions

| ID | Use case | Action | Condition | Result | Type |
|---|---|---|---|---|---|
| TR-SITE-001 | UC-DOCS-03 | Open a document | A document is selected | SC-SITE-DOCUMENT | navigation |
| TR-SITE-002 | UC-DOCS-03 | Open the editor | The portal is running through serve | SC-SITE-EDITOR | navigation |
| TR-SITE-005 | UC-DOCS-05 | Open changes | The portal is running through serve | SC-CHANGES-WORKSPACE | navigation |
| TR-SITE-006 | UC-DOCS-03 | Open the HTTP API | The canonical portal is running through serve | SC-SITE-API-DOCS | navigation |
