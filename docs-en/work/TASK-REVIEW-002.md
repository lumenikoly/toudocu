<!-- toudocu
version: 1
id: TASK-REVIEW-002
status: done
taskType: feature
priority: high
module: MOD-AGENT-FEEDBACK
useCase: UC-AGENT-FEEDBACK-01
screens: SC-CHANGES-WORKSPACE
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-13
-->

# TASK-REVIEW-002: Discussions for any changed file


<!-- toudocu:section result -->
## Result

A developer can start a discussion about any regular file in the current
working Git diff. For available text, the discussion stores an exact range;
for binary, large, and deleted files, it stores a whole-file target.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

Changes allowed discussions only for Markdown in canonical documentation.

<!-- toudocu:section after -->
### After

Changes allows discussions for every regular file in the working tree. Index
and revision comparisons remain read-only. The Portal continues to use the
`document` target.

<!-- toudocu:section scope -->
## Scope

- the queue, HTTP API, and safe-path checks in `internal/app/`;
- the Changes screen and browser sources in `web/`;
- OpenAPI, the built-in skill, and canonical documentation;
- Go, TypeScript, and browser tests.

<!-- toudocu:section out-of-scope -->
## Out of scope

- arbitrary unchanged files and global comments;
- directories, symbolic links, `.git`, and paths outside the repository;
- discussions in the static portal and translation roots;
- a new JSON or storage version.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` A `file` target is accepted only for a regular file in the
  working diff; a deleted file retains the `deleted` state, and an existing
  thread can continue after the file disappears.
- [x] `AC-02` A range is allowed only for available UTF-8 text up to 2 MiB;
  binary and large files use whole-file discussions.
- [x] `AC-03` A question does not permit changes; a `change_request` for
  `file` accepts related safe repository paths, while `document` remains
  limited to canonical documentation.
- [x] `AC-04` Changes shows the file discussion button independently of text
  loading, preserves a new-side range and an old-side quote, creates no target
  from a mixed selection, and disables discussions outside the working tree.
- [x] `AC-05` OpenAPI, the built-in skill, and documentation describe the
  actual `file` target boundary without changing version 1.

<!-- toudocu:section plan -->
## Plan

- [x] Extend the queue model and checks.
- [x] Update Changes and browser scenarios.
- [x] Update the contract, skill, and documentation.
- [x] Run checks and complete the work item.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `go test ./internal/app -run 'TestAgentFeedback(FileTargets|DeletedFile)'`
- `AC-02` → `go test ./internal/app -run 'TestAgentFeedbackFileTargets'`
- `AC-03` → `go test ./internal/app -run 'TestAgentFeedback(Lifecycle|FileTargets)'`
- `AC-04` → `npm --prefix web run test:browser -- --grep 'Portal and Changes share documentation discussions'`
- `AC-05` → `go test ./internal/app -run 'TestOpenAPIContractParity|TestToudocuAgentFeedbackContract'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

<!-- toudocu:section documentation-impact -->
## Documentation impact

The delivery architecture, module, use case, Changes screen, OpenAPI, API and
feature references, README, and `CHANGELOG.md` are updated. Translation roots
are not read or changed by the implementation task.
