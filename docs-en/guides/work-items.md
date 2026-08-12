# Work items

Each work item lives in its own `work/*.md` file. Features, maintenance,
documentation, and research use `TASK-*`; defects use `BUG-*`. Reports treat
both as `WorkItem` entities with the same status model, dependencies, context
and verification commands, and annual archive.

## Minimal draft

One file contains exactly one work item:

```md
# TASK-AUTH-014: Add password recovery

- Status: Draft
- Type: Feature

## Outcome

A user can request a password-recovery link.
```

A draft needs a valid Status and Type and a non-empty Outcome. Add the other
fields as the contract becomes clearer.

## When a work item is useful

Do not create a `TASK-*` for every prompt, question, code-reading session,
formatting change, small local edit, or behavior-preserving refactor.

A separate work item is justified when the user or project policy requires it,
or when substantial work needs a durable contract: clear boundaries,
acceptance criteria, verification commands, and handoff between people or
sessions. Contract and architecture changes, migrations, and multi-step
features commonly meet that threshold. Reuse an existing Ready work item when
one already covers the change.

`$toudocu init`, `$toudocu refresh`, and `$toudocu refresh diff` do not create a
work item automatically. They use the same threshold.

## Statuses

| Status | Use it when | Additional requirement |
|---|---|---|
| `Draft` | The task is still being defined | Type and observable outcome |
| `Ready` | The contract is agreed | Every work section and every `AC-*` verification |
| `In progress` | Work is underway | Same contract as Ready |
| `Blocked` | Work cannot continue | Non-empty Blocker section |
| `Done` or `Completed` | The result is accepted | Every `AC-*` checked; `ALL` and `DOCS` present; dependencies complete |
| `Cancelled` or `Canceled` | The work is no longer needed | Non-empty Cancellation reason section |

Russian status values are also recognized in Russian-language roots.

## Types

The type describes the nature of the work, not its state.

| Type | Meaning | Use case field |
|---|---|---|
| `Feature` | New or changed user-facing behavior | Required |
| `Bug` | Fix for observable incorrect behavior | Required, except for the technical case below |
| `Maintenance` | Refactoring, infrastructure, or upkeep | Optional |
| `Documentation` | Documentation-only work | Optional |
| `Research` | Investigation or hypothesis testing | Optional |

A technical work item without a Use case needs a Rationale for no use case
section. When a `UC-*` is named, it must exist.

Russian type values are accepted and normalize to the English values above.

`task init --type Bug` creates `work/BUG-AREA-NNN.md`; other types receive a
`TASK-AREA-NNN` identifier. Type `Bug` requires the `BUG-` prefix, and `BUG-*`
cannot be used for another type.

## Fields

| Field | Rule |
|---|---|
| `Status` | Always required; one of the statuses above |
| `Type` | Always required |
| `Module` | Required from Ready onward; the `MOD-*` must exist |
| `Use case` | Required for Feature and user-facing Bug; the `UC-*` must exist |
| `Flow` | Optional existing `FLOW-*`; included in task context |
| `Standards` | Optional existing `STD-*` identifiers; requires a `QUALITY` target |
| `Affected runbooks` | Optional existing `RB-*` identifiers; included in context |
| `Depends on` | `TASK-*` and `BUG-*`, separated by spaces, commas, or semicolons |
| `Priority` | Optional label; no fixed vocabulary outside the bug contract |
| `Last updated` | Optional ISO date used by stale-document policy |

Identifiers are unique across all of `work/**`, including the archive. A
dependency must exist and must not form a cycle. A work item cannot be marked
Done before all dependencies are complete.

## Required sections for a Ready work item

From Ready onward, a task needs:

1. Outcome — what a user or system can observe.
2. Behavior change with exact Before and After subsections — for Feature. These
   subsection names are part of the format. Bugs use the separate contract
   below.
3. Scope — files and directories that may change.
4. Out of scope — work explicitly excluded.
5. Acceptance criteria — testable `AC-*` conditions.
6. Plan — the expected work sequence.
7. Verification — one command mapping per criterion plus `ALL` and `DOCS`.
8. Documentation impact — exact files to update, or why no documentation
   change is needed.

Backtick paths in Scope are relative to `--repository-root`. Existing paths
must stay inside that root. A new file is allowed when its safe parent exists.
A glob must match at least one path.

## Acceptance criteria and commands

Each criterion has a unique local identifier:

```md
## Acceptance criteria

- [ ] `AC-01` An expired token returns `INVALID_TOKEN`.
- [ ] `AC-02` A valid token changes the password once.
```

Verification contains exactly one entry for each criterion, with at least one
command:

```md
## Verification

- `AC-01` → `go test ./internal/auth -run TestInvalidToken`
- `AC-02` → `go test ./internal/auth -run TestResetPassword`
- `ALL` → `go test ./...`
- `DOCS` → `toudocu check ./docs --strict`
```

| Target | What it confirms |
|---|---|
| `AC-*` | One acceptance criterion |
| `ALL` | The project's complete accepted verification cycle |
| `DOCS` | The complete documentation check |
| `QUALITY` | Explicitly related standards, through commands in the work item |

Readiness requires every `AC-*`, `ALL`, and `DOCS`. If Standards is non-empty,
one `QUALITY` entry is also required. `task context` includes named standards
and runbooks in `documents` and `requiredReads`; Toudocu does not infer their
applicability from Scope. A Done work item has every criterion marked `[x]`.

## Actual documentation impact

```bash
toudocu task changes TASK-AUTH-014 ./docs --base HEAD --target working-tree
```

The command and Changes workspace compare paths from Documentation impact with
the current Git diff. The `TASK-*` file itself appears separately as a work
contract and does not increase the count of permanent documents. Explicit
paths take precedence over relationships inferred from a module, use case,
flow, screen, or contract.

`declared-document-not-changed` means a promised file did not change;
`undeclared-document-change` means an unlisted document did. These are warnings
for human review by default, not proof of a defect. The comparison range is
always shown; Toudocu does not guess a hidden task-start commit.

## Additional bug contract

A bug first establishes the defect, then proves a correction of that same
behavior. Severity, Priority, Reproducibility, Regression, Module, Use case,
and Last updated are always required.

| Field | Accepted values |
|---|---|
| `Severity` | `Critical`, `High`, `Medium`, `Low` |
| `Priority` | `Urgent`, `High`, `Normal`, `Low` |
| `Reproducibility` | `Always`, `Often`, `Sometimes`, `Rarely`, `Not reproducible`, `Unknown` |
| `Regression` | `Yes`, `No` |

Severity describes harm; priority describes ordering. Toudocu does not derive
one from the other. When Regression is Yes, name the version or period when it
appeared.

Even a draft bug needs Symptom, Expected behavior, Actual behavior, and either
Steps to reproduce or Evidence. From Ready onward it also needs Cause, Scope,
Out of scope, Plan, Acceptance criteria, Verification, and Documentation
impact.

If the cause is unknown, write `Not established` and put tentative explanations
in a Hypotheses section. A completed bug must have an established cause. A bug
plan is a numbered list without checkboxes; checkboxes remain reserved for
acceptance criteria.

A Ready bug includes a criterion for a regression test. When automation is not
technically possible, a Regression test section explains why and gives an exact
manual path.

A purely technical defect may use `Use case: Not applicable`, but then it needs
a User-behavior relationship section. Every named `MOD-*`, `UC-*`, `SC-*`,
`TR-*`, and dependency must exist.

Never put passwords, tokens, keys, personal data, or raw production dumps with
sensitive data in evidence.

## Archive

Active work items live directly in `work/`; completed and cancelled items can
move to `work/archive/YYYY/`:

```text
work/TASK-AUTH-014.md
work/BUG-AUTH-021.md
work/archive/2026/TASK-AUTH-009.md
```

Use the CLI instead of moving files by hand:

```bash
toudocu task archive TASK-AUTH-009 ./docs --format json
toudocu task restore TASK-AUTH-009 ./docs --format json
```

Only Done and Cancelled items can be archived. The command checks status,
paths, destination conflicts, incoming links, and the work item's own relative
links. If a link would resolve differently after the move, the file stays in
place. The command changes neither contents nor status.

`task restore` returns the file to `work/` and can also recover an active item
archived by mistake. Identifiers and dependencies span all of `work/**`, so
`task init` never reuses an archived number.

## Complete example

```md
# TASK-AUTH-014: Add password recovery

- Status: Ready
- Type: Feature
- Priority: High
- Module: MOD-AUTH
- Use case: UC-AUTH-03
- Flow: FLOW-AUTH-RECOVERY
- Depends on: TASK-MAIL-004
- Last updated: 2026-07-27

## Outcome

A user can recover a password securely through a one-time link.

## Behavior change

### Before

A user cannot recover a forgotten password without support.

### After

A user follows a one-time link and sets a new password.

## Scope

- `internal/auth/`;
- `internal/mail/`;
- `docs/modules/auth.md`.

## Out of scope

- changing registration rules;
- adding a new mail provider.

## Acceptance criteria

- [ ] `AC-01` An expired token is rejected.
- [ ] `AC-02` A valid token changes the password once.

## Plan

- [ ] Add token creation and storage.
- [ ] Enforce expiry and one-time use.
- [ ] Update the authentication documentation.

## Verification

- `AC-01` → `go test ./internal/auth -run TestExpiredResetToken`
- `AC-02` → `go test ./internal/auth -run TestResetTokenSingleUse`
- `ALL` → `go test ./...`
- `DOCS` → `toudocu check ./docs --strict`

## Documentation impact

Update the password-recovery use case and authentication module rules.
```

## From draft to verification

1. `task ready` validates a complete draft without changing its status.
2. After a manual move to Ready, `task context` collects the limited set of
   required documents.
3. `task verify --dry-run` displays the exact command plan without executing it.
4. Only after separate authorization, `task verify --run` executes commands in
   sequence from the repository root.

An identical command runs once even when mapped to several targets. One failed
command does not cancel the others. Commands are trusted repository code and
run with the current user's permissions.

Report formats and exit codes are defined in the
[CLI contract](../contracts/cli.md).
