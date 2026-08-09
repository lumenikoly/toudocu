# TASK-CHANGES-001: View documentation changes

- Status: Completed
- Type: Feature
- Priority: High
- Module: MOD-CHANGES
- Use case: UC-DOCS-05
- Flow: FLOW-DOCS-CHANGES
- Transitions: TR-SITE-005
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Toudocu Team
- Last updated: 2026-08-05

## Result

`toudocu changes` and the `/changes` section show Git changes to source
documentation as source, rendered, and deterministic semantic diffs, correlate
them with task impact, and export `ChangeSetReport` schema v1.

## Behavior change

### Before

The portal shows only the current state, and review uses an external
`git diff` without project semantics and task impact.

### After

`serve` provides a read-only Changes workspace with an explicit range,
lazy specialized views and live invalidation. CLI and CI
get the same report without changing Git.

## Scope

- public facade `api.go` and `internal/app/cli.go`, `internal/app/types.go`, `internal/app/site_config.go`;
- `internal/app/server.go`, `internal/app/site.go`, `internal/app/screen_site.go`;
- `internal/app/assets/`, `package.json`, `package-lock.json`;
- `go.mod`, `go.sum`, `THIRD_PARTY_NOTICES.md`;
- tests in `internal/app/`;
- `docs/`, `README.md`, `CHANGELOG.md`;
- `project-docs/`, `example/project-docs/` only through rebuilding.

## Out of scope

- changing Git index, history, refs or working tree;
- fetch, checkout, commit, merge, rebase and GitHub PR API;
- inline review comments, approvals and conflict editor;
- AI-generated summaries and documentation correction;
- pixel diff Mermaid or images;
- Git diff source code outside documentation roots.

## Acceptance criteria

- [x] `AC-01` Git adapter supports commit, index and working-tree snapshots,
  staged/unstaged/untracked, rename/copy/type change and Unicode paths without shell,
  external diff, textconv, hooks or fetch.
- [x] `AC-02` `ChangeSetReport` schema v1 contains an explicit resolved comparison,
  digest, file/entity summaries, changes, task impact and diagnostics.
- [x] `AC-03` Unified diff is exactly derived from Git, side-by-side is derived from hunks,
  and large or binary files do not block change set.
- [x] `AC-04` Deterministic semantic diff supports UC, FLOW, SC/TR, MOD,
  ADR, TASK, Architecture and relations, ignoring minor formatting.
- [x] `AC-05` OpenAPI YAML/JSON diff compares operations, requests, responses,
  schemas and security and classifies compatibility.
- [x] `AC-06` Rendered Markdown, Mermaid, Screen Map, and image assets are
  available before and after, with failures on either side isolated.
- [x] `AC-07` Task impact separates task contract from permanent documentation and
  returns declared/actual/scope diagnostics.
- [x] `AC-08` CLI supports summary, file and task reports, filters,
  text/JSON/Markdown/output and exit codes 0–4.
- [x] `AC-09` Read-only HTTP API checks revisions/paths/limits, supports
  lazy detail, ETag and live digest update.
- [x] `AC-10` Changes UI supports comparison selector, filters/search,
  unified/merge/rendered/semantic/specialized tabs, deep links and accessibility.
- [x] `AC-11` `serve` preserves filters and the open file during invalidation,
  while unavailable Git produces a diagnostic without breaking the rest of the
  portal.
- [x] `AC-12` Static `build`, existing `check`, ProjectReport schema v1 and
  editor workflows remain compatible and pass regression tests.

## Plan

- [x] Implement Git snapshots, comparison model and ChangeSetReport.
- [x] Add source, semantic, OpenAPI, task and specialized diff engines.
- [x] Add CLI reports and exit-code mapping.
- [x] Implement changes service, HTTP API, cache and invalidation.
- [x] Implement Changes UI and integration with document/task/screen pages.
- [x] Update documentation, generated portals and run all gates.

## Verification

- `AC-10` → `TR-SITE-005` → `TestServeSiteIncludesEditor`
- `AC-01` → `go test ./... -run 'TestGitChange|TestChangeComparison'`
- `AC-02` → `go test ./... -run 'TestChangeSetReport|TestChangeSetDigest'`
- `AC-03` → `go test ./... -run 'TestSourceDiff|TestSideBySideDiff|TestLargeChange'`
- `AC-04` → `go test ./... -run 'TestSemanticDiff'`
- `AC-05` → `go test ./... -run 'TestOpenAPIDiff'`
- `AC-06` → `go test ./... -run 'TestRenderedChange|TestMermaidChange|TestAssetChange|TestScreenMapChange'`
- `AC-07` → `go test ./... -run 'TestTaskImpact'`
- `AC-08` → `go test ./... -run 'TestChangesCLI'`
- `AC-09` → `go test ./... -run 'TestChangesHTTP'`
- `AC-10` → `go test ./... -run 'TestChangesAssetsContract'`
- `AC-11` → `go test ./... -run 'TestChangesInvalidation|TestChangesWithoutGit'`
- `AC-12` → `go test ./... -run 'TestStaticSiteExcludesChanges|TestProjectReport'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root .`
- `QUALITY` → `go vet ./... && go test ./... && go test -race ./... && go run ./cmd/toudocu check ./docs --strict --stale-days 0`

## Documentation impact

A module/use case/flow, architecture answer, YAML ADR, changes guide, HTTP/JSON
contracts, and diagnostics reference were added. CLI, serve, task, OpenAPI,
Screen Map, configuration, security, README, and changelog were updated.

- `docs/modules/MOD-CHANGES.md`;
- `docs/use-cases/UC-DOCS-05.md`;
- `docs/flows/FLOW-DOCS-CHANGES.md`;
- `docs/architecture/documentation-changes.md`;
- `docs/architecture/overview.md`;
- `docs/architecture/runtime-components.md`;
- `docs/architecture/trust-boundaries.md`;
- `docs/decisions/ADR-003.md`;
- `docs/decisions/001-dependency-free.md`;
- `docs/contracts/cli.md`;
- `docs/contracts/changes-http.md`;
- `docs/guides/documentation-changes.md`;
- `docs/guides/work-items.md`;
- `docs/guides/screens.md`;
- `docs/reference/changes-report.md`;
- `docs/reference/configuration.md`;
- `docs/reference/features.md`;
- `README.md`;
- `CHANGELOG.md`.
