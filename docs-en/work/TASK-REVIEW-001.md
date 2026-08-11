# TASK-REVIEW-001: Discuss local changes with an AI agent

- Status: Done
- Type: Feature
- Priority: High
- Module: MOD-REVIEW
- Use case: UC-REVIEW-01
- Screens: SC-CHANGES-WORKSPACE
- Standards: STD-GO-001, STD-DOCS-001
- Last updated: 2026-08-10

## Outcome

The canonical Changes workspace shows a repository-wide diff, keeps discussion
threads across runs, and passes new comments to an installed AI skill through
CLI schema v1. Toudocu does not start the agent or modify Git.

## Behavior change

### Before

Changes displayed documentation roots only and did not store comments. A local
review could not be handed to an AI agent.

### After

The existing workspace covers the whole repository, stores durable comment
anchors and discussions, and queues immutable batches for an agent. Agent
answers are saved beside the original discussion. The regular `changes`
command, public Go facade, static portal, and translations keep their previous
behavior.

## Scope

- repository view, discussion storage, HTTP API, and CLI in `internal/app/`;
- the Changes interface and browser assets generated from `web/`;
- the bundled skill;
- OpenAPI, canonical documentation, README, changelog, and dependency notices;
- Go, TypeScript, and browser tests.

## Out of scope

- separate top-level Review, Feedback, Code, or Files tabs;
- starting an agent, contacting an external AI model or API, or applying fixes
  automatically;
- Git writes, a remote review service, or repository-hosted discussion files;
- changes to `ChangeSetReport` schema v1 or the public `api.go` facade;
- discussions in static portals or translations;
- reading or updating translation roots.

## Acceptance criteria

- [x] `AC-01` The repository view includes tracked files and new non-ignored
  files for every supported comparison. Writes are allowed only when the end
  state is `working-tree`.
- [x] `AC-02` Schema-v1 storage survives restarts and `HEAD` changes, uses an
  inter-process lock, compare-and-swap, atomic replacement, and safe file
  permissions, and never overwrites corrupt state.
- [x] `AC-03` `diff`, `fileRange`, `file`, and `global` targets validate safe
  paths and Unicode coordinates. Go reads the selected text and context and
  stores a snapshot only for commented content up to 2 MiB.
- [x] `AC-04` A discussion can be created, replied to, resolved, reopened, and
  cleaned up. An unsent message can be edited or deleted; a sent message is
  immutable.
- [x] `AC-05` Agent batches are immutable and delivered in order. Until a full
  response is stored atomically, the CLI returns the oldest batch again. A
  response contains exactly one result for every message.
- [x] `AC-06` The discussion HTTP API follows OpenAPI, accepts JSON, a precise
  action, and expected version and hash values, and returns stable statuses and
  diagnostics.
- [x] `AC-07` `changes feedback pending|respond` discovers the repository from
  the current directory or an option. An empty queue returns schema v1 and exit
  code `0`; a response is fully validated before any write.
- [x] `AC-08` Anchors relocate through the documented deterministic order or
  become explicitly `stale` or `deleted`.
- [x] `AC-09` The workspace keeps existing Changes views, adds changed and
  related files, clear comment entry points, a responsive discussion panel,
  live-update notice, and correct focus order.
- [x] `AC-10` The bundled skill handles `$toudocu feedback`, validates targets,
  changes only justified files, runs relevant commands, and submits one
  complete response.
- [x] `AC-11` `ChangeSetReport`, regular `changes`, the public Go facade, static
  manifest, and translation behavior remain unchanged.

## Plan

- [x] Implement the repository view and discussion storage.
- [x] Add discussions, batch queueing, responses, cleanup, and anchor
  relocation.
- [x] Connect the CLI, local HTTP API, and OpenAPI contract.
- [x] Extend Changes and CodeMirror language support.
- [x] Update the skill and canonical documentation without reading
  translations.

## Verification

- `AC-01` → `go test ./internal/app -run 'TestRepositoryReview'`
- `AC-02` → `go test ./internal/app -run 'TestReview(Store|CAS|Conflict|Cleanup)'`
- `AC-03` → `go test ./internal/app -run 'TestReview(Unsafe|StoreDiscussion)'`
- `AC-04` → `go test ./internal/app -run 'TestReview(StoreDiscussion|Cleanup)'`
- `AC-05` → `go test ./internal/app -run 'TestReviewStoreDiscussionFeedbackResponseAndReanchor'`
- `AC-06` → `go test ./internal/app -run 'TestReviewHTTPAndCLI|TestOpenAPIContract'`
- `AC-07` → `go test ./internal/app -run 'TestReviewHTTPAndCLI'`
- `AC-08` → `go test ./internal/app -run 'TestReviewStoreDiscussionFeedbackResponseAndReanchor'`
- `AC-09` → `npm --prefix web test && make browser-test`
- `AC-10` → `go test ./internal/app -run 'TestToudocuFeedbackContract'`
- `AC-11` → `go test ./internal/app -run 'TestStaticSiteExcludesChanges|TestTranslation|TestChangesCLI'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

## Documentation impact

This task added MOD-REVIEW, UC-REVIEW-01, FLOW-REVIEW-FEEDBACK,
`architecture/review-anchoring.md`, ADR-007, and the OpenAPI discussion
contract. It updated the Changes screen, architectural boundaries, Changes and
CLI contracts, references, guides, roadmap, changelog, and dependency notices.
Generated browser files still come only from `web/`.

## Current behavior

Comments now contain text only; there is no selectable type. “Send to agent”
creates a pending batch and displays “Process comments from Toudocu Changes,”
but does not start an AI agent. The agent must separately run `$toudocu
feedback` or the corresponding CLI commands.
