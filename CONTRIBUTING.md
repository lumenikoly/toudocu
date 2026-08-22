# Contributing to Toudocu

[Русский](CONTRIBUTING.ru.md)

Keep changes small, evidence-backed, and easy to review. Toudocu is a Go CLI
that ships as one executable; browser tooling may be needed to build embedded
assets, but it must not become a user runtime dependency.

## Before you change code

- Read [STD-GO-001](docs-en/quality/STD-GO-001.md) for Go rules and the normal
  verification cycle.
- Read [STD-DOCS-001](docs-en/quality/STD-DOCS-001.md) when behavior,
  contracts, documentation, or generated portal content may change.
- Use the existing architecture, module, contract, and work-item documents to
  find the intended boundary before adding a new abstraction.
- Do not edit `internal/site/assets/generated/` as source. Change
  `web/` and rebuild the assets.

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
make fmt
make fmt-check
make lint
make test
make web
make web-check
make browser-test
make check
```

Run `make lint` as the local Go quality check before the normal repository-wide
`make check` cycle. Browser-facing changes also use `make browser-test`.
Release changes use `make release`
only when release artifacts are part of the work.

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
- whether public CLI, JSON, HTTP, or Go contracts changed;
- which documentation was updated;
- which verification commands were run.

Avoid heavy frameworks and hidden runtime dependencies. Prefer the smallest
change that preserves path safety, data integrity, accessibility, and the
published contracts.
