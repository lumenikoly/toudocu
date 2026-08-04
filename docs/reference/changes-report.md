# ChangeSetReport schema v1

`docu-docu changes --format json` возвращает детерминированный отчёт с
`schemaVersion`, repository/branch/HEAD/dirty, resolved base/target,
`changeSetDigest`, file/line/entity/classification summary, `changes[]`, task
impact и diagnostics.

`DocumentationChange` содержит status/path/oldPath, staged/unstaged/untracked,
line stats, binary и byte sizes, classification, old/new entities, доступность
представлений, точный Git patch, `sourceDiffHunks`, `renderedSections`,
semantic/relation changes, asset metadata и diagnostics. Каждый hunk содержит
стабильный ID для текущего patch, header, old/new ranges и собственный фрагмент
patch. `SourceDiff` остаётся авторитетным полным текстом Git diff.

`renderedSections` содержит structural match по Markdown anchor: состояние
`added-section`, `removed-section`, `modified-section`, `moved-section` или
`unchanged-section`, anchors обеих сторон и source locations. Это проекция
структуры Markdown, а не произвольный DOM diff. Asset metadata содержит MIME,
dimensions, aspect ratio и доступный признак transparency. Рабочие
артефакты используют `work-artifact` и не смешиваются с
`permanent-documentation`; contracts и assets имеют свои classifications.

`SemanticChange` содержит kind, entity/subject, field, before/after, summary,
source locations и optional OpenAPI compatibility. Relation changes имеют
`relation-added` или `relation-removed` и обе стороны ребра.

OpenAPI fields используют стабильные пути, например
`POST /login.parameters.header:client`,
`POST /login.responses.200.headers.X-Request-ID` и
`components.schemas.Login.properties.role.enum`. Это позволяет CI выбирать
конкретный breaking change без разбора текста summary.

Для `SC-*` поле `screen` хранит node snapshots до/после и изменённые
transitions с endpoints, action/condition и состоянием added/modified/removed.
Удалённая сторона остаётся в отчёте как ghost data для Screen Map.

`mermaidBlocks` содержит ID, status, caption, исходники before/after и source
locations. Отдельные diagnostics `mermaid-old-version-invalid` и
`mermaid-new-version-invalid` не скрывают доступный исходник другой стороны.
Это исходниковое before/after представление; Docu-docu намеренно не строит
pixel-level image diff.

Основные codes: `git-repository-not-found`, `git-command-failed`,
`git-base-not-found`, `git-target-not-found`, `git-merge-base-not-found`,
`git-binary-diff-unavailable`, `change-file-too-large`,
`change-old-version-missing`, `change-new-version-missing`,
`semantic-old-version-invalid`, `semantic-new-version-invalid`,
`mermaid-old-version-invalid`, `mermaid-new-version-invalid`,
`rendered-old-version-failed`, `rendered-new-version-failed`,
`openapi-old-version-invalid`, `openapi-new-version-invalid`,
`openapi-breaking-change`, `declared-document-not-changed`,
`declared-document-not-created`,
`undeclared-document-change`, `undeclared-document-created` и
`deleted-entity-still-referenced`.

Digest служит cache identity и live invalidation, но не является собственной
историей Docu-docu.
