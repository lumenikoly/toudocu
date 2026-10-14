---
name: toudocu
description: >-
  Maintain Toudocu source documentation, typed entities, tasks, CLI/portal,
  discussions and Agent Feedback. Use for explicit $toudocu workflows or
  code/product changes affecting documented behavior, interfaces, configuration,
  architecture or user-visible behavior. Not for general questions or code-only
  changes that preserve documented behavior. Clarification, initialization and
  task verification execution require explicit requests; never infer them.
---

# Toudocu

Use repository facts to maintain source Markdown and explicit relationships.
Never invent behavior, status, dates, entities, procedures or checks to silence
warnings. Generated portals and reports are not editable sources.

## Load only the selected route

Explicit operations take precedence. Read one operation reference, not the
whole reference directory. Links are navigation, not instructions to load every
linked file. Reuse current instructions already read in this session; reload
only when changed, missing or uncertain. Do not read evals or inventory templates
unless maintaining the skill or selecting a particular template.

| Request | Reference |
|---|---|
| Explicit `$toudocu init` | [init](references/init.md) |
| Explicit `$toudocu refresh` / `refresh diff` | [refresh](references/refresh.md) |
| Explicit translation of selected locales | [translate](references/translate.md) |
| Explicit `$toudocu clarify` / Toudocu clarification interview | [clarify](references/clarify.md) |
| Agent Feedback / Toudocu discussions | [agent-feedback](references/agent-feedback.md) |
| Work-item context, selection, implementation or verification | [task-workflow](references/task-workflow.md) |
| Build / serve | [portal](references/portal.md) |
| Create source documents | [create-documents](references/create-documents.md) |
| Check, search, changes or ordinary documentation edits | [workflows](references/workflows.md) |
| Read-only review of a known file | Read that file; no discovery or check unless needed |

For prose changes/review apply [writing-quality](references/writing-quality.md).
Before source mutations apply [semantic-gate](references/semantic-gate.md).
Load a model only when authoring/reviewing its structure or relationships:
[document-model](references/document-model.md),
[work-item-model](references/work-item-model.md) for task contracts/lifecycle,
[architecture-gate](references/architecture-gate.md) for architecture,
[screen-model](references/screen-model.md) for flows/screens/transitions.
Do not load a contract model merely to read its context map.

## Conventions and authority

- Follow repository instructions. Read all standards/runbooks explicitly named
  in the task context; manually inspect other standards' scope. Reuse current
  completed reads, but never waive unread mandatory evidence.
- Use `toudocu` from PATH; in its source repository use
  `node apps/cli/dist/main.js`. Resolve roots and flags from repository policy,
  config and existing commands; use the narrowest root covering documentation
  and referenced paths. Default to `./docs` and its parent only without a
  convention. Reuse excludes, stale policy, strict policy and output paths.
- Canonical documentation is the only ordinary documentation/backlog source.
  Exclude configured translation roots from search, inventory, semantic review
  and implementation/task context. Read a translation root only for an explicit
  selected-locale operation; translation workflows read one source/target pair
  at a time. Never hide translations in ignore files.
- `init`, `refresh`, `translate` and `clarify` are agent workflows, not CLI
  commands. Missing files never authorize init. Clarification stops before
  implementation. `task verify --run` requires explicit execution permission
  and trusted commands. Feedback follows only its isolated operation reference.
- Create a work item only if requested/required or substantial work needs durable
  scope, acceptance, verification or handoff; not for each prompt or small edit.

## Minimum context and validation

Use purpose-built read-only discovery before broad documentation search:
text task context, bounded search, or changes for the requested scope. Known
files may be read directly; code search is separate. Read relevant sections,
not every returned document. Reuse facts instead of loading both JSON and
Markdown or the same file through aliases.

Default to compact text. Keep large JSON, diffs and test logs outside model
context; select needed fields/excerpts before displaying them. For structured
check/verification output use [report-output](references/report-output.md).
Never treat truncation, omitted pages or a summary as proof of success. Preserve
CLI exit codes. Retain only a checkpoint of scope, exclusions, decisions,
changed paths, next step and latest checks; refresh uncertain/changed evidence
and perform current readiness/digest checks before state-changing actions.

A baseline check is optional unless the selected operation requires it. After
source mutations run the project check once with `--strict` only when required;
do not repeat ordinary + strict checks or successful suites and their subsets
without new changes/failures. Respect prohibited checks, report unverified work,
and build only when requested or necessary. Structural success is not semantic
proof. If `DOCS_MIGRATION_REQUIRED` appears, read the named
`references/migrations/<Migration>.md`, migrate only canonical sources, set its
target version, validate, then resume the requested workflow.
