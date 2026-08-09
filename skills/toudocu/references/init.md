# Explicit project initialization

Use this workflow only when the user explicitly invokes `$toudocu init` or
unambiguously asks to run the skill's init workflow. Do not infer initialization
from a missing `AGENTS.md` block, an ordinary documentation request, a check, or
another implicit skill trigger. The Toudocu Go CLI has no `init` command.

## Preflight before changing files

1. Read the applicable repository instructions, documentation conventions, CI
   commands, and existing Toudocu configuration.
2. Resolve the narrowest repository root that contains the documentation and
   every referenced scope path. Reuse the established documentation directory;
   otherwise use `<repository-root>/docs`.
3. Resolve the project locale from an existing valid `project.locale`, then
   repository instructions, then existing documentation. Use `en` when none
   establishes a locale. Normalize an `en-*` locale to the `en` bundled assets
   and a `ru-*` locale to `ru`. For any other valid locale, continue only when
   the repository supplies a complete 12-title `project.sections` map and the
   request context selects `en` or `ru` for bundled guidance and structural
   template cues; otherwise stop before writing and request those missing
   choices. Author new source prose in the project locale. Never construct an
   asset path for an unsupported locale.
4. Inspect the repository-root `AGENTS.md` for these exact markers:

   ```text
   <!-- toudocu:project-guidance:start -->
   <!-- toudocu:project-guidance:end -->
   ```

   Continue only when both markers are absent or each occurs exactly once in
   the correct order. Stop before writing when a marker is missing, duplicated,
   reversed, or nested. Also stop when an unmanaged instruction establishes a
   conflicting Toudocu trigger or task-creation policy; show the conflict and
   request user direction.
5. Inspect `<docs-root>/architecture/` before validation. If it contains
   Markdown other than a structurally valid `architecture/overview.md`, treat
   it as legacy architecture: run the ordinary read-only check with JSON
   output, show its diagnostics, and stop without migrating or rewriting those
   files.
6. If the documentation directory already contains Markdown, run its ordinary
   read-only Toudocu check with JSON output. Errors block initialization, with
   one narrow exception: when `architecture/` contains no Markdown,
   `missing-architecture-overview` may be the only error and is the expected
   condition repaired by init. Warnings remain visible. Under established
   strict policy, only `missing-index`, `missing-project-locale`, and
   `incomplete-project-sections` may remain non-blocking because this workflow
   repairs them; every other warning blocks initialization.

## Apply the initialization

1. If the selected documentation directory has no `index.md`, create a neutral
   `<docs-root>/index.md` in the established project language. Base its title and
   description on repository evidence.
2. Resolve the complete section map in memory before creating built-in entry
   documents. Preserve an existing non-empty configured title; otherwise use
   the H1 of an entry document that existed before init; otherwise use the
   selected `en` or `ru` [locale pack](../assets/locale-packs.md). A non-`en`/`ru`
   locale must use the complete project-provided map established during
   preflight.
3. If `architecture/` contains no Markdown, create
   `<docs-root>/architecture/overview.md` using
   `assets/templates/<asset-language>/architecture-overview.md` as a structural
   cue. Set its H1 exactly to the resolved `project.sections.architecture`
   title; never copy the template H1 when it differs. For a non-`en`/`ru`
   locale, author headings and prose in the project locale rather than copying
   bundled language text. Keep the required `Architecture Overview` document
   type, state only the evidence-backed system boundary, leave the
   architecture-question map empty, and omit the optional context diagram
   unless repository evidence supports it. Do not create detailed architecture
   documents, typed entities, owners, statuses, or relationships without
   evidence.
4. Create or complete `<repository-root>/.toudocu/config.yml` without removing
   existing `site`, `changes`, or `translations` settings. Set the resolved
   `project.locale` and write the already resolved 12 `project.sections`
   titles. Do not rewrite existing H1 headings.
5. Select `assets/project-guidance/ru.md` or
   `assets/project-guidance/en.md` using the preflight asset language. The
   selected managed block must contain the
   translation-context isolation rule: ordinary work uses only the canonical
   documentation root, while a selected translation root is read only for an
   explicit locale-specific request.
6. Upsert the complete asset into the repository-root `AGENTS.md`:
   - create the file with the block when it does not exist;
   - append the block after one blank line when both markers are absent;
   - replace from the start marker through the end marker when both occur once;
   - preserve every byte outside the managed block.
7. Do not create a `TASK-*` merely because init is running. Create one only when
   the user or existing repository policy explicitly requires it.

Do not install or refresh project guidance outside this explicit init workflow.
If a write fails, report every file already changed instead of claiming that
initialization completed atomically.

## Validate and report

1. Confirm that both managed markers occur exactly once and in the correct
   order.
2. Confirm that `<docs-root>/index.md` and
   `<docs-root>/architecture/overview.md` exist and that
   overview has document type `Architecture Overview`.
3. Run the ordinary project-wide Toudocu check. Run an additional strict check
   only when strict validation is project policy.
4. Report the resolved repository root, documentation directory, project
   locale, asset language, created or updated files, errors, and remaining
   warnings.
