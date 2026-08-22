<!-- toudocu
version: 1
id: TASK-CLI-002
status: done
taskType: feature
priority: high
module: MOD-CLI
useCase: UC-TASK-01
flow: FLOW-TASK-WORKFLOW
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-21
-->

# TASK-CLI-002: Add hierarchical decomposition for work items

<!-- toudocu:section result -->
## Result

Toudocu represents large work as a verifiable `TASK-*` tree while retaining a
separate dependency graph, a bounded context for each work item, and the
existing behavior of projects without decomposition.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

A work item could declare only dependencies. A coordinating item and its
independent parts could not be linked through a separate relationship, viewed
as a tree, or checked in one aggregated change report.

<!-- toudocu:section after -->
### After

A child `TASK-*` can declare one parent through `Parent` or its localized
equivalent. The Go model derives children, validates the hierarchy and combined
completion graph, applies lifecycle rules, and gives commands and the portal
bounded decomposition data. The parent relationship neither orders execution
nor replaces `Dependencies`.

<!-- toudocu:section scope -->
## Scope

- public models and the facade in `api.go`;
- parsing, validation, lifecycle, task context, task tree, task initialization,
  and task changes in `internal/app/`;
- localized portal labels in `internal/site/i18n/`;
- canonical contracts, guides, model, process, and references in `docs/`;
- agent guidance in `skills/toudocu/`;
- Go behavioral and regression tests.

<!-- toudocu:section out-of-scope -->
## Out of scope

- decomposition of `BUG-*` or a `Parent` relationship involving `BUG-*`;
- epics, sprints, milestones, assignees, estimates, story points, and kanban;
- automatic semantic splitting of a request or automatic status changes;
- recursive `task verify --run` execution or any new implicit command path;
- a separate task database or synchronization with external issue trackers.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` `TASK-*` accepts one optional `Parent` field and normalizes it
  to `parentId`.
- [x] `AC-02` The model derives `childIds` only from child `Parent` values and
  does not require a source `Children` field.
- [x] `AC-03` Validation emits stable diagnostics for an invalid, unknown, or
  self-referencing parent; unsupported types; and hierarchy cycles.
- [x] `AC-04` `Parent` describes decomposition and `Dependencies` describes
  completion order; neither relationship is inferred from the other.
- [x] `AC-05` The combined completion graph detects deadlocks created by a
  combination of `Parent` and `Dependencies`.
- [x] `AC-06` A done parent is valid only when every direct child is done. A
  cancelled child is not complete, and a cancelled parent leaves no active
  children.
- [x] `AC-07` JSON and text context contain compact ancestor and direct-child
  references with statuses, blocker presence, and descendant summaries, not
  complete subtree documents.
- [x] `AC-08` The read-only `task tree` command returns a nested tree in text
  and a version-1 `TaskTreeReport` in JSON, without accessing Git or running a
  command.
- [x] `AC-09` `task init --parent` validates the `TASK-*` identifier and
  creates a draft with `Parent`, without overwriting a file or creating
  dependencies or children.
- [x] `AC-10` `task changes --tree` is available only for `TASK-*`, aggregates
  all descendants, preserves `declaredBy`, and separates task artifacts;
  ordinary `task changes` keeps the prior selected-task isolation.
- [x] `AC-11` `task verify` runs checks only for the selected work item and
  does not run child verification.
- [x] `AC-12` Version-1 `ProjectReport` additively returns `parentId` and
  derived `childIds`, including `null` for a root and an empty list for a leaf.
- [x] `AC-13` The static portal and `serve` show linked parent, children, and
  a breadcrumb from the shared Go model.
- [x] `AC-14` Parent and children resolve across active and archived `work/**`;
  moving one work item does not move its subtree.
- [x] `AC-15` Repositories without `Parent`, and the existing semantics of
  dependencies, lifecycle, archive, restore, verification, and ordinary
  changes, work without migration.
- [x] `AC-16` New rules and CLI formats have behavioral tests, including deep
  trees, siblings, cross-tree dependencies, lifecycle, archive, bounded
  context, Changes, and both portal forms.
- [x] `AC-17` `task tree`, `task context`, `task ready`, and
  `task changes --tree` do not create implicit shell-command execution paths.
- [x] `AC-18` The embedded skill proposes decomposition by independently
  verifiable outcomes and uses the parent as a coordinating contract rather
  than mechanically splitting work into code, tests, and documentation.

<!-- toudocu:section plan -->
## Plan

- [x] Add `Parent` to parsing and the public model; derive children.
- [x] Implement tree validation, lifecycle, and the combined completion graph.
- [x] Add `task init`, `task tree`, and bounded hierarchy to task context.
- [x] Add aggregated task changes while preserving ordinary behavior.
- [x] Show decomposition in the static portal and `serve`.
- [x] Synchronize canonical documentation and the embedded skill.
- [x] Restrict `task changes --tree` to `TASK-*` trees.
- [x] Extend text context with all compact hierarchy fields.
- [x] Correct the optional task-tree workflow branch and close regressions.
- [x] Run the complete verification cycle.
- [x] Obtain an independent semantic review of the work item and final diff.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `go test ./internal/app -run 'TestTaskHierarchyBuildsComputedChildrenAndCompatibleJSON|TestTaskHierarchyDiagnostics'`
- `AC-02` → `go test ./internal/app -run TestTaskHierarchyBuildsComputedChildrenAndCompatibleJSON`
- `AC-03` → `go test ./internal/app -run TestTaskHierarchyDiagnostics`
- `AC-04` → `go test ./internal/app -run TestTaskHierarchyAllowsDependencyAcrossTrees`
- `AC-05` → `go test ./internal/app -run TestTaskHierarchyDiagnostics`
- `AC-06` → `go test ./internal/app -run TestTaskHierarchyLifecycle`
- `AC-07` → `go test ./internal/app -run 'TestTaskTreeContextAndPortalUseSharedHierarchy|TestTaskContextTextHierarchy'`
- `AC-08` → `go test ./internal/app -run TestTaskTreeContextAndPortalUseSharedHierarchy`
- `AC-09` → `go test ./internal/app -run TestTaskInitWithParent`
- `AC-10` → `go test ./internal/app -run 'TestTaskChangesTreeAggregatesDescendantsAndOwnership|TestTaskChangesTreeRejectsBugs|TestTaskChangesIgnoresUnrelatedDuplicateTaskIDs'`
- `AC-11` → `go test ./internal/app -run TestTaskVerifyDoesNotRunChildCommands`
- `AC-12` → `go test ./internal/app -run TestTaskHierarchyBuildsComputedChildrenAndCompatibleJSON`
- `AC-13` → `go test ./internal/app -run TestTaskTreeContextAndPortalUseSharedHierarchy`
- `AC-14` → `go test ./internal/app -run TestTaskHierarchyIncludesArchivedDoneChild`
- `AC-15` → `go test ./...`
- `AC-16` → `go test ./... && go test -race ./...`
- `AC-17` → `go test ./internal/app -run 'TestTaskVerifyDoesNotRunChildCommands|TestTaskTreeContextAndPortalUseSharedHierarchy'`
- `AC-18` → `go test ./skills`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section documentation-impact -->
## Documentation impact

- `docs/contracts/cli.md` — commands, options, and JSON reports;
- `docs/flows/FLOW-TASK-WORKFLOW.md` — task preparation, review, and
  execution;
- `docs/guides/work-items.md` — `Parent`, `Dependencies`, and decomposition
  guidance;
- `docs/modules/cli.md` — boundaries of task commands;
- `docs/modules/model.md` — hierarchy and the completion graph in the Go
  model;
- `docs/reference/changes-report.md` — aggregated impact and ownership;
- `docs/reference/document-model.md` — normalized work-item fields;
- `docs/reference/features.md` — available commands;
- `docs/use-cases/task-workflow.md` — bounded context and tree review.
