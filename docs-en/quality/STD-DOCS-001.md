<!-- toudocu
version: 1
id: STD-DOCS-001
status: active
scope: Исходная документация, шаблоны встроенного skill и сгенерированные порталы
updated: 2026-08-12
-->

# STD-DOCS-001: Verifiable documentation


This standard separates confirmed sources from local or generated views.
Markdown remains the source of the document model; explicitly recognized
OpenAPI may own only the HTTP wire contract.

<!-- toudocu:section rules -->
## Rules

1. Global scope is defined by `roadmap.md`. An explicitly linked `UC-*` is
   complete only with a `done`-group status, at least one checkbox in the
   Acceptance criteria section, and every checkbox in that section checked.
   Checklists outside the section do not affect readiness; `CON-*`,
   `CONTRACT-*`, `DLV-*`, and `DELIVERABLE-*` retain their roadmap checkbox
   state.
2. Generated `build/`, `dist/`, and `project-docs/` directories are local or CI
   artifacts. They are not tracked by Git or edited as primary documentation.
3. Published portals are rebuilt from Markdown in CI after semantic review and
   a structural check; local checks use ignored or temporary output.
4. A typed document is created only for confirmed semantics; an unknown date,
   status, or procedure is not invented merely to remove a warning.
5. Explicitly linked standards and runbooks are read together with task
   context; the author checks the scope of other applicable standards without
   CLI glob heuristics.
6. `docs/runbooks/` is created only when a real operational procedure exists.
7. `docs/architecture/overview.md` is the required map; every other Markdown
   file under `architecture/` answers one explicit architectural question and
   is listed by a direct link from the overview.
8. FLOW, CONTRACT, REFERENCE, RUNBOOK, ADR, and MODULE details remain in their
   corresponding document types. Semantic review checks architectural form and
   meaning under `ARCH001`–`ARCH013`.
9. `$toudocu refresh` and `$toudocu refresh diff` update source
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

<!-- toudocu:section automated-checks -->
## Automated checks

- `go run ./cmd/toudocu check ./docs --strict --stale-days 0`;
- template-integrity and public JSON-schema tests;
- tests for links, stable IDs, task context, and portal navigation.

Commands are run from a work item or trusted CI workflow, not directly from
this standard.
