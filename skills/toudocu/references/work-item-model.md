# Toudocu work-item model

Use this reference only for `TASK-*` or `BUG-*` contracts and lifecycle work.
Apply the general [document model](document-model.md),
[reader-first writing gate](writing-quality.md), and
[semantic gate](semantic-gate.md) first when the operation changes sources.

Use one work item per `work/TASK-*.md` or `work/BUG-*.md`. Work items are
intentionally stricter because their commands may be executed.

If substantial work no longer fits one compact, independently verifiable work
item, decompose it into `TASK-*` items by observable outcomes. Do not split it
mechanically into backend, frontend, tests, and docs unless each is itself an
independent outcome. Code, tests, and documentation belong to the outcome they
verify.

A child may declare exactly one canonical `parentTask`. Parent means
decomposition; Dependencies means execution and completion ordering. Never
merge or infer either relation from the other. Children are computed from
Parent, so do not add a source `Children` field.

Use a large parent as a coordination contract for the overall result,
boundaries, shared constraints, integration acceptance criteria, and final
documentation consistency. Do not duplicate each child's detailed acceptance
criteria in the parent.

Before creating a task tree, design the complete decomposition and dependency
graph. Create the root parent first because `task init --parent` requires an
existing parent. Then create descendants so every parent exists before its
children and every declared dependency receives an earlier ID than its
dependent; when tasks can run in parallel, preserve their order in the agreed
plan. For a dependency across branches, create the prerequisite branch first.
This allocation makes the natural ID order used by `task tree` and the portal
match execution as closely as the hierarchy permits. Still declare every real
`dependsOn` relation explicitly: ID order never creates a dependency.

For canonical status `draft`, require `id`, `status`, `taskType`, and a
non-empty `result` section.

For every non-draft status, also require:

- an existing module;
- Scope;
- Out of scope;
- Acceptance criteria;
- Plan;
- Verification;
- Documentation impact.

Feature tasks require an existing use case. Maintenance, Documentation, and
Research tasks without a use case require a non-empty Use-case omission reason.

Bug work items use `BUG-*` and require severity, priority, reproducibility,
regression, module, use case, and updated date. They require Symptom,
Expected behavior, Actual behavior, and either Steps to reproduce or Evidence
even in Draft. Ready+ bugs additionally require Cause, Scope, Out of scope,
numbered Plan, Acceptance criteria, Verification,
and Documentation impact. A technical bug may set Use case to Not applicable
only with a non-empty Relationship to user behavior section.

Tasks may declare optional canonical `flow`, `screens`, and `transitions`
fields. `flow` references an existing `FLOW-*`.
It adds the flow document to task context but does not replace the use case or
acceptance criteria. `Screens` and `Transitions` may reference existing `SC-*`
and `TR-*`; task context then includes selected screen records, incident
transitions, and matching screen documents.

Checkboxes are allowed in both acceptance criteria and plan. Start every
acceptance criterion with one unique `AC-*` and cover it with a verification
command. One entry may list several criteria; a criterion may use several checks
when they verify different aspects. Write each criterion as an observable result
in the document language; do not substitute an internal field, event, or method name for the behavior being
accepted. Add the exact token only when the verification contract needs it.
Plan items may be numbered steps, bullets, or checkboxes and need no `AC-*`
identifiers or verification entries. Bug plans are the exception: they use
numbered steps without checkboxes, so a bug keeps checkboxes only in acceptance
criteria.

```md
<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [ ] `AC-01` An invalid token is rejected.

<!-- toudocu:section verification -->
## Verification

- `AC-01` -> `pnpm test -- --run InvalidToken`
```

Completed tasks require all criteria checked and completed dependencies.
`ALL`, `DOCS`, and `QUALITY` are optional labels for checks the task actually
needs; neither completion nor linked standards makes these labels mandatory.
Blocked tasks require a Blocker section; cancelled tasks require a Cancellation
reason.

A Done parent requires every immediate child to be Done; Cancelled does not
count as completed. A Cancelled parent may have only Done or Cancelled children.
Parent cycles and cycles in the combined Parent-plus-Dependencies completion
graph are invalid. Resolve Parent and computed children across active and
archived `work/**`.

Use `task tree` for a decomposition overview, `task candidates` for the active
Draft/Ready work front, and `task context` for one bounded work item. Add
`--parent TASK-ID` to candidates when only descendants of one decomposition
root are relevant. Candidate readiness reuses `task ready`; a Ready candidate
is executable only when its contract is complete and every dependency is Done.
Use the returned `workState` instead of reclassifying status, contract, and
dependencies. A `ready_candidate` is a complete Draft, not executable work.
Use returned `descendants` only as branch progress: active or Done descendants
never make their parent ready or executable. Context includes compact ancestors,
parent, direct children, and the same descendant summary, never the full
contents of the subtree. `task verify --run`
remains local to the selected task. Use `task changes --tree` only when the user
needs aggregated documentation impact for the entire subtree.

The portal renders a parent task's current subtree recursively and labels every
node with its computed work state. Do not copy that computed hierarchy into the
parent Markdown or add a source `Children` field.

Tasks may explicitly list project standards and affected operational
procedures through canonical metadata keys `standards` and `runbooks`. Task context includes those
`STD-*` and `RB-*` records and documents without matching scope globs
automatically.
Follow applicable standards, but do not duplicate their checks under `QUALITY`
when the selected commands already cover them.

Keep active tasks in `work/`. Only Done and Cancelled tasks belong under
`work/archive/YYYY/`; malformed archive paths and nonterminal archived tasks are
errors. IDs and dependencies are global across active and archived tasks, and
task-number allocation scans both locations.

Treat code spans in Scope as repository-relative paths. Each path or glob must
exist and remain inside `--repository-root`.

## Keep verification proportional

Record the smallest set of commands that establishes the acceptance outcomes.
For example, `AC-01, AC-02, AC-03, AC-04 -> pnpm test -- AuthProvider AuthRouting`
can cover four criteria in one entry when those tests actually check all four.
A verification entry is evidence mapping, not a requirement for a new test.
Reuse existing coverage; add or extend tests only for an uncovered behavior or
material regression risk. For a bug, choose a check that detects the defect.
A separate regression criterion, test file, or Regression test section is not
mandatory; a simple fix may reuse an existing check. Manual evidence can
supplement it as prose, not as a shell command. The typed Ready/Done contract
still requires a real verification command for every criterion, even when
`task verify` is not used.

Do not list both a full suite and its subsets merely to fill target labels.
Run a covering suite once; rerun only after a change, failure, or unresolved
concern. Exact duplicate commands are deduplicated by the runner, but it cannot
infer that different commands overlap. Never add dummy commands to satisfy the
schema. Respect a user's prohibition on running tests: list intended checks and
state that they were not run.

Do not add `TR-* -> command` entries or tests to silence navigation diagnostics.
Screen transitions do not each require test coverage. When explicit transition
traceability is useful, use the supported `AC-01 -> TR-AREA-001 -> reference`
relationship alongside the criterion's executable check, reusing its evidence.
