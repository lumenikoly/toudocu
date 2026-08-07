# SC-SITE-DOCUMENT: Document Page

- Identifier: SC-SITE-DOCUMENT
- Type: Page
- Module: MOD-SITE
- Status: Implemented
- Preview: `../assets/screens/site-document.png`
- Last updated: 2026-08-06

The canonical portal representation of a selected Markdown document. The
document and generated output determine the exact URL, so no shared route
pattern is deliberately declared here. For `risks.md`, the page also presents
a clear text summary of statuses, the open count, and mitigation progress;
risk statuses and mitigation checklists are displayed separately.
For `roadmap.md`, canonical `serve` also adds an accessible dialog for creating
one unfinished `DLV-*` in an existing stage. The dialog is a state of this page,
not a separate screen or navigation transition; static and locale views do not
contain it.
