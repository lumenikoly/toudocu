# Viewing changes

Toudocu reads both file versions from the local Git repository. It does not
fetch, switch branches, or change history, refs, the index, or working files.
The interactive workspace exists only in `serve`; regular `build` output is
static and does not depend on Git history.

## Complete journey in the local portal

1. From the repository root, run:

   ```bash
   toudocu serve ./docs
   ```

2. Open the printed address and go to Changes. Its direct path is `/changes/`.
3. Keep `HEAD → working-tree` to review every current local change. For another
   comparison, open the range control and choose both ends explicitly.
4. Find a file by name or narrow the list by status, scope, and file kind. The
   kind filter can show all files, documentation only, or other repository
   files only.
5. Select a file and start with Diff, the exact Git patch. Open Full file when
   you need context beyond the changed lines.
6. For Markdown, open Before and after, Semantics, or Relationships when useful.
   OpenAPI, Mermaid, asset, and screen-map tabs appear only for matching files.
7. To discuss documentation with an agent, create a question or change request
   and follow the
   [agent feedback scenario](../use-cases/UC-AGENT-FEEDBACK-01.md).

## What is compared

The default `HEAD → working-tree` range includes staged and unstaged edits,
deletions, and new files. You can also compare:

- `HEAD` with the index;
- one local commit or ref with another;
- a commit with the working tree;
- the merge base of a selected branch and `HEAD` with the working tree, using
  `--branch-base`.

The workspace shows both the values entered by the user and the local Git refs
they resolved to. Toudocu does not fetch remote branches. If a required ref is
not available locally, retrieve it with ordinary Git first.

For a nested project, `--repository-root` selects the directory containing its
`.toudocu/config.yml`. Paths in `changes.exclude` are relative to that
directory.

## File views

| View | Use it when | What it shows |
|---|---|---|
| Diff | You need the exact edit | The Git patch with old and new line numbers. You can switch between unified and side-by-side layouts, move between hunks, and copy the patch |
| Full file | You need the surrounding context | The current full UTF-8 text file, or the old version for a deleted file. A selection can be copied or commented on |
| Before and after | You need the rendered Markdown result | Safely rendered old and new versions, with added, removed, changed, and moved sections identified |
| Semantics | Known fields or structure changed | Differences in headings, metadata, task criteria, rules, transitions, and relationships. Formatting-only changes are omitted |
| Relationships | The document refers to other known entities | Added and removed relationships between known documents |

If one Markdown side cannot be parsed, Diff still works and the error stays in
the optional view. A binary or oversized file receives a clear diagnostic and
available size information instead of an attempted text rendering.

Specialized views add more detail:

- OpenAPI compares operations, parameters, request bodies, responses, schemas,
  and security settings. It marks potentially incompatible changes, but the
  developer makes the final compatibility decision.
- Mermaid matches blocks by `%% id: <stable-id>` or by section and order,
  renders both sides independently, and shows a source-text diff.
- PNG, JPEG, WebP, and SVG appear side by side with size and dimensions. Two
  raster images can be overlaid with a slider.
- `SC-*` and `TR-*` changes appear on the screen map, including removed
  entities from the old side.

## Terminal and CI reports

Common examples:

```bash
toudocu changes ./docs --format text
toudocu changes ./docs --base main --target working-tree --format json
toudocu changes ./docs --branch-base main --format markdown
toudocu changes file docs/modules/MOD-AUTH.md --base HEAD --target index
toudocu task changes TASK-AUTH-015 ./docs --format json
```

After Toudocu builds the report, these flags can narrow it:

| Flag | What remains |
|---|---|
| `--status STATUS` | Files in `added`, `untracked`, `modified`, `deleted`, or `renamed` state |
| `--module VALUE` | Paths, entities, or descriptions matching the module value |
| `--type TYPE` | Entities of a selected kind, such as `module`, `use-case`, `flow`, `screen`, or `task` |
| `--permanent-only` | Permanent project documentation, excluding work items, contracts, and assets |
| `--include-assets` | Binary assets even when `changes.includeAssets` disables them |
| `--translation-input` | Reader-facing Markdown, work items, and assets required by the translation workflow |

Filters can be combined. `text`, `json`, and `markdown` use the same filtered
result; `-o FILE` writes it to a file.

Exit codes are:

- `0` — the report was built without errors;
- `1` — the report was built but contains an analysis error;
- `2` — the Git range is invalid;
- `3` — Git is unavailable or no repository was found;
- `4` — an internal Toudocu error.

## Changes declared by a task

The Documentation impact field in a `TASK-*` lists files the task promises to
change. This command compares that list with the current Git diff:

```bash
toudocu task changes TASK-AUTH-015 ./docs
```

It warns about an undeclared changed file, a declared but unchanged file, or a
document that was promised but never created. These are reasons to review the
task and diff, not automatic proof that the implementation is wrong.

The `$toudocu translate` workflow consumes the same report without changing its
schema. The exact Git patch remains the primary source; rendered and semantic
views only make it easier to understand.

Exact HTTP and JSON fields are defined in the
[HTTP contract](../contracts/changes-http.md) and
[report reference](../reference/changes-report.md). Git read boundaries are in
the [architecture document](../architecture/documentation-changes.md).
