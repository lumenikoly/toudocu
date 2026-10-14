# Work-item contracts and lifecycle

Load only when authoring/reviewing a `TASK-*`/`BUG-*` contract or changing its
lifecycle, not for a context map. One work item per `work/*.md`; apply the
writing/semantic gates for mutations. Tasks are stricter because their checks
may execute trusted repository code.

## Contract

- Draft: canonical `id`, `status`, `taskType`, nonempty `result`.
- Full Ready+ contract: existing module, scope, exclusions, observable `AC-*`
  acceptance criteria, plan, verification and documentation impact. Feature
  tasks require an existing use case and Before/After behavior change.
- Maintenance/Documentation/Research without a use case require a nonempty
  Use-case omission reason. `flow` references an existing `FLOW-*` and never
  replaces a use case; optional screens/transitions reference existing `SC-*`/`TR-*`.
- Bug uses `BUG-*`: severity, priority, reproducibility, regression, module,
  use case and updated date; even Draft needs symptom, expected/actual behavior
  and reproduction steps or evidence. Ready+ also needs cause, scope/exclusions,
  numbered plan, criteria, verification and documentation impact. Unknown cause
  stays explicit. A technical bug may omit a use case only with a nonempty
  Relationship to user behavior section.
- Each criterion starts with a unique `AC-*` and has a real command mapping.
  One command may cover multiple criteria; multiple checks may cover distinct
  aspects. Plan bullets/checkboxes need no IDs or checks; bug plans are numbered,
  without checkboxes. Write outcomes, not unexplained internal tokens.
- Done: all criteria checked and dependencies Done. Blocked: nonempty blocker;
  Cancelled: nonempty cancellation reason. `ALL`, `DOCS`, `QUALITY` are optional
  labels, not completion requirements or reasons to duplicate commands.
- Scope code spans are repository-relative safe paths/globs. Validate within
  `--repository-root`; a new file needs a safe existing parent, a glob matches.

## Decomposition

Split substantial work into independently verifiable outcomes, not mechanical
backend/frontend/tests/docs slices. Parent coordinates overall scope, shared
constraints and integration acceptance; do not copy children's detailed criteria.
Exactly one canonical `parentTask` means decomposition; `dependsOn` independently
means ordering. Children are computed, never stored in a source Children field.

Design the whole tree/dependency graph before allocation. Create root/parents
before children, each prerequisite before its dependent (earlier ID), prerequisite
branches first, and preserve agreed order for parallel work. Still explicitly
record every dependency: IDs never create relations. Resolve IDs globally across
active and archived tasks; parent/dependency and combined completion cycles are
invalid. A Done parent needs all immediate children Done (Cancelled is not Done);
a Cancelled parent has only Done/Cancelled children.

Use candidates/`--parent` to select active Draft/Ready work, tree for hierarchy,
and context for one task. Trust computed `workState` rather than rebuilding it:
`ready_candidate` is a complete Draft, not executable; a Ready task additionally
needs completed dependencies. Descendant summaries are branch progress, not
readiness, and do not change source status. Context has compact hierarchy refs,
not subtree contents. Verification remains task-local; `task changes --tree`
is only for requested aggregated documentation impact.

## Proportional verification

Use the smallest honest command set covering outcomes. Reuse coverage; add tests
only for uncovered behavior/material regression risk. A bug check detects the
same defect; a separate regression criterion/file/section is unnecessary. Manual
evidence supplements prose but cannot masquerade as an executable command.
Never add dummy commands, per-transition tests or overlapping suite/subset runs
to fill labels. Exact duplicates are deduplicated; the runner cannot infer
semantic overlap. A user's test prohibition remains binding: report unexecuted
checks. Optional `AC-* -> TR-* -> reference` traceability complements, not
replaces, the criterion's command.

Read all context-linked standards/runbooks and inspect other standards' scope
manually; applicability is not glob-inferred. Their checks are not duplicated
under QUALITY if already covered. Active tasks stay in `work/`; only Done/
Cancelled archive to `work/archive/YYYY/`. IDs/number allocation remain global.
Use CLI archive/restore, preserve traceability and never manually discard tasks.
