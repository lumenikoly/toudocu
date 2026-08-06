# ChangeSetReport schema v1

`docu-docu changes --format json` returns a deterministic report with
`schemaVersion`, repository/branch/HEAD/dirty, resolved base/target,
`changeSetDigest`, file/line/entity/classification summary, `changes[]`, task
impact and diagnostics.

`DocumentationChange` contains status/path/oldPath, staged/unstaged/untracked,
line stats, binary and byte sizes, classification, old/new entities, availability
submissions, exact Git patch, `sourceDiffHunks`, `renderedSections`,
semantic/relation changes, asset metadata and diagnostics. Each hunk contains
stable ID for current patch, header, old/new ranges and own fragment
patch. `SourceDiff` remains the authoritative full text of the Git diff.

`renderedSections` contains structural match by Markdown anchor: state
`added-section`, `removed-section`, `modified-section`, `moved-section` or
`unchanged-section`, anchors of both sides and source locations. This is a projection
Markdown structures, not arbitrary DOM diff. Asset metadata contains MIME,
dimensions, aspect ratio and available transparency feature. Workers
artifacts use `work-artifact` and do not mix with
`permanent-documentation`; contracts and assets have their own classifications.

`SemanticChange` contains kind, entity/subject, field, before/after, summary,
source locations and optional OpenAPI compatibility. Relation changes have
`relation-added` or `relation-removed` and both sides of the edge.

OpenAPI fields use stable paths, for example
`POST /login.parameters.header:client`,
`POST /login.responses.200.headers.X-Request-ID` and
`components.schemas.Login.properties.role.enum`. This allows CI to choose
specific breaking change without parsing the text summary.

For `SC-*`, the `screen` field stores node snapshots before/after and changed
transitions with endpoints, action/condition and added/modified/removed state.
The remote party remains in the report as ghost data for the Screen Map.

`mermaidBlocks` contains ID, status, caption, before/after and source
locations. Individual diagnostics `mermaid-old-version-invalid` and
`mermaid-new-version-invalid` does not hide the other party's available source code.
This is the source before/after representation; Docu-docu does not intentionally build
pixel-level image diff.

Basic codes: `git-repository-not-found`, `git-command-failed`,
`git-base-not-found`, `git-target-not-found`, `git-merge-base-not-found`,
`git-binary-diff-unavailable`, `change-file-too-large`,
`change-old-version-missing`, `change-new-version-missing`,
`semantic-old-version-invalid`, `semantic-new-version-invalid`,
`mermaid-old-version-invalid`, `mermaid-new-version-invalid`,
`rendered-old-version-failed`, `rendered-new-version-failed`,
`openapi-old-version-invalid`, `openapi-new-version-invalid`,
`openapi-breaking-change`, `declared-document-not-changed`,
`declared-document-not-created`,
`undeclared-document-change`, `undeclared-document-created` and
`deleted-entity-still-referenced`.

Digest serves as cache identity and live invalidation, but is not its own
history of Docu-docu.