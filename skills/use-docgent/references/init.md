# Explicit project initialization

Use this workflow only when the user explicitly invokes `$use-docgent init` or
unambiguously asks to run the skill's init workflow. Do not infer initialization
from a missing `AGENTS.md` block, an ordinary documentation request, a check, or
another implicit skill trigger. The Docgent Go CLI has no `init` command.

## Preflight before changing files

1. Read the applicable repository instructions, documentation conventions, CI
   commands, and existing Docgent configuration.
2. Resolve the narrowest repository root that contains the documentation and
   every referenced scope path. Reuse the established documentation directory;
   otherwise use `<repository-root>/docs`.
3. Choose the project language from the existing `AGENTS.md`, then the existing
   documentation. Use English when neither establishes a language.
4. Inspect the repository-root `AGENTS.md` for these exact markers:

   ```text
   <!-- docgent:project-guidance:start -->
   <!-- docgent:project-guidance:end -->
   ```

   Continue only when both markers are absent or each occurs exactly once in
   the correct order. Stop before writing when a marker is missing, duplicated,
   reversed, or nested. Also stop when an unmanaged instruction establishes a
   conflicting Docgent trigger or task-creation policy; show the conflict and
   request user direction.
5. If the documentation directory already contains Markdown, run its ordinary
   read-only Docgent check with JSON output. Errors block initialization;
   warnings remain visible and block only when strict validation is established
   project policy.

## Apply the initialization

1. If the selected documentation directory has no `index.md`, create only a
   neutral `docs/index.md` in the established project language. Base its title
   and description on repository evidence. Do not create a starter pack,
   typed entities, owners, statuses, or relationships without evidence.
2. Select `assets/project-guidance/ru.md` or
   `assets/project-guidance/en.md`.
3. Upsert the complete asset into the repository-root `AGENTS.md`:
   - create the file with the block when it does not exist;
   - append the block after one blank line when both markers are absent;
   - replace from the start marker through the end marker when both occur once;
   - preserve every byte outside the managed block.
4. Do not create a `TASK-*` merely because init is running. Create one only when
   the user or existing repository policy explicitly requires it.

Do not install or refresh project guidance outside this explicit init workflow.
If a write fails, report every file already changed instead of claiming that
initialization completed atomically.

## Validate and report

1. Confirm that both managed markers occur exactly once and in the correct
   order.
2. Run the ordinary project-wide Docgent check. Run an additional strict check
   only when strict validation is project policy.
3. Report the resolved repository root, documentation directory, selected
   language, created or updated files, errors, and remaining warnings.

