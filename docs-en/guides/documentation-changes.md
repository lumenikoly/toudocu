# View documentation changes

Docu-docu uses Git as the sole source of the old and new version. He doesn't
creates snapshots, does not fetch or modify history, refs, index or
working tree. The section is only available in `serve` at `/changes/`; regular
`build` remains a standalone representation of the current documentation and does not require
Git history.

## Comparison modes

By default, `HEAD → working-tree` includes staged, unstaged, delete, and
untracked files. Also available `HEAD → index`, revision → revision, revision →
working-tree and `merge-base(base-ref, HEAD) → working-tree` via
`--branch-base`. Base, target, resolved commit, branch and dirty state are always
visible. Docu-docu does not load remote refs and does not guess an ambiguous base.

## Three levels of diff

`Исходник` - Git unified patch without external diff and textconv. Unified view
shows old/new line numbers, transitions, copying and deep links for hunks;
The full patch can be copied separately. `Side by side` uses read-only
CodeMirror MergeView over the content of both Git sides. Binary and too big
files receive diagnostic without blocking change set.

`До и после` passes both versions of Markdown through the portal's secure renderer.
The new or deleted side is clearly missing. Changed Markdown sections
matched by anchor and marked as added/removed/modified/moved; it's not
DOM diff. Mermaid's mistake on one side does not hide the other.

`Семантика` compares normalized metadata, sections, task criteria,
stable `BR-*`, `INV-*`, `TR-*` and relations deterministically, without LLM.
Changes preserve old/new and source locations. Spaces and formatting without
changes to the project model are ignored. Parsing error only disables semantic
view.

## Specialized views

- OpenAPI is compared by info/servers/tags/webhooks, operations, parameters,
  request body, responses and headers, security schemes/alternatives, schemas,
  properties, required fields and enum with `breaking`, `potentially-breaking`,
  `non-breaking` or `informational` compatibility. For example, new required
  parameter or request body, remote security alternative, remote schema
  property and narrowed enum - breaking; new optional property - non-breaking;
  client-dependent cases remain potentially-breaking;
- Mermaid blocks are matched by `%% id: <stable-id>` or by section and
  order, are rendered independently before and after and show source line diff.
  For large schemes zoom, pan and fullscreen are available. When ambiguous
  when compared, report returns `mermaid-block-match-ambiguous`; structurally
  the unrecognized old or new side receives a separate diagnostic;
- PNG, JPEG, WebP and SVG are shown next to byte sizes, dimensions and aspect
  ratio; an overlay slider is available for two raster sides;
- SC/TR give change overlay on the main map, filters added/modified/removed
  and JSON screen-map diff with old-side ghost entities.

## CLI and CI

```bash
docu-docu changes ./docs --format text
docu-docu changes ./docs --base main --target working-tree --format json
docu-docu changes ./docs --branch-base main --format markdown
docu-docu changes file docs/modules/MOD-AUTH.md --base HEAD --target index
docu-docu task changes TASK-AUTH-015 ./docs --format json
```

Exit code `1` means a report was built with error, `2` is an incorrect range, `3`
- Git unavailable/not found, `4` - internal error.

Workflow `$docu-docu translate` uses this report only as input
data: skill parameter `--task` calls canonical `task changes` to
`working-tree`, and `--base` -
`<base> → working-tree`. Its API-only override includes assets even if
`changes.includeAssets: false`; schema `ChangeSetReport` remains v1.
The exact `sourceDiff` remains in priority and is available when rendered,
semantic, OpenAPI or Mermaid views add their own diagnostics.

## Task impact

The `TASK-*` change is separated as a task contract from the permanent documentation.
Explicit `Влияние на документацию` paths are mapped to the Git change set. Warning
about an undeclared, unmodified or declared but not created document requires review, but does not itself
proves an implementation error and does not block completion.

See [HTTP contract](../contracts/changes-http.md),
[JSON report](../reference/changes-report.md) and
[architecture Git snapshots](../architecture/documentation-changes.md).