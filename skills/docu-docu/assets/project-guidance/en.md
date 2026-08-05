<!-- docu-docu:project-guidance:start -->
## Docu-docu

- Use `$docu-docu` when a request explicitly concerns Docu-docu or when a change
  affects documented behavior, CLI/API/schema/config, architecture, security,
  use cases, flows, screens, roadmap, or a task contract.
- Do not use the skill for ordinary questions, code reading, formatting, or
  refactoring with no semantic documentation impact.
- Treat the canonical documentation root as the only source for ordinary
  documentation, implementation, and task context. Exclude configured
  translation roots from repository search, inventory, semantic review,
  implementation analysis, and task context, including translated work items.
  Read only the selected translation root for an explicit `$docu-docu translate
  <locale>` or an explicit request to check, find, build, run, or inspect that
  locale; limit access to the necessary source/target pair and use paths, hashes,
  and structural reports first. Do not add translation roots to ignore files.
- Use `$docu-docu refresh` for a full evidence-based review and update of
  source documentation. Use `$docu-docu refresh diff` for staged, unstaged,
  and untracked changes relative to `HEAD` plus affected documents. These are
  mutating skill workflows, not Go CLI commands or initialization.
- Create a new `TASK-*` only when the user or repository policy explicitly
  requires one, or for substantial multi-step work such as contract or
  architecture changes, migrations, cross-session or cross-owner handoffs, or
  durable acceptance criteria. Do not create a task for every prompt.
- During implementation, update an existing documentation source of truth when
  the change makes it inaccurate. Do not create documents, statuses, or
  relationships without supported semantics, and do not edit generated output
  as a source.
- Treat `docs/architecture/overview.md` as the required architecture map. Every
  other Markdown document under `architecture/` must answer one explicit
  architecture question and be added to the overview with a direct link,
  including documents in nested directories.
- Keep detailed interactions in `FLOW-*`, APIs and data formats in `CONTRACT`,
  factual catalogs in `REFERENCE`, operational procedures in `RUNBOOK`,
  decision rationale in `ADR`, and local ownership or rule boundaries in
  `MODULE`, rather than absorbing them into architecture.
- Update this managed block only through an explicit `$docu-docu init`.
<!-- docu-docu:project-guidance:end -->
