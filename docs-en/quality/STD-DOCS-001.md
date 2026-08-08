# STD-DOCS-001: Verifiable documentation

- Identifier: STD-DOCS-001
- Status: Active
- Owner: Docu-docu Team
- Scope: Source documentation, skill templates, and generated portals
- Last updated: 2026-08-07

This standard separates confirmed sources from local or generated views.
Markdown remains the source of the document model; explicitly recognized
OpenAPI may own only the HTTP wire contract.

## Rules

1. Global scope is defined by `roadmap.md`; the state of an explicitly linked
   `UC-*` comes from its use case. Other local checklists are not aggregated.
2. Generated `build/`, `dist/`, `example/site/`, `project-docs/`, and
   `example/project-docs/` are local or CI artifacts, are not tracked by Git,
   and are not edited as sources of truth.
3. Published portals are rebuilt from Markdown in CI after semantic review and
   a structural check; local checks use ignored or temporary output.
4. A typed document is created only for confirmed semantics; an unknown owner,
   date, status, or procedure is not invented merely to remove a warning.
5. Explicitly linked standards and runbooks are read together with task
   context; the author checks the scope of other applicable standards without
   CLI glob heuristics.
6. `docs/runbooks/` is created only when a real operational procedure exists.
7. `docs/architecture/overview.md` is the required map; every other Markdown
   file under `architecture/` answers one explicit architectural question and
   is listed by a direct link from the overview.
8. FLOW, CONTRACT, REFERENCE, RUNBOOK, ADR, and MODULE details remain in their
   corresponding sources of truth, while the semantic gate checks architectural
   form and meaning under `ARCH001`–`ARCH013`.
9. `$docu-docu refresh` and `$docu-docu refresh diff` update source
   documentation only from current repository evidence; dates change together
   with content or relationships, and `Last verified` requires an actual
   runbook verification.
10. A root `CHANGELOG.md`, when present, is the sole special source of release
    changes. It must not be duplicated in `docs/changelog.md`: such a file
    remains an ordinary Markdown document. Do not create a root changelog only
    for a portal tab.
11. `contracts/**/*.openapi.{yaml,yml,json}` owns HTTP paths, methods,
    parameters, headers, statuses, media types, examples, and JSON schemas. Its
    Markdown companion does not repeat them and records behavior, security,
    filesystem, and trust-boundary invariants. External `$ref` values are not
    loaded.

## Automated checks

- `go run ./cmd/docu-docu check ./docs --strict --stale-days 0`;
- template-integrity and public JSON-schema tests;
- tests for links, stable IDs, task context, and portal navigation.

Commands are run from a work item or trusted CI workflow, not directly from
this standard.
