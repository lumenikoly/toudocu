<!-- docu-docu:project-guidance:start -->
## Docu-docu

- Use `$use-docu-docu` when a request explicitly concerns Docu-docu or when a change
  affects documented behavior, CLI/API/schema/config, architecture, security,
  use cases, flows, screens, roadmap, or a task contract.
- Do not use the skill for ordinary questions, code reading, formatting, or
  refactoring with no semantic documentation impact.
- Use `$use-docu-docu refresh` for a full evidence-based review and update of
  source documentation. Use `$use-docu-docu refresh diff` for staged, unstaged,
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
- Update this managed block only through an explicit `$use-docu-docu init`.
<!-- docu-docu:project-guidance:end -->
