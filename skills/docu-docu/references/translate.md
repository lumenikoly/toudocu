# Translation workflow

Use only for an explicit `$docu-docu translate <locale>` request:

```text
$docu-docu translate <locale> (--task <TASK-ID> | --base <ref> | --all-stale)
```

Exactly one mode is required. Normalize the locale, reject the canonical
`project.locale`, and use a configured `translations.<locale>` profile. A
profile has a repository-relative, independent root and all 12 built-in section
titles. Roots may not be absolute, traverse, use symlinks, overlap another
translation root, or be the canonical docs root. Use the bundled map in
`assets/locale-packs.md` for `en` and `ru`. For another valid locale, propose
the full map, obtain the titles in the request context, then save it once; do
not rewrite an existing profile.

Build the source change set with `docu-docu task changes <TASK-ID> ./docs --target
working-tree --format json`, or `docu-docu changes ./docs --base <ref> --target
working-tree --format json`. Do not fetch, checkout, stage, alter refs, or use
history beyond the resolved base. Request assets with the changes-only include
assets override, regardless of `changes.includeAssets`.

Select only canonical Markdown changes. Exclude `work/**`, `notes.md`,
`ideas.md`, `generated/**`, and `cache/**`. Copy selected binary assets
byte-for-byte without reading them as text. Handle add, modify, rename, and
delete: rename the target and manifest key; deletion may remove only a path
inside the target root. For `--all-stale`, compare source/target relative paths
and SHA-256 digests, update only missing or stale files, and report (never
delete) orphan target files.

Process one source/target pair at a time. Give the translator only the source,
the available exact source diff, existing target, and these rules. Translate
reader-facing prose; preserve IDs, metadata keys, enum/status contract values,
commands, paths, URLs, anchors, code fences, and Mermaid/OpenAPI syntax.

Maintain `.docu-docu/translations/<locale>.json` as a map of canonical relative
paths to SHA-256 source digests. Do not write or update it until one final:

```bash
docu-docu check <target-root> --repository-root . --strict
```

passes. If it fails, leave translated file edits in the worktree, leave the
manifest unchanged, and report `TRANSLATION_CHECK_FAILED`. Report invalid
selection as `TRANSLATION_MODE_INVALID`, `TRANSLATION_LOCALE_INVALID`,
`TRANSLATION_PROFILE_INVALID`, `TRANSLATION_PROFILE_INCOMPLETE`, or
`TRANSLATION_ROOT_COLLISION` as applicable.
