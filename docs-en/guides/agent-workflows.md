# Using the Toudocu AI Skill

This guide explains how to invoke the installed skill from an AI agent for
everyday CLI, portal, work-item, and source-documentation work, and when to use
the special `init`, `refresh`, and `translate` workflows.

## Two different interfaces

`toudocu skill ...` commands run in a shell and manage only the installed
skill copy:

```bash
toudocu skill install
toudocu skill status --agent all
toudocu skill update --agent codex
toudocu skill uninstall --agent codex
```

`$toudocu ...` calls are written in a prompt to the AI agent. They are agent
instructions, not Go CLI subcommands:

```text
$toudocu check the source documentation and explain the diagnostics
$toudocu build the local portal in the output configured by the project
$toudocu prepare context for TASK-AREA-001
$toudocu update the installation guide from the current CLI contract
$toudocu feedback
```

The CLI provides `check`, `build`, `serve`, `changes`, `search`, `scaffold`,
`task`, `skill`, and `version`. It has no `init`, `refresh`, `translate`, or
top-level `feedback` command: those are agent workflows. Inside the Toudocu
source repository, the agent uses `go run ./cmd/toudocu`; in other projects it
uses the installed `toudocu` from `PATH`.

## What to delegate to the skill

An ordinary request need not be a special workflow. Use the skill to:

- check documentation, explain errors and warnings, or find a document;
- build or locally run a static portal under the project's conventions;
- create or refine an evidence-backed guide, contract, ADR, module, use case,
  flow, screen, roadmap, risk, or work item;
- obtain read-only context for an existing `TASK-*`, check readiness, inspect a
  verification plan, or run explicitly requested verification;
- update ordinary documentation for specified behavior, code, or a decision
  without performing a full-project review.

The agent first reads repository instructions, applicable standards, and real
runbooks, and reuses the discovered docs root, repository root, excludes, stale
policy, and output. Fallbacks are `./docs` and its parent. `check` diagnostics
prove structure, links, and declared relationships, not usefulness or truth.

## Permission boundaries

Ordinary work follows the requested mutation: asking to check or explain does
not authorize file changes, while asking to update a document authorizes that
update and necessary consistent links. These actions require separate explicit
requests:

| Action | Required authority |
|---|---|
| `$toudocu init` | Explicit init call or unambiguous request for that workflow |
| `$toudocu refresh` | Explicit full refresh call |
| `$toudocu refresh diff` | Explicit diff refresh call |
| `$toudocu translate <locale> ...` | Explicit translation request and target locale |
| `$toudocu translate diff` | Explicit request to process the current diff for every configured locale |
| `$toudocu feedback` | Explicit request to process comments from Changes |
| `task verify --run` | Explicit request to verify or execute the task in a trusted repository |

Missing files, first skill use, ordinary documentation edits, or `check` do not
authorize init. “Update this guide” does not authorize a full refresh.
`task context`, `task ready`, and `task verify --dry-run` execute no commands;
`task verify --run` executes trusted repository code with the current user's
permissions.

Create a work item only when the user or project explicitly requires one, or
substantial work genuinely needs durable scope, acceptance, verification, and
handoff. A small edit or ordinary prompt does not require a `TASK-*`.

## Everyday workflows

### Checking and searching

Prefer JSON for diagnosis and text output for human confirmation:

```bash
toudocu check ./docs --repository-root . --format json
toudocu check ./docs --repository-root .
toudocu search "verification" ./docs --format json
```

Ordinary `check` fails on errors and reports warnings. `--strict` additionally
makes a warning produce a non-zero exit code and is used only by project
policy, CI, or explicit request.

### Portal

For a build request, reuse the accepted output or choose a separate disposable
directory. `build` writes generated output; `serve` builds it and starts a local
HTTP server. Before `--clean`, verify that the authorized output is safe and is
not the input, its ancestor, a system root, or an unsafe symlink target.
`serve` defaults to `127.0.0.1`; use `0.0.0.0` only for an explicitly requested
trusted local preview.

Generated `build/`, `dist/`, `project-docs/`, and portal output are never edited
as documentation sources. Build a portal only when requested, needed for
verification, or required by project policy.

### Work items

Start an existing Ready+ item with compact read-only context:

```bash
toudocu task context TASK-AREA-001 ./docs \
  --repository-root . \
  --format json
```

Inspect the dry run before authorized execution:

```bash
toudocu task verify TASK-AREA-001 ./docs --dry-run \
  --repository-root . \
  --format json
```

Use `--run` only after an explicit request, in a trusted repository, and after
the task-local validation gate. Save reports outside source documentation.
Archive and restore only through `task archive` and `task restore`.

### Ordinary documentation edits

Identify the audience, useful question, and repository evidence; update an existing
document instead of duplicating it; write only supported claims. Choose a typed
document for its meaning, not for an ID or green check. Never invent unknown
status, date, relationship, or procedure.

Every change passes two gates:

1. Semantic gate: the author checks usefulness, evidence, boundaries,
   contradictions, and source-of-truth placement. Changes to requirements,
   behavior, architecture, contracts, status, stable IDs, or machine-readable
   relationships require independent semantic review.
2. Structural gate: after semantic review, run the ordinary project-wide
   `check`; add strict checking only when required by policy or request.

Fix structural errors at their sources. Never remove a meaningful relationship
or add unsupported prose merely to obtain a clean report.

If the user forbids checks, the agent does not run them and reports that fact
plainly.

## Special workflows

### Processing Changes comments

`$toudocu feedback` retrieves the oldest pending batch through
`changes feedback pending --json`. The agent validates each anchor and the
current Git diff, evaluates the comment against the actual repository, and
changes only justified files.

For every message it returns one result—`fixed`, `notFixed`, or
`needsClarification`—with a short explanation and only relevant
`changedPaths`. The whole response is accepted atomically against the previous
hash, version, and discussion state. On conflict, the agent retrieves and
reviews the batch again instead of substituting expected values.

After success, it continues with the next batch until the queue is empty.
Neither the UI button nor the transport CLI starts the agent or resolves a
discussion.

### Initialization

Use `$toudocu init` only on explicit request. It checks repository
instructions, existing documentation, configuration, and managed markers in
the root `AGENTS.md`. A single marker, duplicates, reversed order, or nesting
blocks writes. An unmanaged instruction conflicting with the Toudocu trigger
or task-creation policy also blocks. Any legacy Markdown under `architecture/`,
apart from one structurally valid overview, blocks automatic migration.

After a safe preflight, init creates only missing minimal `index.md` and
`architecture/overview.md`, fills the project locale and built-in section map,
and adds or updates managed project guidance. It invents no typed entities and
creates no task automatically. Init is not a Go CLI command and never runs just
because files are missing.

### Full refresh

`$toudocu refresh` compares every Markdown document in the canonical root
with current repository evidence: code, tests, public interfaces, schemas,
configuration, CI, decisions, and confirmed requirements. It classifies each
document as current, needs update, unverifiable, obsolete, duplicated, or
misplaced. It changes only evidence-backed claims, records ambiguous conflicts
as unresolved findings, and then performs semantic review and a project-wide
structural check.

Refresh neither initializes nor installs managed guidance or creates a new
documentation tree. Dates change only with content or relationships; runbook
`Last verified` changes only after the procedure is actually verified.

### Current diff refresh

`$toudocu refresh diff` requires a Git worktree and valid `HEAD`. Its initial
change set is:

```bash
git diff --name-only HEAD --
git ls-files --others --exclude-standard
```

This covers staged, unstaged, and untracked changes relative to `HEAD`, without
a merge base or default branch. The workflow then adds documents affected via
local links, backlinks, stable IDs, task relationships, declared repository
paths, and changed public behavior. Generated output, caches, vendored assets,
and translation roots are excluded. Without Git or `HEAD`, it stops and offers
a full refresh instead of silently broadening scope.

### Translation

`$toudocu translate <locale>` requires a configured target profile and
exactly one mode:

```text
$toudocu translate <locale> --task TASK-ID
$toudocu translate <locale> --base REF
$toudocu translate <locale> --all-stale
```

The configured translation root mirrors the canonical reader-facing file set.
The workflow processes one source/target pair at a time; preserves IDs,
commands, paths, URLs, anchors, code fences, and machine-readable contracts;
and copies binary assets byte-for-byte. Translated work items are read-only
mirrors and are never used for task context, readiness, verification, or editor
writes.

Before changing the manifest, the agent runs strict JSON checks on canonical
and target roots, compares normalized document kinds, status kinds, and roadmap
semantics, then runs one final strict check of the selected locale. A semantic
mismatch or failed check leaves the manifest unchanged and is reported.

## Translation isolation

The canonical root is the sole source for ordinary repository search,
inventory, semantic review, implementation analysis, and task context.
Configured translation roots, including translated work items, are excluded
and are not added to ignore files.

A selected translation root is read only for explicit
`$toudocu translate <locale>` or an explicit request to check, find, build,
run, or inspect that locale. Access is limited to the selected locale and
minimal source/target pair; parity discovery starts with relative paths, source
digests, and structural reports.

## What the agent reports

After work, the agent lists changed canonical sources, locale targets, and the
translation manifest; init also reports configuration and the managed root
`AGENTS.md` block. It reports author semantic review, independent review when
required, resolved errors, remaining warnings, and validation policy. Refresh
also reports scope, evidence, unresolved findings, ID migrations, and date
changes. Translate reports mode, locale, parity, and manifest state. Portal
builds and `task verify --run` are explicitly reported as intentionally not run
when they were neither authorized nor required.
