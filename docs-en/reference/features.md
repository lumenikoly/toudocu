# Catalog of features

The page lists the implemented features of Docu-docu and indicates where
their detailed contract is recorded. Markdown files remain the source of truth:
JSON and `build` output do not store a separate model or edit sources; only
`serve` adds explicit write operations in the canonical workspace.

Quick entry points: the [unified API and programmatic interface map](api.md)
and the [interactive Screen Map](../screens/).

## CLI

- Git-backed `changes`, `changes file` and `task changes` for working tree,
  index, revisions and branch merge-base; text, JSON and Markdown reports.
- In `serve`: unified/CodeMirror merge/rendered/semantic diff, OpenAPI,
  Mermaid, assets, screen-map overlay and task impact.

Docu-docu comes as a single Go binary with no external runtime dependencies.

| Opportunity | Team | Result |
|---|---|---|
| Project review | `docu-docu check ./docs` | diagnostics or `ProjectReport` |
| Strict inspection | `docu-docu check ./docs --strict` | warning also gives exit code `1` |
| Portal assembly | `docu-docu build ./docs` | standalone HTML and `report.json` |
| Local workspace | `docu-docu serve ./docs` | view/edit, editor API, watcher and live rebuild |
| View changes | `docu-docu changes ./docs` | text, Markdown, or `ChangeSetReport` v1 |
| Change to one file | `docu-docu changes file PATH ./docs` | details for the selected changed path |
| Document search | `docu-docu search "query" ./docs` | `SearchReport` by fresh Markdown |
| Create a task | `docu-docu task init ./docs --area AREA --title TITLE --type TYPE` | new Draft and `TaskInitReport` |
| Creating an Entity | `docu-docu scaffold module|use-case|flow|screen|decision|standard|runbook ID ./docs --title TITLE` | atomic scaffold and `ScaffoldReport` |
| Readiness check | `docu-docu task ready TASK-ID ./docs` | read-only `TaskReadyReport` |
| Task context | `docu-docu task context TASK-ID ./docs` | read-only `TaskContextReport` |
| Checking the task | `docu-docu task verify TASK-ID ./docs --dry-run|--run` | plan or execute commands and `TaskVerifyReport` |
| Task changes | `docu-docu task changes TASK-ID ./docs` | task-scoped change report and impact diagnostics |
| Archive a task | `docu-docu task archive TASK-ID ./docs` | move a terminal task to its yearly archive |
| Restore a task | `docu-docu task restore TASK-ID ./docs` | return a task from its yearly archive |
| AI-skill lifecycle | `docu-docu skill install|status|update|uninstall` | text state of the managed offline package |
| Version | `docu-docu version` | generator version |

The build requires an explicit `docu-docu build ./docs`; the path without a command is rejected.
There is no separate top-level command `init`: the minimal project is created by files
`docs/index.md` and `docs/architecture/overview.md`; `task init` creates only
work item. Parameters and exit codes
defined in [CLI contract](../contracts/cli.md).

The skill lifecycle is not part of the public Go facade and does not use JSON
output. Targets, states, and safe manual conflict resolution are described in
the [skill installation guide](../guides/skill-installation.md).

The `changes` commands support `--status`, `--module`, `--type`, and
`--permanent-only` filters. The last keeps only permanent documentation and
excludes work artifacts, contracts, and assets.

## Public Go API

The root package `docu-docu` exports a typed façade over the CLI,
document model, Markdown renderer, portal generator, search, task
workflow and Git-backed changes. Direct calls return models and reports without
mandatory serialization or launching a separate process.

The canonical remote module path has not yet been published. The current import
path is intended for the source module or an explicit local `replace`. The
actual public surface is defined by declarations and package documentation in
the root `api.go`; no separate compatibility guarantees for external consumers
are claimed before module publication.

## Skill workflows update

The set `docu-docu` provides modifying agent workflows,
which are not included in the Go CLI: `init`, `refresh`, `refresh diff` and `translate`.

- `$docu-docu refresh` checks the entire set of source Markdown documents against
  current code, tests, public interfaces, schemas, configuration, CI,
  requirements and solutions;
- `$docu-docu refresh diff` starts with staged, unstaged and untracked files
  relative to `HEAD` and adds dependent documents by reference, stable ID,
  task relationships and changed public behavior;
- `$docu-docu translate <locale> --all-stale` maintains full reader-facing
  Markdown parity, including work items, notes, and ideas. The locale root
  remains read-only and is never used for task workflow or editor writes.
  During ordinary work, the agent excludes all translation roots from search,
  inventory, semantic review, task context, and implementation analysis. An
  explicit translation or request to check, find, build, run, or inspect a
  specific locale opens only the selected root and the minimum necessary
  source/target pair; parity review starts with paths, hashes, and structural
  reports. Localized metadata keys and status values are allowed only when their
  normalized semantics remain unchanged: for example, `Готово` (`done`)
  translates to `Completed` or `Done`, while `Готово к работе` (`planned`)
  translates to `Ready`. Before updating the manifest, the workflow compares
  status kinds and computed roadmap state in both locale JSON models.

Refresh only updates evidence-backed sources, does not change the code for the sake of
matches the text and does not execute init. Dates change only with
content or connections; runbook review date requires actual review.
Provable delete, rename and stable-ID migration update all references together.
After semantic and structural gates, only tracked or explicitly are rebuilt
portals prescribed by the project.

Complete user sequences for `init`, `refresh`, `refresh diff`, and `translate`
are described in the [agent workflows guide](../guides/agent-workflows.md).

## Document model

The unified table of purposes, boundaries, and selection rules is in the
[document types reference](document-types.md).

Minimal documentation contains `index.md` and a map
`architecture/overview.md` with type `Architecture Overview`. Everyone is different
`architecture/**/*.md` answers one non-empty architectural question and
must be directly specified in overview. As needed Docu-docu
recognizes:

- `status.md`, `roadmap.md`, `risks.md`, `ideas.md` and `notes.md`;
- modules `MOD-*`, use cases `UC-*` and processes `FLOW-*`;
- `STD-*` standards and `RB-*` operational procedures;
- architecture, contracts, solutions, manuals and reference books;
- unknown top-level custom sections with no explicit manifest
  heuristics based on the number or topic of documents;
- `TASK-*` work tasks, `AC-*` criteria and verification commands;
- `SC-*` screens, `TR-*` transitions, states and hotspots.

The model checks required fields and sections, the uniqueness of stable IDs,
statuses, dependencies, local and repository links, anchors, deprecation,
consistency of roadmap, task scope and traceability.

Architectural diagnostics are errors and use codes
`missing-architecture-overview`, `invalid-architecture-overview-type`,
`missing-architecture-question`, `unlisted-architecture-document`,
`broken-link` and `blocked-link`. Punctuation and meaning of the question remain semantic
gate, and schema v1 stores `documents[].type: "architecture"`.

The full author's contract of new sections and freshness is described in the manual
[Standards, Runbooks and Custom sections](../guides/quality-runbooks.md).

Global progress is calculated only by `roadmap.md`. For the associated `UC-*`
the source of execution is the use case status; local checklists of others
documents do not increase the global percentage.

## Markdown and diagrams

Goldmark `v1.8.5` parses CommonMark and only explicitly enabled extensions:

- headers and automatic unique anchors;
- paragraphs, highlighting, links, images and quotes;
- bulleted, numbered and task lists;
- tables, inline code and fenced code blocks;
- strikethrough and literal HTTP(S), `www` and email autolinks;
- Mermaid `flowchart`, `stateDiagram-v2` and `sequenceDiagram`.

Raw block or inline HTML is a policy error, including inside a table. `check`
and `build` fail; editor preview and rendered diff show it as escaped text.
Attributes, front matter, footnotes, definition lists, and typographer are not
enabled. Mermaid Tiny is embedded locally, follows the light or dark theme, and
always starts with `securityLevel: strict`. Mermaid front matter, directives,
and blocks over 50,000 UTF-8 bytes are rejected.

## Offline portal

`build` creates document and catalog pages, dashboard, health report,
search and `report.json`. The interface provides:

- hierarchical navigation: the active group is expanded, the rest are by default
  collapsed, the user state is saved;
- color statuses in document icons with a text signature for accessibility and
  separate `☐`/`☑` for unexecuted and completed `TASK-*`/`BUG-*`;
- global full-text search with keyboard call `/`;
- a separate page “Project Change Log” from the root `CHANGELOG.md`,
  if it is a regular readable file; she participates in portal search, but is not included in
  `report.json`, task context, semantic model or editor workspace;
- 3–5 recommended entry points and a single filterable full catalog;
- table of contents and collapsible sections of the document with clean accessible names;
- copying the name and repository-relative path of the original Markdown document
  to pass context to the agent;
- copying code blocks from fallback to selection;
- directory, task and traceability filters;
- specialized Quality and Runbooks catalogs with filters and metrics
  total, recent, review-required and overdue;
- backlinks and related documents;
- light and dark themes, printed version and adaptive sidebar;
- Mermaid diagram control: zoom, pan, fit and fullscreen.

All internal URLs are relative. The portal requires no Go backend, CDN, Node.js,
or browser extension, but it is published over HTTP(S) and may load its own
static JSON resources from output.

## Live workspace serve

`serve` adds a separate Operate UI to the read-only portal: tree of allowed
sources, path/dirty/save toolbar, CodeMirror, Editor/Preview/Split and
positional diagnostics. Markdown preview uses the existing safe renderer;
JSON receives syntax and hotspots diagnostics, while arbitrary YAML only receives
accessible Docu-docu diagnostics without a fictitious general schema. The
exception is `contracts/**/*.openapi.{yaml,yml,json}`: these files receive
OpenAPI 3.0/3.1 root, operation, operationId, path-parameter, and internal
`$ref` validation with line/column positions; external references are not loaded.

Save uses SHA-256 CAS and atomic replace. After save/create model, HTML,
search and diagnostics are rebuilt synchronously; watcher checks external
changes, and browser polling via ETag distinguishes between a regular page, clean editor
and dirty conflict without losing local text. `Ctrl`/`Cmd`+`S`, leave guard,
diagnostic navigation and mobile drawer are included in the same UI.

Browser creation and CLI commands `task init`/`scaffold` use one template
registry. The Editor API wire contract is in
[OpenAPI](../contracts/editor.openapi.yaml), while write guarantees and the
workspace boundary are in the [behavioral description](../contracts/editor-http.md).

Canonical `serve` also publishes `/_docu-docu/api-docs/`: vendored Swagger UI
5.32.12 switches between Editor and Changes specs, uses no CDN, and permits Try
it out only for `GET`/`HEAD`. Static and translation portals do not receive it.

## Processes and user scripts

“User scripts” is an independent top-level section and
canonical entry point for `UC-*`. The Processes section lists named
visual and cross-system documents `FLOW-*`. The directories are divided:

- `use-cases/index.html` shows requirements and user result;
- `processes/index.html` shows processes and filters them by module and
  related script;
- `flows/FLOW-*.html` remain stable pages of individual processes;
  `flows/index.html` is not created.

`FLOW-*` documents are direct children of “Processes”.
Canonical documents receive stable URLs by ID:

- `use-cases/UC-*.html`;
- `flows/FLOW-*.html`.

One `FLOW-*` can refer to several `UC-*`s. Feedbacks are calculated
automatically. The use case page combines the tabs “Description”, “Map”,
“Lose” and “Connections”; a separate `flows/UC-*.html` page is not created.

## Screen map

[Open the interactive Screen Map](../screens/). It shows high-level product
navigation and intentionally does not list every generated route.

If `screens/SC-*.md` is present, the following are generated:

- `screens/index.html` - interactive map;
- `screens/catalog.html` — filtered directory;
- `screens/SC-*.html` — screen documents with links;
- `traceability.html` - connection between use case, screen, transition, task, criterion and verification.

The parent item "Screens" leads to `screens/catalog.html`. When turned on
the general map `screens/index.html` is added as a separate child item;
`--no-screen-map` removes only this page and link.

The map card shows preview or placeholder, ID, name, route,
status, module and number of incoming and outgoing transitions. Available modes:

- all screens grouped by modules;
- selected module;
- selected use case;
- only unfinished screens;
- sitemap by the `Parent screen` field.

Additionally, search, status filter, zoom, pan, fit, reset,
fullscreen, screen or transition selection, and sidebar connections. Mouse wheel
scales the map without intercepting browser zoom with `Ctrl`/`Cmd`; keys `+`, `-`,
`0`, `Esc` and `Enter` duplicate the main actions.

Transitions differ not only in color:

- navigation — solid directional line;
- error — dotted line;
- redirect — dashed line;
- return - reverse bend;
- external — double line.

The detailed format and verification rules are described in
[screen guide](../guides/screens.md).

## Playable scenarios and hotspots

The Play tab on the `use-cases/UC-*.html` page begins with the use case's
`Start screen` and suggests transitions of this scenario and global
transitions. When selecting the viewer action:

1. adds the current step to history;
2. opens the target screen and status;
3. shows an error code or message;
4. Updates the step number and available actions.

`Back` returns to the previous step, and `Start over` clears the history. On a terminal screen
the individual actions “Start over”, “Show map” and
“Open use case.” The map opens on the `#map` tab, and the description opens on
`#overview`.

Hotspots are stored in `screens/hotspots.json` as a percentage. Hidden area
appears on hover or keyboard focus; switch shows everything
zones constantly. Even without an image or a valid hotspot remains accessible
text list of actions.

## Work tasks

`TASK-*` and `BUG-*` support states from draft to completed or
cancellations, common dependencies, scope, criteria and checks. Additional bugs
record severity, priority, reproducibility, regression, symptom,
expected and actual behavior, evidence and regression testing.

`task context` does not execute commands and returns only those relevant to the task
modules, use cases, screens, transitions, rules, dependencies and diagnostics.

`task verify --run` first applies the task-local validation gate, then
sequentially runs the unique commands `AC-*`, `ALL` and `DOCS` from
repository root. The error of one team does not hide the results of the others.
Timeout terminates the process tree and stdout and stderr are kept limited
tail.

The full format is given in
[work task manual](../guides/work-items.md).

## JSON and automation

`check --format json` and `report.json` use pure schema v1 and contain:

- information about the generator, project, current status and statistics;
- documents, resolved links, backlinks and related documents;
- roadmap, risks, modules, use cases, business rules and work items;
- screens, transitions, playable flows, hotspots and error definitions;
- typed flows and two-way communications `UC ↔ FLOW`;
- traceability matrix and diagnostics.

`task context` and other task reports use schema v1 with the `kind` field.
The contract evolves directly into v1 without a parallel version of the schema.

## Security and resiliency

- the scanner does not follow Markdown symlinks;
- dangerous URL schemes and active HTML, SVG, XML and JavaScript assets are blocked;
- preview allows only local PNG, JPG, JPEG, WEBP, AVIF and GIF;
- repository links and task scope cannot go beyond `repository-root`;
- `--clean` checks expanded paths and protects input, its ancestors, system
  root and output symlinks;
- regular `serve` routes only distribute output, and the editor API is limited
  canonical workspace paths inside docs root; listener listens to loopback
  default and does not use caching;
- manual rebuilding in `serve` accepts only the service `POST` with an action
  header; static build contains neither the button nor the endpoint;
- an error in a particular Screen Map or playing script does not deprive access to the rest
  documentation;
- editor writes require JSON/action/same-origin guards, limits 3 MiB/2 MiB and not
  get CORS; with a non-loopback listener, direct LAN clients are considered
  trusted;
- regular `check`, `build`, `serve`, editor API and `task context` never execute
  commands from Markdown.

## Restrictions

Docu-docu is not a web-based CMS, collaborative editor, or runtime
product. Live workspace exists only inside the `serve` process, does not store
server base, does not execute step viewer API requests and does not import
interfaces from Figma or frontend code.
