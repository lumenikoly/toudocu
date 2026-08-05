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

Select canonical Markdown changes, including `work/**`, `notes.md`, and
`ideas.md`, so the target has the same reader-facing file set as the canonical
root. Exclude only `generated/**` and `cache/**`. Work items in a translation
root are read-only mirrors: preserve every executable command and non-localized
contract value byte-for-byte, and never use the target for task context,
readiness, verification, moves, changes, scaffold, or editor writes. Localize
structural metadata only under the semantic-parity rule below. Copy selected
binary assets byte-for-byte without reading them as text. Handle add, modify,
rename, and delete: rename the target and manifest key; deletion may remove only
a path inside the target root. For `--all-stale`, compare source/target relative
paths and SHA-256 digests, update only missing or stale files, and report (never
delete) orphan target files.

Process one source/target pair at a time. Give the translator only the source,
the available exact source diff, existing target, and these rules. Translate
reader-facing prose; preserve IDs, commands, paths, URLs, anchors, code fences,
and Mermaid/OpenAPI syntax. A metadata key may use a recognized target-locale
alias. An enum or status value may be localized only when its normalized semantic
value remains unchanged. Compare normalized values, never lexical similarity:
`Готово` has `status.kind=done` and translates to `Completed` or `Done`, never
`Ready`; `Готово к работе` has `status.kind=planned` and translates to `Ready`.
Do not read other target-locale files for general context. For parity discovery,
compare relative paths, manifest source digests, and structural reports before
opening content; then open only the selected source/target pair needed for the
current translation or repair.

Maintain `.docu-docu/translations/<locale>.json` as a map of canonical relative
paths to SHA-256 source digests. Before writing it, run strict JSON checks for
both the canonical and target roots. For matching relative paths, compare
`documents[].type` and `documents[].status.kind`; also compare
`project.status.kind`, roadmap stage `status.kind`, and every roadmap item's
`effectiveCompleted`, `completionSource`, and target `status.kind`. Localized
labels and prose need not match. Any semantic mismatch blocks the manifest
update and must be reported as `TRANSLATION_SEMANTIC_MISMATCH`.

Do not write or update the manifest until this semantic comparison passes and
one final:

```bash
docu-docu check <target-root> --repository-root . --strict
```

passes. If it fails, leave translated file edits in the worktree, leave the
manifest unchanged, and report `TRANSLATION_CHECK_FAILED`. Report invalid
selection as `TRANSLATION_MODE_INVALID`, `TRANSLATION_LOCALE_INVALID`,
`TRANSLATION_PROFILE_INVALID`, `TRANSLATION_PROFILE_INCOMPLETE`, or
`TRANSLATION_ROOT_COLLISION` as applicable.
