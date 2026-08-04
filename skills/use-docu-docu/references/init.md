# Explicit project initialization

Use this workflow only when the user explicitly invokes `$use-docu-docu init` or
unambiguously asks to run the skill's init workflow. Do not infer initialization
from a missing `AGENTS.md` block, an ordinary documentation request, a check, or
another implicit skill trigger. The Docu-docu Go CLI has no `init` command.

## Preflight before changing files

1. Read the applicable repository instructions, documentation conventions, CI
   commands, and existing Docu-docu configuration.
2. Resolve the narrowest repository root that contains the documentation and
   every referenced scope path. Reuse the established documentation directory;
   otherwise use `<repository-root>/docs`.
3. Choose the project language from the existing `AGENTS.md`, then the existing
   documentation. Use English when neither establishes a language.
4. Inspect the repository-root `AGENTS.md` for these exact markers:

   ```text
   <!-- docu-docu:project-guidance:start -->
   <!-- docu-docu:project-guidance:end -->
   ```

   Continue only when both markers are absent or each occurs exactly once in
   the correct order. Stop before writing when a marker is missing, duplicated,
   reversed, or nested. Also stop when an unmanaged instruction establishes a
   conflicting Docu-docu trigger or task-creation policy; show the conflict and
   request user direction.
5. Inspect `architecture/` before validation. If it contains Markdown other
   than a structurally valid `architecture/overview.md`, treat it as legacy
   architecture: run the ordinary read-only check with JSON output, show its
   diagnostics, and stop without migrating or rewriting those files.
6. If the documentation directory already contains Markdown, run its ordinary
   read-only Docu-docu check with JSON output. Errors block initialization, with
   one narrow exception: when `architecture/` contains no Markdown,
   `missing-architecture-overview` may be the only error and is the expected
   condition repaired by init. Warnings remain visible and block only when
   strict validation is established project policy.

## Apply the initialization

1. If the selected documentation directory has no `index.md`, create a neutral
   `docs/index.md` in the established project language. Base its title and
   description on repository evidence.
2. If `architecture/` contains no Markdown, create
   `docs/architecture/overview.md` from
   `assets/templates/<language>/architecture-overview.md`. Keep the required
   `Architecture Overview` document type, state only the evidence-backed system
   boundary, leave the architecture-question map empty, and omit the optional
   context diagram unless repository evidence supports it. Do not create
   detailed architecture documents, typed entities, owners, statuses, or
   relationships without evidence.
3. Create or complete `.docu-docu/config.yml` with `project.locale` and all
   built-in `project.sections` titles from the selected `en` or `ru` locale
   pack in [`assets/locale-packs.md`](../assets/locale-packs.md). Apply those canonical titles only to built-in entry documents created
   by this workflow; do not rewrite existing H1 headings.
4. Select `assets/project-guidance/ru.md` or
   `assets/project-guidance/en.md`.
5. Upsert the complete asset into the repository-root `AGENTS.md`:
   - create the file with the block when it does not exist;
   - append the block after one blank line when both markers are absent;
   - replace from the start marker through the end marker when both occur once;
   - preserve every byte outside the managed block.
6. Do not create a `TASK-*` merely because init is running. Create one only when
   the user or existing repository policy explicitly requires it.

Do not install or refresh project guidance outside this explicit init workflow.
If a write fails, report every file already changed instead of claiming that
initialization completed atomically.

## Validate and report

1. Confirm that both managed markers occur exactly once and in the correct
   order.
2. Confirm that `index.md` and `architecture/overview.md` exist and that
   overview has document type `Architecture Overview`.
3. Run the ordinary project-wide Docu-docu check. Run an additional strict check
   only when strict validation is project policy.
4. Report the resolved repository root, documentation directory, selected
   language, created or updated files, errors, and remaining warnings.
