# Work-item operations

Use for `TASK-*`/`BUG-*` context, selection, implementation or verification.
Conventions and authority are in `SKILL.md`; load [work-item-model](work-item-model.md)
only for contract/lifecycle changes. Creating a task still requires the normal
work-item threshold. Start qualifying new work with bounded search, `task init`,
semantic filling and read-only `task ready`.

## Select and gather

Use `task candidates` for Draft/Ready work, `--parent TASK-ID` for one subtree,
and `task tree TASK-ID` for its hierarchy. If all statuses are needed, use
`task list --format text`. Do not load its JSON to find one task: it embeds the
entire nonarchived backlog's Markdown.

Initial Ready+ documentation discovery must be:

```bash
toudocu task context <TASK-ID> <docs-root> \
  --repository-root <root> --format text
```

Before it, read only what determines invocation, roots and mandatory flags;
never substitute a manual documentation inventory. The map has paths, selected
IDs and counts, not the contract or issue details. Read the named task once for
result, scope, exclusions, criteria, plan and verification. Read every linked
standard/runbook before changes; inspect other standards' scope manually.
Other returned documents are candidates for targeted section reads, not a bulk
checklist. Linked flows/screens add their documents and relevant transitions.
Only canonical tasks are work context, never translated mirrors.

Request filtered JSON only for missing issue details, dependency states or typed
records; never load its embedded source text just to extract fields. Text counts
or status alone do not prove readiness. Context gathering authorizes no checks.
Reuse current maps and evidence on continuation; refresh changed/uncertain
relationships and missing sections, not the whole tree. Retain scope, exclusions,
decisions, changed paths, next step and latest checks. State-changing actions
still require current readiness/digest checks; an old saved report is no proof.

## Archive and restore

Keep active tasks in `work/`. Move terminal tasks only with `task archive` or
`task restore`, passing the selected roots and initially `--format text`.
Archive is `work/archive/YYYY/`. These commands preserve Markdown/status and
block changed link resolution. Never delete archived tasks still referenced.

## Verification

Inspect only when in scope:

```bash
toudocu task verify <TASK-ID> <docs-root> --dry-run \
  --repository-root <root> --format json > <temporary-plan-outside-docs>
```

Use [report-output](report-output.md) to display commands/targets/validation
issues without logs. Text verify output is a status summary, not the plan.
Dry-run executes nothing; `--report` writes only an authorized report path.

Run only after explicit execution permission, with trusted repository/commands
and a passing task-local validation gate:

```bash
toudocu task verify <TASK-ID> <docs-root> --run \
  --repository-root <root> --format json --timeout 10m \
  --report <authorized-report-outside-docs> > <temporary-output-outside-docs>
```

Preserve the CLI exit code. Show command/criterion outcomes, not all stdout and
stderr; inspect a bounded relevant log excerpt for a failure. Check all reported
failures/omitted pages and the report's target/fullVerification scope before
claiming success; a passing selected target does not complete the whole task.
Each unique configured command
runs once from repository root; one failure does not stop remaining commands.
Do not rerun successful suites and their subsets without changes or a concrete
failure. Report files must stay outside source documentation and within the
request's authority. Reuse existing verification coverage; details belong in
the contract model, not duplicate context reads.
