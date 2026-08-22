<!-- toudocu
id: TASK-SITE-001
status: done
taskType: feature
priority: medium
module: MOD-SITE
useCase: UC-DOCS-01
updated: 2026-08-10
-->

# TASK-SITE-001: Add document context copying


<!-- toudocu:section result -->
## Result

On a source Markdown page, the user can copy the title and repository-relative
path in one action and send the exact context to an AI agent.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

The portal could copy code blocks but offered no concise reference to the open
source document.

<!-- toudocu:section after -->
### After

Regular document pages, use-case pages, and the `index.md` dashboard provide a
Copy context button. It writes two lines:

```text
Document: <title>
Path: <path from repository root>
```

<!-- toudocu:section scope -->
## Scope

- `internal/app/site.go`;
- `internal/app/process_site.go`;
- `internal/app/assets/app.js`;
- `internal/app/assets/style.css`;
- portal generation tests in `internal/app/`;
- source documentation of the module and feature catalog.

<!-- toudocu:section out-of-scope -->
## Out of scope

- copying the full contents of the document;
- button on catalogues, Screen Map, traceability and health page;
- change CLI, Go API or `report.json` schema v1;
- new dependencies.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` Regular document, use case and dashboard copy the title and
  repository-relative path in a consistent two-line format.
- [x] `AC-02` Directories and service pages do not receive a context button.
- [x] `AC-03` Copying uses the Clipboard API with a built-in fallback, reports
  the result, and is keyboard-accessible.
- [x] `AC-04` Path does not reveal the absolute location of the document; outside
  `repository-root` uses the secure `SourcePath`.

<!-- toudocu:section plan -->
## Plan

- [x] Add secure context calculation and HTML button.
- [x] Connect the button to all source-backed pages of the selected coverage.
- [x] Implement browser copy, states and adaptive styles.
- [x] Update documentation and tests.
- [x] Run a full verification cycle and rebuild the monitored portal.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `go test ./... -run 'TestGenerateSite|TestDocumentContext'`
- `AC-02` → `go test ./... -run 'TestDocumentContext'`
- `AC-03` → `go test ./... -run 'TestDocumentContext'`
- `AC-04` → `go test ./... -run 'TestDocumentContext'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root .`

<!-- toudocu:section documentation-impact -->
## Documentation impact

Updated [MOD-SITE](../modules/site.md) and the
[feature catalog](../reference/features.md).
