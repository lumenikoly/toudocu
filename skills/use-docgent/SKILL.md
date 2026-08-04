---
name: use-docgent
description: Create, update, validate, and build adaptable project documentation managed by the Docgent CLI. Use when Codex needs to initialize or revise Docgent Markdown; work with modules, use cases, FLOW-* Mermaid processes, SC-* screen documents and TR-* transitions, roadmap items, risks, ADRs, contracts, guides, references, or TASK-* work items; fix integrity diagnostics; obtain task context; run explicitly requested trusted task verification; or generate the static portal.
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
6. Read [references/semantic-gate.md](references/semantic-gate.md) before
   creating or changing any documentation.

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
- Establish the document's audience, purpose, useful question, and sources of
  truth before selecting a template or interpreting validation diagnostics.

## Create or update documentation

1. Apply the semantic gate. Prefer updating an existing source of truth and add
   a document only when it communicates a distinct, evidence-backed purpose.
2. For a new project, create a neutral `index.md` first. Add more documents only
   when they communicate known information.
3. Use ordinary Markdown in untyped paths for free-form documentation. Use
   `modules/`, `use-cases/`, `flows/`, `screens/`, `decisions/`, `roadmap.md`,
   and `work/` only when the project benefits from their machine-readable
   semantics.
   Use `quality/STD-*.md` for enforceable standards and `runbooks/RB-*.md` for
   real operational procedures. For an unknown top-level section, add an
   `index.md` manifest with `Type: Custom`, owner, description, and useful H1.
4. For a new module, use case, flow, screen, or decision, prefer the atomic CLI
   scaffold when available:

   ```bash
   docgent scaffold module MOD-AREA ./docs --title "Title" --lang en
   docgent scaffold standard STD-AREA-001 ./docs --title "Title" --lang en
   docgent scaffold runbook RB-AREA-001 ./docs --title "Title" --lang en
   ```

   Then use the closest template from `assets/templates/ru/` or
   `assets/templates/en/` to enrich only evidence-backed sections. For other
   document types, start directly from the closest template. Templates are
   starting points, not a required starter pack. Remove unsupported optional
   sections instead of filling them with plausible placeholders.
5. Replace every `{{PLACEHOLDER}}`. Use `rg` when available, or an equivalent
   text search, to find unresolved placeholders.
6. Keep statements observable and specific. Update related documents together
   only when an explicit relationship exists.
7. Keep global progress in `roadmap.md` if the project uses a roadmap. Do not
   add requirement checklists to `status.md`.
8. Preserve source Markdown as the source of truth. Never edit generated site
   output as documentation.
9. Treat Mermaid as visualization only. Keep requirements and acceptance
   criteria in prose, and use only validated `flowchart`, `stateDiagram-v2`, or
   `sequenceDiagram` blocks. Put concrete request sequences and significant
   service interactions in `FLOW-*` documents. Link a product flow through
   `Scenario` to one or more `UC-*`; Docgent derives the reverse `UC ↔ FLOW`
   relationships. For a genuinely architectural flow, omit `Scenario` and link
   the architecture document instead. Keep simple endpoint operations in API
   contracts. For screen maps, edit the catalog and transition tables instead
   of the generated Mermaid source.
10. Complete the author review and any risk-based independent review before
    treating Docgent validation as the final structural gate.

## Interpret validation correctly

- Treat errors as failed integrity or an invalid explicit contract. Fix them
  before declaring the documentation valid.
- Treat warnings as editorial guidance. Fix them when evidence supports the
  change; otherwise report them without inventing content.
- Do not add a module, use case, status, date, ID, or section solely to achieve
  zero warnings.
- When a typed contract requires unsupported content, reconsider the document
  type or request evidence instead of manufacturing a structurally valid model.
- Use `--strict` only when repository instructions, CI, or the user explicitly
  requires warnings to fail validation.

## Work with tasks safely

1. For a new request, search and create a neutral Draft:

   ```bash
   docgent search "request terms" ./docs --format json
   docgent task init ./docs --area AREA --title "Title" --type Feature
   ```

   Select and fill entities from evidence. `--type Bug` allocates a `BUG-*`
   identifier and uses the bug-specific scaffold. Docgent does not interpret
   the request or change task status.
2. Validate the complete Draft with `task ready`; change it to Ready only after
   semantic review.
3. Start implementation work with read-only context:

   ```bash
   docgent task context TASK-AREA-001 ./docs \
     --repository-root . \
     --format json
   ```

4. Treat an existing Ready+ task as an explicit contract: respect its result,
   scope, exclusions, criteria, dependencies, module, use case, flow, screens,
   and rules.
   Read every explicitly linked standard and runbook. Also review the `Scope`
   of other standards for applicability; do not infer applicability from a
   task glob alone.
5. Use checkboxes in `Acceptance criteria` and `Plan` when progress tracking is
   useful. Keep `AC-*` identifiers and verification mappings on acceptance
   criteria; plan steps do not require them.
6. Do not broaden changes beyond task scope without user direction.
7. Inspect `task verify --dry-run` first. Run `task verify --run` only when the
   repository is trusted and the user explicitly asked to execute or verify the
   task. It executes repository shell commands with the current user's
   permissions.
8. Archive only a validated Done or Cancelled task with `task archive`; restore
   it with `task restore`. These commands move one Markdown file without
   changing its status or content and block when direct links would break.

## Validate and deliver

1. After the semantic gate passes, finish with an ordinary project-wide check
   using discovered paths:

   ```bash
   docgent check ./docs --repository-root .
   ```

2. Run an additional strict check only when strict validation is project policy.
   Keep stale warnings visible, but update dates only after a real review.
3. Build the portal only when requested or needed for verification. Discover the
   project's output convention; otherwise choose a dedicated disposable
   directory. Use `--clean` only after confirming the resolved output is safe.
4. Report the semantic-gate result and reviewer when required, changed
   documentation, errors resolved, remaining warnings, validation policy used,
   and any verification intentionally not run.
