# Toudocu work-item model

Use this reference only for `TASK-*` or `BUG-*` contracts and lifecycle work.
Apply the general [document model](document-model.md),
[reader-first writing gate](writing-quality.md), and
[semantic gate](semantic-gate.md) first when the operation changes sources.

Use one work item per `work/TASK-*.md` or `work/BUG-*.md`. Work items are
intentionally stricter because their commands may be executed.

For the draft state, represented by `Draft` or `Черновик`, require a valid
Status, Type, and non-empty Result.

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
regression, module, use case, owner, and updated date. They require Symptom,
Expected behavior, Actual behavior, and either Steps to reproduce or Evidence
even in Draft. Ready+ bugs additionally require Cause, Scope, Out of scope,
numbered Plan, Acceptance criteria, Verification, regression-test coverage,
and Documentation impact. A technical bug may set Use case to Not applicable
only with a non-empty Relationship to user behavior section.

Tasks may declare an optional `Flow`/`Process` field with an existing `FLOW-*`.
It adds the flow document to task context but does not replace the use case or
acceptance criteria. `Screens` and `Transitions` may reference existing `SC-*`
and `TR-*`; task context then includes selected screen records, incident
transitions, and matching screen documents.

Checkboxes are allowed in both acceptance criteria and plan. Start every
acceptance criterion with one unique `AC-*` and give it exactly one verification
entry. Write each criterion as an observable result in the document language; do
not substitute an internal field, event, or method name for the behavior being
accepted. Add the exact token only when the verification contract needs it.
Plan items may be numbered steps, bullets, or checkboxes and need no `AC-*`
identifiers or verification entries. Bug plans are the exception: they use
numbered steps without checkboxes, so a bug keeps checkboxes only in acceptance
criteria.

```md
## Acceptance criteria

- [ ] `AC-01` An invalid token is rejected.

## Verification

- `AC-01` -> `go test ./internal/auth -run TestInvalidToken`
```

Completed tasks require all criteria checked, plus `ALL` and `DOCS` targets and
completed dependencies. Blocked tasks require a Blocker section; cancelled
tasks require a Cancellation reason.

Tasks may explicitly list project standards and affected operational
procedures through the recognized metadata keys `Standards` or `Стандарты` and
`Affected runbooks` or `Затронутые runbooks`. Task context includes those
`STD-*` and `RB-*` records and documents without matching scope globs
automatically.
When Standards is non-empty, readiness and full verification also require
exactly one `QUALITY` mapping whose command is declared by the task.

Keep active tasks in `work/`. Only Done and Cancelled tasks belong under
`work/archive/YYYY/`; malformed archive paths and nonterminal archived tasks are
errors. IDs and dependencies are global across active and archived tasks, and
task-number allocation scans both locations.

Treat code spans in Scope as repository-relative paths. Each path or glob must
exist and remain inside `--repository-root`.
