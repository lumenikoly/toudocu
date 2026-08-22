<!-- toudocu
version: 1
id: TASK-CHANGES-002
status: done
taskType: feature
priority: normal
module: MOD-CHANGES
useCase: UC-AGENT-FEEDBACK-01
screens: SC-CHANGES-WORKSPACE
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-12
-->

# TASK-CHANGES-002: Simplify the Changes workspace


<!-- toudocu:section result -->
## Outcome

After this task, Changes opened the first matching diff automatically. The main
workspace kept the file list, search, status, and discussions; Git range
settings and diagnostics moved into controls that open only when needed.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

Until a file was selected, Git settings, metrics, and extra filters occupied
most of the workspace, while the diff was hidden behind a Summary tab.

<!-- toudocu:section after -->
### After

The first matching file and its diff open automatically. Git range settings and
diagnostics live in compact disclosure panels. On desktop, tablet, and phone,
individual panels scroll without forcing the whole page to scroll sideways.

<!-- toudocu:section scope -->
## Scope

- `internal/site/` — workspace HTML and template tests;
- `web/src/` and `web/tests/` — interface, responsive layout, and browser tests;
- `internal/site/assets/generated/` — output built from `web/`;
- `docs/screens/SC-CHANGES-WORKSPACE.md`, this task, and `CHANGELOG.md`.

<!-- toudocu:section out-of-scope -->
## Out of scope

- the Go facade, `ChangeSetReport`, discussion data structures, HTTP API, and
  agent handoff;
- a full Toudocu redesign or changes to `DESIGN.md`;
- static portal and translation features.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` The header combines the title, Git range disclosure, file
  summary, and discussion status. The range closes after apply, on `Esc`, and
  on an outside click, then restores focus to its button.
- [x] `AC-02` The file panel contains only search and status, sorts by path, and
  separates Changed from Related files without repeating the file name.
- [x] `AC-03` The first matching file opens automatically. The URL, live
  updates, and filters keep file and tab selection consistent.
- [x] `AC-04` The Summary tab is removed. Diagnostics appear only when present
  and open automatically for an error.
- [x] `AC-05` Other documentation views, the diff-view switch, copy action,
  file and range comments, discussions, and agent handoff retain their
  behavior.
- [x] `AC-06` Large screens use a split workspace; on tablet and phone, side
  panels do not create horizontal page scrolling and support focus and `Esc`.
- [x] `AC-07` Canonical documentation and generated browser assets match the
  implementation.

<!-- toudocu:section plan -->
## Plan

- [x] Simplify the template and remove unnecessary state branches and filters.
- [x] Add automatic file selection, disclosure panels, and responsive layout.
- [x] Update unit and browser regression tests.
- [x] Update documentation and rebuild browser assets.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `go test ./internal/site && npm --prefix web run test:browser`
- `AC-02` → `go test ./internal/site && npm --prefix web run typecheck`
- `AC-03` → `npm --prefix web run test:browser`
- `AC-04` → `npm --prefix web run test:browser`
- `AC-05` → `npm --prefix web run test:browser`
- `AC-06` → `npm --prefix web run test:browser`
- `AC-07` → `npm --prefix web test && go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `ALL` → `go test ./... && npm --prefix web test && make browser-test`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `go vet ./... && go mod verify && npm --prefix web run typecheck`

<!-- toudocu:section documentation-impact -->
## Documentation impact

This task updated `SC-CHANGES-WORKSPACE`, this work item, and the root
`CHANGELOG.md`. It did not change API contracts or architectural documents.

## Later changes

The current interface has moved beyond this historical task:

- the main tab is now Diff;
- full UTF-8 file viewing and a file-kind filter were added;
- questions and change requests apply only to canonical documentation;
- saving immediately creates a queue entry that remains editable until the
  agent retrieves it, while Copy prompt neither changes state nor starts an
  agent.

The current user journey is documented in
[SC-CHANGES-WORKSPACE](../screens/SC-CHANGES-WORKSPACE.md) and
[UC-AGENT-FEEDBACK-01](../use-cases/UC-AGENT-FEEDBACK-01.md).
