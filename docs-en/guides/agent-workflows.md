# Docu-docu agent workflows

The installable skill adds four explicit workflows for creating and updating
source documentation. They modify Markdown based on confirmed repository
evidence and are not Go CLI commands.

## Initialization

`$docu-docu init` is used only upon an explicit request. The workflow examines
existing instructions and documentation, creates the missing minimal
`index.md` and `architecture/overview.md`, adds the project locale/section map
and a managed guidance block to `AGENTS.md`. An existing ambiguous or
conflicting structure blocks writes; no task is created automatically.

## Full refresh

`$docu-docu refresh` compares all canonical source documentation with the code,
tests, interfaces, schemas, configuration, CI, decisions, and confirmed
requirements. The workflow updates only evidence-backed statements, then runs
semantic review and a project-wide structural check.

## Current diff refresh

`$docu-docu refresh diff` starts with staged, unstaged, and untracked files
relative to `HEAD`, then adds documents affected through links, stable IDs,
task relationships, and changed public behavior. If Git or `HEAD` is
unavailable, the workflow does not silently broaden the scope and instead
offers a full refresh.

## Translation

`$docu-docu translate <locale>` requires exactly one mode:

```text
$docu-docu translate <locale> --task TASK-ID
$docu-docu translate <locale> --base REF
$docu-docu translate <locale> --all-stale
```

The workflow updates the configured translation root as a complete read-only
mirror. It processes one source/target pair at a time, preserves IDs, commands,
paths, and code blocks, compares normalized semantics, and updates the manifest
only after the selected locale passes a strict check.

## Shared boundaries

- the canonical documentation root remains the only source of ordinary
  implementation, task, and semantic-review context;
- init, refresh, and translate are never presented as `docu-docu` commands;
- generated portals are not edited as sources of truth;
- unknown status, owner, date, relationship, or procedure values are not
  invented;
- translation roots are read only for an explicitly selected locale operation
  and are not used by the task workflow or editor writes.

After a modifying workflow, the agent reports the affected sources, the
semantic-review verdict, errors and warnings from the structural check, and the
tracked portal rebuild result when required by project policy.
