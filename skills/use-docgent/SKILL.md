---
name: use-docgent
description: Create, update, validate, and build adaptable project documentation managed by the Docgent CLI. Use when an agent needs to initialize or revise a documentation directory, write ordinary or typed Docgent Markdown, fix integrity diagnostics, maintain optional modules, use cases, business rules, roadmap items, risks, ADRs, contracts, guides, references, or TASK-* work items, obtain task context, run an explicitly requested trusted task verification, or generate the static documentation portal.
---

# Use Docgent

Use Docgent to protect safety and explicit relationships, not to force every
project into one documentation structure. Keep ordinary Markdown lightweight;
apply typed contracts only when the project uses the corresponding capability.

## Establish the environment

1. Read repository instructions, CI configuration, existing documentation, and
   documented Docgent commands before choosing paths or flags.
2. Preserve the project's language, terminology, IDs, layout, and verification
   policy. Use neutral language for a new project.
3. Discover the documentation directory and repository root from existing
   commands and links. In a monorepo, prefer the narrowest root that contains
   the documentation and every referenced scope path. Use the Git root only as
   a fallback.
4. Resolve the CLI:
   - use `docgent` when available in `PATH`;
   - in the Docgent source repository, use `go run ./cmd/docgent`;
   - otherwise report that Docgent is unavailable instead of installing it
     without permission.
5. Read [references/workflows.md](references/workflows.md) before choosing CLI
   flags or working with `TASK-*`.

## Inspect before writing

- For existing documentation, run the project's read-only check. If no command
  is documented, use the discovered paths with JSON output:

  ```bash
  docgent check ./docs --repository-root . --format json
  ```

- Use diagnostics, current documents, repository artifacts, tests, and public
  interfaces as evidence. Do not invent behavior, status, commands, owners, or
  review dates to silence a diagnostic.
- Read [references/document-model.md](references/document-model.md) before
  creating a typed document or changing stable IDs and relationships.

## Create or update documentation

1. For a new project, create a neutral `index.md` first. Add more documents only
   when they communicate known information.
2. Use ordinary Markdown in untyped paths for free-form documentation. Use
   `modules/`, `use-cases/`, `flows/`, `decisions/`, `roadmap.md`, and `work/`
   only when the project benefits from their machine-readable semantics.
3. Select the closest template from `assets/templates/ru/` or
   `assets/templates/en/`. Templates are starting points, not a required
   starter pack.
4. Replace every `{{PLACEHOLDER}}`. Use `rg` when available, or an equivalent
   text search, to find unresolved placeholders.
5. Keep statements observable and specific. Update related documents together
   only when an explicit relationship exists.
6. Keep global progress in `roadmap.md` if the project uses a roadmap. Do not
   add requirement checklists to `status.md`.
7. Preserve source Markdown as the source of truth. Never edit generated site
   output as documentation.
8. Treat Mermaid as visualization only. Keep requirements and acceptance
   criteria in prose, and use only validated `flowchart`, `stateDiagram-v2`, or
   architectural `sequenceDiagram` blocks.

## Interpret validation correctly

- Treat errors as failed integrity or an invalid explicit contract. Fix them
  before declaring the documentation valid.
- Treat warnings as editorial guidance. Fix them when evidence supports the
  change; otherwise report them without inventing content.
- Do not add a module, use case, status, date, ID, or section solely to achieve
  zero warnings.
- Use `--strict` only when repository instructions, CI, or the user explicitly
  requires warnings to fail validation.

## Work with tasks safely

1. Start task work with read-only context:

   ```bash
   docgent task context TASK-AREA-001 ./docs \
     --repository-root . \
     --format json
   ```

2. Treat an existing non-draft task as an explicit contract: respect its result,
   scope, exclusions, criteria, dependencies, module, use case, and rules.
3. Do not broaden changes beyond task scope without user direction.
4. Run `task check` only when the repository is trusted and the user explicitly
   asked to execute or verify the task. It executes repository shell commands
   with the current user's permissions.

## Validate and deliver

1. Always finish with an ordinary project-wide check using discovered paths:

   ```bash
   docgent check ./docs --repository-root .
   ```

2. Run an additional strict check only when strict validation is project policy.
   Keep stale warnings visible, but update dates only after a real review.
3. Build the portal only when requested or needed for verification. Discover the
   project's output convention; otherwise choose a dedicated disposable
   directory. Use `--clean` only after confirming the resolved output is safe.
4. Report changed documentation, errors resolved, remaining warnings,
   validation policy used, and any verification intentionally not run.
