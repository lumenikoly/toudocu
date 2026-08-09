# TASK-SITE-001: Add document context copying

- Status: Completed
- Type: Feature
- Priority: Medium
- Module: MOD-SITE
- Use case: UC-DOCS-01
- Owner: Toudocu Team
- Last updated: 2026-07-30

## Result

On the pages of source Markdown documents, the user can, in one action
copy the name and repository-relative path to convey the exact context
agent.

## Behavior change

### Before

The portal allowed you to copy blocks of code, but did not provide a short link to
the original document of the open page.

### After

Regular document pages, canonical use case pages and main dashboard
for `index.md` contain a “Copy context” button. Two are written to the buffer
lines:

```text
Документ: <название>
Путь: <путь от repository-root>
```

## Scope

- `internal/app/site.go`;
- `internal/app/process_site.go`;
- `internal/app/assets/app.js`;
- `internal/app/assets/style.css`;
- portal generation tests in `internal/app/`;
- source documentation of the module and feature catalog.

## Out of scope

- copying the full contents of the document;
- button on catalogues, Screen Map, traceability and health page;
- change CLI, Go API or `report.json` schema v1;
- new dependencies.

## Acceptance criteria

- [x] `AC-01` Regular document, use case and dashboard copy the title and
  repository-relative path in a consistent two-line format.
- [x] `AC-02` Directories and service pages do not receive a context button.
- [x] `AC-03` Copying works via Clipboard API and offline fallback for
  `file://`, reports the result and is accessible from the keyboard.
- [x] `AC-04` Path does not reveal the absolute location of the document; outside
  `repository-root` uses the secure `SourcePath`.

## Plan

- [x] Add secure context calculation and HTML button.
- [x] Connect the button to all source-backed pages of the selected coverage.
- [x] Implement browser copy, states and adaptive styles.
- [x] Update documentation and tests.
- [x] Run a full verification cycle and rebuild the monitored portal.

## Verification

- `AC-01` → `go test ./... -run 'TestGenerateSite|TestDocumentContext'`
- `AC-02` → `go test ./... -run 'TestDocumentContext'`
- `AC-03` → `go test ./... -run 'TestDocumentContext'`
- `AC-04` → `go test ./... -run 'TestDocumentContext'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root .`

## Documentation impact

[описание модуля](../modules/site.md) and
[каталог возможностей](../reference/features.md). Tracked Portal
rebuilt from the original Markdown after verification is complete.