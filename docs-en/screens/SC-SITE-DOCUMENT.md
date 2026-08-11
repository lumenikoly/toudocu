# SC-SITE-DOCUMENT: Document Page

- Identifier: SC-SITE-DOCUMENT
- Type: Page
- Module: MOD-SITE
- Status: Implemented
- Preview: `../assets/screens/site-document.png`
- Last updated: 2026-08-10

This is the ordinary page for one Markdown document. Its URL comes from the
source path, so this document does not declare one shared route pattern.

For `risks.md`, the page adds a summary of open risks and completed
mitigations; risk state remains separate from individual mitigation checkboxes.
For `roadmap.md`, the main `serve` portal adds a dialog that can create one
unfinished `DLV-*` in an existing stage. Static and translation portals do not
include that dialog.
