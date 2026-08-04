# Migration from the Node.js implementation

The Markdown format and primary CLI flags are compatible.

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

No Node.js runtime or package installation is required.
