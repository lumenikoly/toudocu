# Viewing documentation changes

Docu-docu uses Git as the sole source of the old and new versions. It does not
create snapshots, fetch, or modify history, refs, the index, or the working
tree. The section is available only in `serve` at `/changes/`; a regular
`build` remains a self-contained view of current documentation and requires no
Git history.

## Comparison modes

By default, `HEAD → working-tree` includes staged and unstaged changes,
deletions, and untracked files. Other available comparisons are `HEAD → index`,
revision → revision, revision → working-tree, and
`merge-base(base-ref, HEAD) → working-tree` through `--branch-base`. The base,
target, resolved commit, branch, and dirty state are always visible. Docu-docu
does not load remote refs or guess an ambiguous base.

## Three diff levels

`Source` is a Git unified patch without external diff or textconv. The unified
view shows old/new line numbers, transitions, copies, and deep links to hunks;
the complete patch can be copied separately. `Side by side` uses a read-only
CodeMirror MergeView over the contents of both Git sides. Binary and oversized
files receive a diagnostic without blocking the change set.

`Before and after` passes both Markdown versions through the portal's safe
renderer. A new or deleted side is explicitly absent. Changed Markdown sections
are matched by anchor and marked as added/removed/modified/moved; this is not a
DOM diff. A Mermaid error on one side does not hide the other.

`Semantics` deterministically compares normalized metadata, sections, task
criteria, stable `BR-*`, `INV-*`, `TR-*`, and relations without an LLM. Changes
preserve old/new values and source locations. Whitespace and formatting that do
not change the project model are ignored. A parsing error disables only the
semantic view.

## Specialized views

- OpenAPI is compared by info/servers/tags/webhooks, operations, parameters,
  request body, responses and headers, security schemes/alternatives, schemas,
  properties, required fields, and enum, with `breaking`,
  `potentially-breaking`, `non-breaking`, or `informational` compatibility. For
  example, a new required parameter or request body, a removed security
  alternative, a removed schema property, and a narrowed enum are breaking; a
  new optional property is non-breaking; client-dependent cases remain
  potentially-breaking;
- Mermaid blocks are matched by `%% id: <stable-id>` or by section and order,
  rendered independently before and after, and shown with a source-line diff.
  Zoom, pan, and fullscreen are available for large diagrams. When matching is
  ambiguous, the report returns `mermaid-block-match-ambiguous`; a structurally
  unrecognized old or new side receives a separate diagnostic;
- PNG, JPEG, WebP, and SVG are shown side by side with byte sizes, dimensions,
  and aspect ratio; an overlay slider is available for two raster sides;
- SC/TR provide a change overlay on the main map, added/modified/removed
  filters, and a JSON screen-map diff with old-side ghost entities.

## CLI and CI

```bash
docu-docu changes ./docs --format text
docu-docu changes ./docs --base main --target working-tree --format json
docu-docu changes ./docs --branch-base main --format markdown
docu-docu changes ./docs --status modified --module MOD-AUTH --type use-case
docu-docu changes ./docs --permanent-only --format json
docu-docu changes file docs/modules/MOD-AUTH.md --base HEAD --target index
docu-docu task changes TASK-AUTH-015 ./docs --format json
```

CLI filters are applied to an already built change set:

| Flag | Selection |
|---|---|
| `--status STATUS` | exact `added`, `untracked`, `modified`, `deleted`, or `renamed` state |
| `--module VALUE` | match by path, entity ID/name, or semantic summary |
| `--type TYPE` | normalized entity type, such as `module`, `use-case`, `flow`, `screen`, or `task` |
| `--permanent-only` | only the `permanent-documentation` classification, excluding work artifacts, contracts, and assets |

Filters can be combined. Text, JSON, and Markdown receive the same filtered
summary; `-o FILE` writes the selected format to a separate file.

Exit code `1` means a report was built with an error, `2` means an invalid
range, `3` means Git is unavailable/not found, and `4` means an internal error.

The `$docu-docu translate` workflow uses this report only as input: the skill's
`--task` parameter invokes canonical `task changes` through `working-tree`,
while `--base` invokes `<base> → working-tree`. Its API-only override includes
assets even when `changes.includeAssets: false`; the `ChangeSetReport` schema
remains v1. The exact `sourceDiff` retains priority and remains available when
rendered, semantic, OpenAPI, or Mermaid views add their own diagnostics.

## Task impact

A `TASK-*` change is separated as a task contract from permanent documentation.
Explicit `Documentation impact` paths are matched against the Git change set. A
warning about an undeclared, unchanged, or declared-but-not-created document
requires review, but does not by itself prove an implementation error or block
completion.

See the [HTTP contract](../contracts/changes-http.md),
[JSON report](../reference/changes-report.md), and
[Git snapshot architecture](../architecture/documentation-changes.md).
