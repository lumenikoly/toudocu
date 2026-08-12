# TASK-REVIEW-001: Discuss local changes with a development agent

- Status: Done
- Type: Feature
- Priority: High
- Module: MOD-AGENT-FEEDBACK
- Use case: UC-AGENT-FEEDBACK-01
- Screens: SC-SITE-DOCUMENT, SC-CHANGES-WORKSPACE
- Transitions: TR-SITE-007
- Standards: STD-GO-001, STD-DOCS-001
- Last updated: 2026-08-12

## Outcome

The canonical Changes workspace shows a repository-wide diff, while the Portal
opens discussions beside a document. Threads survive restarts and deliver new
comments to the installed skill through the version 1 command-line contract.
Toudocu neither starts an agent nor changes Git.

## Behavior change

### Before

Changes showed documentation roots only and did not store comments. A local
review result could not be passed to a development agent.

### After

The existing screen provides a repository-wide view, durable comment anchors,
discussions, and an agent delivery queue. An agent response is stored beside
the discussion. The ordinary `changes` command, public Go facade, static
portal, and translations retain their previous behavior.

## Scope

- discussion services, HTTP API, CLI, and local state in `internal/app/`;
- the Changes interface and assets generated from `web/`;
- the responsive discussion panel in the main `serve` Portal;
- the bundled skill;
- OpenAPI, canonical documentation, README, changelog, and dependency notices;
- Go, TypeScript, and browser tests.

## Out of scope

- separate top-level Review, Feedback, Code, or Files tabs;
- starting an agent, contacting an external AI model or API, or applying fixes
  automatically;
- Git writes, a remote review service, or repository-hosted discussion files;
- changes to `ChangeSetReport` schema v1 or the public `api.go` facade;
- discussions in static portals and translations;
- reading or updating translation roots.

## Acceptance criteria

- [x] `AC-01` Changes still shows the repository for a supported range, while
  discussions accept only current canonical Markdown and do not depend on the
  Git range.
- [x] `AC-02` Version 1 storage survives restarts and `HEAD` changes, uses an
  inter-process lock, expected-revision checks, atomic replacement, and safe
  permissions, and never overwrites corrupt state.
- [x] `AC-03` A `document` target validates a safe path, one-based lines, and
  Unicode character columns. The server extracts selected text and bounded
  context from current Markdown.
- [x] `AC-04` A discussion supports creating a thread, replying, editing or
  deleting a pending message, closing, reopening, deleting any thread, and
  cleaning old state. A message cannot be edited after the agent retrieves it.
- [x] `AC-05` Messages retrieved by the agent and queue entries are immutable
  and processed in arrival order. The command cannot advance before a response,
  returns the same delivery after lease expiry, and treats an identical repeated
  response as idempotent.
- [x] `AC-06` The discussion HTTP API follows OpenAPI, accepts JSON, an exact
  action, and the expected revision and digest, and returns stable statuses and
  diagnostics.
- [x] `AC-07` `toudocu agent next|respond` discovers the repository from the
  current directory or an option. An empty queue returns `pending=false` and
  exit code `0`, while an invalid response leaves state unchanged.
- [x] `AC-08` An anchor relocates through the defined reproducible order or is
  explicitly marked stale or deleted.
- [x] `AC-09` The screen preserves existing Changes views and adds changed and
  related files, clear comment entry points, a responsive discussion panel, a
  watcher notice, and correct focus order.
- [x] `AC-10` The bundled skill handles “Process requests from Toudocu,”
  rereads current sources, does not change documentation for `question`, and
  limits `change_request` changes to documentation.
- [x] `AC-11` `ChangeSetReport`, ordinary `changes`, the public Go facade,
  static manifest, and translation behavior remain unchanged.
- [x] `AC-12` On a document page, selection including headings and repeated
  text offers text copying, context copying, and a message form. The panel on
  the same tab manages drafts, thread state, deletion, the queue, and prompt
  copying.

## Plan

- [x] Implement the repository view and discussion storage.
- [x] Add discussions, the delivery queue, responses, cleanup, and anchor
  relocation.
- [x] Connect the CLI, local HTTP API, and OpenAPI.
- [x] Extend Changes and CodeMirror language support.
- [x] Add discussion entry through selection on a document page.
- [x] Update the bundled skill and canonical documentation without reading
  translations.

## Verification

- `AC-01` → `go test ./internal/app -run 'TestRepositoryReview'`
- `AC-02` → `go test ./internal/app -run 'TestAgentFeedbackFIFOReanchorPersistenceAndConcurrency'`
- `AC-03` → `go test ./internal/app -run 'TestAgentFeedbackSelectsRepeatedTextByOccurrence'`
- `AC-04` → `go test ./internal/app -run 'TestAgentFeedbackLifecycle'`
- `AC-05` → `go test ./internal/app -run 'TestAgentFeedback(Lifecycle|FIFOReanchorPersistenceAndConcurrency)'`
- `AC-06` → `go test ./internal/app -run 'TestAgentHTTPAndCLI|TestOpenAPIContractParity'`
- `AC-07` → `go test ./internal/app -run 'TestAgentHTTPAndCLI'`
- `AC-08` → `go test ./internal/app -run 'TestAgentFeedbackFIFOReanchorPersistenceAndConcurrency'`
- `AC-09` → `npm --prefix web test && make browser-test`
- `AC-10` → `go test ./internal/app -run 'TestToudocuAgentFeedbackContract'`
- `AC-11` → `go test ./internal/app -run 'TestStaticSiteExcludesEditor|TestTranslation|TestChangesCLI'`
- `AC-12` → `TR-SITE-007` → `Portal and Changes share documentation discussions with the agent CLI`
- `AC-12` → `npm --prefix web run test:browser -- --grep 'Portal and Changes share documentation discussions'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

## Documentation impact

The earlier implementation added MOD-REVIEW, UC-REVIEW-01,
FLOW-REVIEW-FEEDBACK, `architecture/review-anchoring.md`, ADR-007, and the
discussion OpenAPI contract. MOD-AGENT-FEEDBACK later replaced them. The
Changes screen, architecture boundaries, Changes and CLI contracts,
references, guides, roadmap, changelog, and dependency notices were updated.
Generated browser files still come only from `web/`.

## Current state

A message has `question` or `change_request` intent. Saving immediately creates
a durable `AgentDelivery`, and the message remains editable until the agent
retrieves it. Copy prompt immediately copies “Process requests from Toudocu.”
without changing state. The agent separately runs `toudocu agent next|respond`.
On a document page, a question can start from selected content; the responsive
panel on the same page shows responses and manages messages, thread state, and
deletion without a trip to Changes.
