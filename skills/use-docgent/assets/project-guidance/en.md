<!-- docgent:project-guidance:start -->
## Docgent

- Use `$use-docgent` when a request explicitly concerns Docgent or when a change
  affects documented behavior, CLI/API/schema/config, architecture, security,
  use cases, flows, screens, roadmap, or a task contract.
- Do not use the skill for ordinary questions, code reading, formatting, or
  refactoring with no semantic documentation impact.
- Create a new `TASK-*` only when the user or repository policy explicitly
  requires one, or for substantial multi-step work such as contract or
  architecture changes, migrations, cross-session or cross-owner handoffs, or
  durable acceptance criteria. Do not create a task for every prompt.
- During implementation, update an existing documentation source of truth when
  the change makes it inaccurate. Do not create documents, statuses, or
  relationships without supported semantics, and do not edit generated output
  as a source.
- Refresh this managed block only through an explicit `$use-docgent init`.
<!-- docgent:project-guidance:end -->

