# STD-DOCS-001: Verifiable Documentation

- Identifier: STD-DOCS-001
- Status: Active
- Owner: Docu-docu Team
- Scope: Source documentation, skill templates and tracked portals
- Last updated: 2026-07-31

The standard keeps Markdown as the source of truth and separates proven ones.
global rules from local or generated views.

## Rules

1. Global coverage is determined by `roadmap.md`; state of the explicitly bound `UC-*`
   taken from the use case. The remaining local checklists are not aggregated.
2. Generated `build/`, `dist/`, `example/site/`, `project-docs/` and
   `example/project-docs/` are not edited as a source of truth.
3. Monitored portals are rebuilt from Markdown after semantic review and
   structural check.
4. A typed document is created only for confirmed semantics;
   unknown owner, date, status or procedure are not invented for the sake of
   lack of warning.
5. Explicitly related standards and runbooks are read along with the task context; region
   other applicable standards are checked by the author without CLI glob heuristics.
6. `docs/runbooks/` is created only if there is real operational
   procedures.
7. `docs/architecture/overview.md` is a required card; every other
   The Markdown file in `architecture/` answers one obvious architectural question
   and is added with a direct link from overview.
8. Details of FLOW, CONTRACT, REFERENCE, RUNBOOK, ADR and MODULE remain in
   corresponding sources of truth, and the semantic gate checks the architectural
   form and meaning by `ARCH001`–`ARCH013`.
9. `$docu-docu refresh` and `$docu-docu refresh diff` update the original
   documentation only for current repository evidence; dates change with
   content or relationships, and `Last verified` requires actual verification
   runbook.
10. The root `CHANGELOG.md`, if it exists, is the only one
    a special source for release changes. It cannot be duplicated in
    `docs/changelog.md`: such a file remains a regular Markdown document.
    Don't create a root log just for the portal tab.

## Automatic checks

- `go run ./cmd/docu-docu check ./docs --strict --stale-days 0`;
- integrity tests of templates and public JSON schema;
- tests of links, stable IDs, task context and portal navigation.

Commands are run from work item or trusted CI workflow, and not directly from
this standard.