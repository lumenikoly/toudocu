# Migrate documentation from v1 to v2

Use this guide only for `DOCS_MIGRATION_REQUIRED` with
`Migration: v1-to-v2`. A missing `documentationVersion` and an explicit value
of `1` both select v1.

## Target contract

Version 2 stores machine-readable document metadata, semantic section kinds,
and typed-table schemas in exact Toudocu annotations. Reader-facing headings
and prose remain in the project language. The canonical configuration declares:

```yaml
documentationVersion: 2
```

## Transformation rules

1. Work only in the canonical documentation root. Do not read or change a
   configured translation root unless the user explicitly requested that
   locale operation.
2. Inventory typed source documents and preserve files that already use valid
   v2 annotations. Do not rewrite free-form prose merely because the project is
   being migrated.
3. Move recognized document metadata from the list below the H1 into one
   `<!-- toudocu ... -->` block before the H1. Use exact current field names
   and the current contract described in
   [document-model.md](../document-model.md),
   [work-item-model.md](../work-item-model.md), and
   [screen-model.md](../screen-model.md). Remove a legacy metadata line only
   after its value is represented in the annotation.
4. Convert only unambiguous localized enum aliases to their canonical values.
   Examples include work-item statuses `draft`, `ready`, `in-progress`,
   `blocked`, `done`, and `cancelled`; work-item types `feature`, `bug`,
   `maintenance`, `documentation`, and `research`; and explicit booleans to
   `true` or `false`.
5. Add `<!-- toudocu:section <kind> -->` immediately before a heading only when
   the heading's role is established by the v1 typed-document contract or
   project evidence. Add `<!-- toudocu:table <kind> columns=... -->` only when
   the table's existing columns map unambiguously to the current typed-table
   contract.
6. Preserve IDs, relationships, dates, paths, links, criteria, checkbox state,
   verification commands, headings, and unrelated prose. Do not add a missing
   value or reinterpret a custom section merely to satisfy v2.
7. After transforming all supported canonical sources, set the root
   `.toudocu/config.yml` field to `documentationVersion: 2`. This selects the
   expected parser contract; it does not claim that validation has passed.

If a required value or section meaning cannot be established from the source,
repository context, or another authoritative artifact, leave it unresolved and
request an explicit user decision. Do not implement migration semantics in the
CLI.

## Verify

Run the current parser only after setting the target version:

```bash
toudocu check <docs-root> --repository-root <repository-root>
```

Fix errors caused by the v1-to-v2 transformation and repeat the same check.
The migration is complete only when the ordinary check passes.
