# Contributing to Toudocu

[Русский](CONTRIBUTING.ru.md)

Keep changes small, evidence-backed, and easy to review. Toudocu is a strict
TypeScript CLI and React application running on Node.js 24+.

## Before you change code

- Read [STD-TS-001](docs/quality/STD-TS-001.md) for TypeScript rules and the normal
  verification cycle.
- Read [STD-DOCS-001](docs/quality/STD-DOCS-001.md) when behavior,
  contracts, documentation, or generated portal content may change.
- Use the existing architecture, module, contract, and work-item documents to
  find the intended boundary before adding a new abstraction.
- Keep framework-independent semantics in `packages/core`, I/O in
  `packages/platform-node`, HTTP in `packages/server`, and UI in `apps/web`.

## Development workflow

1. Create a small branch with one clear purpose.
2. Change the implementation and the narrowest relevant tests.
3. Update source documentation when observable behavior, a command, an API,
   configuration, or a user journey changes.
4. Run the checks required by the affected standard.
5. In the pull request, describe the observable result, important limits, and
   the commands used for verification.

## Common commands

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm test:browser
pnpm build
pnpm check
```

Use `pnpm check` for the repository-wide quality cycle. Browser-facing changes
also use `pnpm test:browser`. Release changes use `pnpm release:package` and
`pnpm release:smoke -- PATH_TO_TGZ` only when artifacts are part of the work.

## Documentation rules

- Edit canonical Russian sources in `docs/`. Update `docs-en/`
  only through an explicit English translation workflow.
- Keep generated portals derived from Markdown; do not hand-edit them.
- State missing or unimplemented behavior directly.
- Do not add a runbook unless a real operational procedure exists.
- A successful structural check does not replace semantic review.

## Pull requests

A pull request should explain:

- what a user or integrator can observe after the change;
- what deliberately remains out of scope;
- whether public CLI, JSON, or HTTP contracts changed;
- which documentation was updated;
- which verification commands were run.

Avoid heavy frameworks and hidden runtime dependencies. Prefer the smallest
change that preserves path safety, data integrity, accessibility, and the
published contracts.
