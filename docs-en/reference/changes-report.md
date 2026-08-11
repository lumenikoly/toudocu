# ChangeSetReport schema v1

`toudocu changes --format json` returns a reproducible report with
`schemaVersion: 1`. It contains repository and branch state, `HEAD`, the dirty
flag, resolved range endpoints, `changeSetDigest`, file/line/entity/class
summaries, `changes[]`, task impact, and diagnostics.

## One changed file

`DocumentationChange` contains:

- `status`, `path`, previous `oldPath`, and
  `staged`/`unstaged`/`untracked` flags;
- added and removed line counts, binary state, and sizes;
- file classification and known entities before and after;
- available views and their diagnostics;
- the exact Git patch in `sourceDiff` and separate `sourceDiffHunks`;
- rendered-section, semantic, and relationship changes;
- asset, screen, OpenAPI, and Mermaid data when applicable.

Each patch hunk has an ID stable within the current report, a header, old and
new ranges, and its own text. The complete `sourceDiff` remains authoritative.

## Markdown and assets

`renderedSections` matches sections by Markdown anchor. Its states are
`added-section`, `removed-section`, `modified-section`, `moved-section`, and
`unchanged-section`. This compares Markdown structure, not arbitrary DOM.

Image data includes MIME type, width, height, aspect ratio, and transparency
when Toudocu can determine it. Work documents use `work-artifact`; permanent
documentation uses `permanent-documentation`; contracts and assets have their
own classifications.

`SemanticChange` contains its kind, entity, field, before and after values,
summary, source locations, and optional OpenAPI compatibility. A relationship
uses `relation-added` or `relation-removed` and records both endpoints.

OpenAPI paths are stable, for example
`POST /login.parameters.header:client` and
`components.schemas.Login.properties.role.enum`. CI can select a specific
incompatible change without parsing its prose summary.

For `SC-*`, `screen` stores before and after screen data and transitions with
old and new endpoints, actions, conditions, and states. Removed entities remain
as old-side data so the screen map can display them.

`mermaidBlocks` contains the identifier, state, caption, source before and
after, and locations. Failure on one side does not hide the other side's
source. Toudocu compares diagram text, not rendered pixels.

## Common diagnostic codes

- Git: `git-repository-not-found`, `git-command-failed`,
  `git-base-not-found`, `git-target-not-found`,
  `git-merge-base-not-found`, `git-binary-diff-unavailable`;
- files: `change-file-too-large`, `change-old-version-missing`,
  `change-new-version-missing`;
- specialized views: `semantic-old-version-invalid`,
  `semantic-new-version-invalid`, `mermaid-old-version-invalid`,
  `mermaid-new-version-invalid`, `rendered-old-version-failed`,
  `rendered-new-version-failed`, `openapi-old-version-invalid`,
  `openapi-new-version-invalid`, `openapi-breaking-change`;
- tasks and relationships: `declared-document-not-changed`,
  `declared-document-not-created`, `undeclared-document-change`,
  `undeclared-document-created`, `deleted-entity-still-referenced`.

`changeSetDigest` identifies cached data and live-page invalidation. It is not
an independent Toudocu history of document contents.
