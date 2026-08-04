# Migration from the Node.js implementation

The permanent-document Markdown format and primary CLI flags are compatible. Work items must be migrated from multi-task files such as `work/current.md` to one `work/TASK-*.md` file per task. Drafts require only status, type, and a result. Tasks in `Готово к работе` or a later status require scope, acceptance criteria, verification commands, a plan, and documentation impact.

## Command replacement

```text
node project-docs.js ./docs --output ./build/project-docs --clean
```

becomes:

```text
docgent build ./docs --output ./build/project-docs --clean
```

The backwards-compatible form also works:

```text
docgent ./docs --output ./build/project-docs --clean
```

## New commands

```bash
docgent init ./docs
docgent check ./docs --strict
docgent task context TASK-AREA-001 ./docs --format json
docgent task check TASK-AREA-001 ./docs --format json
docgent version
```

## Behaviour retained

- project dashboard and roadmap-only global progress;
- document-local checklist progress;
- modules, use cases, business rules and work items;
- risks, ADRs and repository mappings;
- safe Markdown rendering;
- local and repository link validation;
- static search, filters and `report.json`;
- strict exit codes for CI.

## Work-item migration

Use `docgent init` as the canonical example. The validator now rejects:

- multiple `TASK-*` headings in one work document;
- task checkboxes outside `Критерии приёмки`;
- non-draft criteria without unique `AC-*` identifiers or verification commands;
- completed tasks with unchecked criteria;
- blocked or cancelled tasks without their required reason section;
- roadmap checkboxes without stable use-case, contract, or `DLV-*` identifiers.

For linked `UC-*` items, roadmap completion is now derived from the use-case status. The source checkbox is retained but ignored for progress. `CON-*` and `DLV-*` remain manual.

`ProjectReport`, `TaskContextReport`, and `TaskCheckReport` expose `schemaVersion: 1`, use one-based source lines, and encode empty collections as `[]`. Verification commands are trusted code and run only through an explicit `docgent task check` invocation.

No Node.js runtime or package installation is required.
