# CLI contract Docu-docu v1

- Identifier: CON-CLI-V1
- Status: Completed
- Owner: Docu-docu Team
- Last updated: 2026-08-05

The contract fixes public commands, exit codes and native JSON formats
Docu-docu.

Direct embedding of the root Go package and side effects of exported ones
operations are described in [Go API contract](go-api.md).

## Teams

| Team | Side effects | Result |
|---|---|---|
| `check` | missing | diagnostics or `ProjectReport` |
| `build` | writes output, with `--clean` safely clears it | offline portal and `report.json` |
| `serve` | collects output, launches HTTP and explicitly changes browser save to workspace | editor API, watcher and live rebuild |
| `changes` | absent; read-only Git | text, Markdown or `ChangeSetReport` v1 |
| `changes file` | missing | detail of one modified path |
| `search` | missing | `SearchReport` by fresh Markdown |
| `task init` | atomically creates a new `TASK-*` or `BUG-*` by type | `TaskInitReport` |
| `scaffold` | atomically creates the selected entity | `ScaffoldReport` |
| `task ready` | missing | `TaskReadyReport` |
| `task context` | missing | `TaskContextReport` of the selected Ready+ task |
| `task verify --dry-run` | missing | plan `TaskVerifyReport` |
| `task verify --run` | executes trusted task commands | `TaskVerifyReport` |
| `task archive` | without rewriting, moves one terminal work item to `work/archive/YYYY/` | `TaskMoveReport` |
| `task restore` | without rewriting, returns one archived work item to `work/` | `TaskMoveReport` |
| `task changes` | missing | task-specific report and impact diagnostics |
| `version` | missing | generator version |

The assembly is called only as `docu-docu build ./docs ...`. Path without command
rejected as an unknown command.
Historical top-level command `init`, skill-level name `refresh` and
old `task check` are missing without alias. Calls to `docu-docu init` and `docu-docu
refresh` отклоняются как неизвестные команды; `$docu-docu init`,
`$docu-docu refresh` and `$docu-docu refresh diff` belong to AI-skill.

```text
docu-docu search "<query>" [docs-dir] [--limit N] [--format text|json]
docu-docu task init [docs-dir] --area AREA --title TITLE --type TYPE [--lang en|ru]
docu-docu scaffold module|use-case|flow|screen|decision|standard|runbook ID [docs-dir] --title TITLE [--lang en|ru]
docu-docu task ready TASK-ID [docs-dir] [--strict] [--format text|json]
docu-docu task context TASK-ID [docs-dir] [--format text|json]
docu-docu task verify TASK-ID [docs-dir] (--dry-run|--run) [--target TARGET] [--report FILE] [--timeout DURATION] [--format text|json]
docu-docu task archive TASK-ID [docs-dir] [--repository-root DIR] [--format text|json]
docu-docu task restore TASK-ID [docs-dir] [--repository-root DIR] [--format text|json]
docu-docu changes [docs-dir] [--base REV|--branch-base REF] [--target working-tree|index|HEAD|REV] [--format text|json|markdown]
docu-docu changes file PATH [docs-dir] [параметры changes]
docu-docu task changes TASK-ID [docs-dir] [параметры changes]
```

The documentation directory expects `index.md` and
`architecture/overview.md`. Overview must be of type `Architecture Overview`,
and every other `architecture/**/*.md` is a non-empty architectural question and
direct local link from overview. Architectural broken/blocked links are
errors. `status.md`, `roadmap.md` and other typed directories
optional; the rules of a particular type apply if it exists.

Statuses, types, required fields, sections and commands `TASK-*`/`BUG-*` are described in
[work task manual](../guides/work-items.md).
The `--title` value for `task init` and `scaffold` is always a single line.
Without `--lang` both commands use `project.locale` from
`.docu-docu/config.yml` if its primary language is supported (`en` or `ru`),
otherwise use `en`. Explicit `--lang` takes precedence.

## Command parameters

The contextual `COMMAND --help` shows only the applicable parameters, example and
side effects and exits with `0`, including incomplete forms of `task
--help`, `task OPERATION --help` и `scaffold --help`.

- `build`: output, title, exclude, stale policy, repository links, clean,
  open, strict and screen map;
- `check`: exclude, stale policy, repository root, strict and text/json format;
- `serve`: build parameters, host and port;
- `changes`, `changes file`, `task changes`: comparison, filters,
  text/json/markdown format and optional output file;
- `search`: limit and text/json format;
- `task init`, `scaffold`: required fields, locale and text/json format;
- `task ready`: strict and text/json format;
- `task context`, `task archive`, `task restore`: repository root and
  text/json format;
- `task verify`: exactly one of `--dry-run`/`--run`, target, report, timeout,
  repository root and text/json format.

The `changes --task` flag is missing. Task-scoped report is only available via
`task changes TASK-ID`.

`--host` and `--port` are only allowed for `serve`; default values -
`127.0.0.1` and `8080`. Access from the local network requires explicit
`--host 0.0.0.0`.

While `serve` is running, save/create, watcher and canonical portal manual button can
rebuild the portal without closing the listener; HTML request always returns ready
snapshot When running from canonical root configured `translations.<locale>`
read-only available via `/_docu-docu/locales/<locale>/`; they don't get editor or
canonical API. Editor API and its JSON schema v1
defined in [separate HTTP contract](editor-http.md). `build` always remains
static read-only: editor markup, CodeMirror, API URL and server-only scripts in it
results are not included.

A configured translation root is a complete read-only mirror of canonical
documentation. It permits `check`, `build`, `search`, ordinary `changes`,
and read-only `serve`; every `task *` command, `scaffold`, and editor write
is rejected with `TRANSLATION_ROOT_READ_ONLY`. The restriction is applied
before reading a work item or starting a command and does not change successful
schema-v1 reports.

The semantics of `--host`, `--port` and `--open` do not change; auto-open without `--open`
missing. The parameters `--no-open` and `--edit` do not exist and are rejected as
unknown. The editor does not legally depend on the listener address. With explicit
non-loopback listener available direct HTTP clients are included in the trust boundary;
same-origin guards are not network authentication.

`--report` and `--timeout` are only allowed for `task verify`.
`task verify --run` is allowed only for Ready, In Progress, Blocked and
Done; secure `--dry-run` can also be used for full Draft.

Changes parameters, JSON/Markdown contract and Git security are described in
[manual](../guides/documentation-changes.md). Exit codes changes: `0` —
no blocking diagnostics, `1` — report built with error, `2` — arguments or
revision, `3` - Git/repository is unavailable, `4` - internal error.

`--screen-map` and `--no-screen-map` are allowed for `build` and `serve`. Map
generated by default if `screens/SC-*.md` is present; `--no-screen-map`
disables only the general map page, keeping the directory, use cases pages with
step by step mode and JSON.

## Exit codes

- `0` — operation completed successfully;
- `1` - error in arguments, I/O, model, generation or verification;
- with `--strict`, the presence of warning also leads to `1`;
- `task ready` returns `0` for `contract_ready` and `ready`;
- `task verify` returns `0` for `planned` and `passed`.
- `task archive` and `task restore` return `0` only after successful
  movement; policy lock returns `1` and `TaskMoveReport`.
- `serve` returns `1` if the initial build or listener launch
  ended with an error; the subsequent rebuild error is returned to the client as
  HTTP 500 without stopping the server; If there is a manual reassembly error, the button receives
  error state, the available message is advertised through the live region, and the request
  can be repeated; editor API returns schema-v1 error envelope, and conflict -
  `409 stale_digest` without losing text.

## Architecture diagnostics

The architecture's structural contract uses stable error codes:

- `missing-architecture-overview`;
- `invalid-architecture-overview-type`;
- `missing-architecture-question`;
- `unlisted-architecture-document`.

Broken and blocked local links retain common codes
`broken-link` and `blocked-link`, but inside `architecture/` they have severity
`error`. The optional stable ID of the architectural document participates in
general `duplicate-id` check. CLI does not evaluate punctuation, interrogatives
words and architectural meaning of a non-empty question.

## ProjectReport schema v1

Schema v1 additively includes `knowledge.standards`, `knowledge.runbooks`,
`standardIds`/`runbookIds` with `WorkItem`, typed collections task context and
four runbook metrics in `stats`. Empty collections are serialized as `[]`;
The version of schema and generator does not change.

Architecture overview and detailed responses are serialized as regular documents with
`type: "architecture"`; the difference remains in `sourcePath` and `metadata`.
Each document additively contains `sectionType` for a known builtin
section; this does not change the previous `type`.

`check --format json` and the generated `report.json` contain:

- `schemaVersion`, generator and build time;
- project, current status and aggregated stats;
- documents securely resolved by links and backlinks;
- optional `flowId` for work item, if the task refers to `FLOW-*`;
- `knowledge.flows[]` and two-way connections `UC.flowIds ↔ FLOW.useCaseIds`;
- screens, states and transitions in top-level collections `screens` and
  `transitions`;
- calculated screen `playableFlows`, hotspots, error reference and traceability;
- screen statistics and `screenIds` for related entities;
- roadmap with declared and effective completion;
- risks, knowledge model and issues.

Empty collections have the form `[]`. Lines business rules, criteria, roadmap and
issues start from one.

## TaskContextReport schema v1

Read-only report contains complete `WorkItem`, `requiredReads`, business rules,
dependencies, documentation-impact documents and fixed related sections
module, use case, flow and screens.

The command does not execute the contents of `checks`.

## Workflow reports schema v1

`SearchReport`, `TaskInitReport`, `ScaffoldReport` and `TaskReadyReport`
use schema v1.

`WorkItem` and the search results contain `archived` and optional `archiveYear`.
`TaskMoveReport` uses schema v1 and contains `kind`, resulting in `status`
(`archived`, `restored` or `blocked`), task snapshot, source and destination paths,
optional `archiveYear` and issues. Move commands do not edit Markdown.

## TaskVerifyReport schema v1

The resulting `status` accepts `passed`, `failed`, or `blocked`. Team status:
`passed`, `failed`, `timed_out` or `start_error`.

The report contains:

- task snapshot and task-local `validationIssues`;
- all project issues for diagnostics;
- uniquely executed commands and their targets;
- `exitCode`, timestamps, duration and limited stdout/stderr;
- the result of each `AC-*`, `ALL` and `DOCS`;
- final summary.

## Compatibility

All public reports use schema v1. The contract develops directly without
legacy layer, converters and parallel output of several versions of the circuit.

`ChangeSetReport` has an independent schema v1 and is not added to the regular
`ProjectReport`; fields are defined in [JSON reference](../reference/changes-report.md).
