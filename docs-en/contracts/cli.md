# Toudocu CLI v1

- Identifier: CON-CLI-V1
- Status: Ready
- Last updated: 2026-08-10

This document defines CLI commands, side effects, exit codes, and versioned JSON
results. `toudocu COMMAND --help` shows the exact flag syntax.

## Commands

| Command | What it does | Changes data |
|---|---|---|
| `check` | Validates documents, relationships, and OpenAPI | No |
| `build` | Builds a backend-independent static HTTP portal and `report.json` | Writes only to output; `--clean` clears validated output |
| `serve` | Starts the local portal, watcher, Editor API, and Changes API | Changes canonical docs only after an explicit editor action; discussions are written only to local user state |
| `search` | Searches the current model | No |
| `changes`, `changes file` | Compares Git revisions, index, and working tree | No |
| `changes feedback pending` | Returns the oldest pending comment batch | No |
| `changes feedback respond` | Stores one complete agent response | Local user state outside the repository only |
| `task changes` | Shows changes and impact for the selected task | No |
| `task init` | Creates a draft `TASK-*` or `BUG-*` | Creates one new file without overwriting |
| `scaffold` | Creates a typed document | Creates one new file without overwriting |
| `task ready`, `task context` | Checks readiness or returns task context | No |
| `task verify --dry-run` | Shows the task verification plan | No |
| `task verify --run` | Runs commands explicitly recorded in the task | Yes, within the effects of the repository commands themselves |
| `task archive`, `task restore` | Moves a completed task to the archive or back | Moves one file without overwriting |
| `skill install`, `skill update`, `skill uninstall` | Manages the embedded offline skill package | Writes only to the selected project/user target |
| `skill status` | Shows the target and skill package state | No |
| `version` | Prints the version | No |

A path without a command name does not start an implicit build. There are no
top-level `init`, `refresh`, `translate`, or `feedback` commands: the similarly
named `$toudocu` workflows belong to the AI skill, not the Go CLI.

## Skill lifecycle

```text
toudocu skill install|status|update|uninstall
  [--agent auto|codex|claude-code|copilot|all]
  [--scope project|user]
  [--repository-root DIR]
```

The defaults are `--agent auto` and `--scope project`. `--repository-root` is
available only for project scope. `auto` selects the only detected host; when
the choice is ambiguous, an interactive terminal prompts for it, while a
non-TTY returns `SKILL_AGENT_REQUIRED`. `all` plans every unique absolute target
before writing and then processes them independently.

The CLI distinguishes `not-installed`, `installed`, `outdated`,
`newer-than-bundle`, `modified`, `unmanaged`, `invalid-manifest`, and
`unsafe-path`. `status` always remains read-only. Mutating operations do not
replace unmanaged, modified, invalid, newer, or unsafe targets. JSON output,
`--dry-run`, and `--force` are not supported.

Success or an allowed no-op returns `0`; a conflict, one target failure, or a
partial result returns `1`. Diagnostics use stable short codes including
`SKILL_AGENT_REQUIRED`, `SKILL_LOCAL_CHANGES`, `SKILL_UNMANAGED`,
`SKILL_MANIFEST_INVALID`, `SKILL_PATH_UNSAFE`, `SKILL_DOWNGRADE_BLOCKED`,
`SKILL_TARGET_CHANGED`, and `SKILL_RESTORE_FAILED`.

## General rules

- The input directory is specified explicitly; by default, the server listens
  on `127.0.0.1:8080` without TLS or authentication.
- `--host 0.0.0.0` exposes `serve` to a trusted local network.
- By default, canonical `serve` checks the latest stable release once per
  process and may show a link in the portal UI. `--no-update-check` disables
  the capability, endpoint, and external request; the flag is invalid for all
  other commands.
- `build` remains static and read-only. Editor, Swagger UI, and server-only
  scripts are not included in the result; the OpenAPI files themselves are
  copied. The existing `serve` provides a local browser runtime; there is no
  `preview` command.
- A configured translation root may be checked, built, searched, compared, and
  served read-only. Task workflows, scaffold, and Editor return
  `TRANSLATION_ROOT_READ_ONLY` before changing files or running checks.
- `task verify --run` is allowed only for Ready, In Progress, Blocked, and Done;
  `--dry-run` may also be used for a complete Draft.
- `changes` reads Git directly without a shell, fetch, checkout, or index write.
- Git refs are resolved from the outer Git root. `.toudocu/config.yml` and
  relative settings are resolved from the explicit `--repository-root`, and
  the documentation directory must be inside it.
- `changes`, `changes file`, and `task changes` accept `--include-assets`.
  Binary assets are then included regardless of `changes.includeAssets`, while
  `changes.exclude` still applies.
- `--translation-input` includes reader-facing Markdown, work items, and binary
  assets regardless of other include flags or custom `changes.exclude` rules.
  Only `generated/**` and `cache/**` inside the selected root remain excluded.
  It cannot be combined with `--permanent-only`.

## JSON results

Every public report uses `schemaVersion: 1`.

- `ProjectReport` describes the project, documents, relationships, roadmap,
  risks, knowledge, screens, flows, and diagnostics.
- `SearchReport`, `TaskInitReport`, `ScaffoldReport`, `TaskReadyReport`,
  `TaskContextReport`, `TaskMoveReport`, and `TaskVerifyReport` belong to their
  corresponding workflows.
- `ChangeSetReport` is a separate change-report schema and is not part of
  `ProjectReport`.
- `changes feedback pending --json` returns the state version and hash plus a
  `feedback` field. An empty queue returns `feedback: null` with exit code `0`.
- `changes feedback respond --input response.json --json` accepts the
  discussion and batch identifiers, previous version and hash, and a complete
  result list. Success returns `accepted: true` with the new version and hash.

Empty collections serialize as `[]`; line numbers start at one. New optional
fields may be added without changing the schema version.

For every command, `task verify` records the exit code, time, duration, bounded
stdout/stderr, and associated targets. The final status is `planned`, `passed`,
`failed`, or `blocked`.

## Agent responses to comments

```text
toudocu changes feedback pending [--repository-root DIR] --json
toudocu changes feedback respond --input response.json \
  [--repository-root DIR] [--json]
```

Without `--repository-root`, Git discovers the outer repository from the
current directory. An explicit path must be that repository's exact top level.
`pending` returns batches in order and repeats the oldest one until a complete
response is accepted.

`respond` rejects an unknown identifier, a version or hash conflict, missing or
duplicate items, a result outside `fixed|notFixed|needsClarification`, oversized
text, and unsafe `changedPaths`. These commands do not start an agent or AI
model, invoke a shell, or write to Git.

Stable diagnostics include `REVIEW_INVALID_RESPONSE`,
`REVIEW_MESSAGE_TOO_LARGE`, `REVIEW_STATE_BUSY`, `REVIEW_CONFLICT`,
`REVIEW_UNSAFE_PATH`, `REVIEW_STATE_CORRUPTED`, and the other `REVIEW_*` codes.

## Exit codes

- `0` — the operation completed successfully.
- `1` — an argument, I/O, model, generation, or verification error.
- `1` with `--strict` — at least one warning was found.
- `changes`: `2` for an argument or revision error, `3` when Git is unavailable,
  and `4` for an internal error.
- `serve`: an initial build or listener error ends the command with `1`; a later
  rebuild error does not stop the server.
- `skill`: a conflict or partial failure returns `1`; status and no-op return `0`.

## Detailed rules

- [Work items](../guides/work-items.md)
- [Viewing changes](../guides/documentation-changes.md)
- [Document types](../reference/document-types.md)
- [Configuration](../reference/configuration.md)
- [Installing the AI skill](../guides/skill-installation.md)
