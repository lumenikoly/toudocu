# Check, search, changes and source edits

Reuse conventions and authority from `SKILL.md`. Read only the selected
operation; this reference does not require a command sequence.

| Need | First source |
|---|---|
| Structural diagnostics | `toudocu check <docs-root> --repository-root <root> --format text` |
| Find documents/entities | `toudocu search "<query>" <docs-root> --limit 5 --format text` |
| Documentation changes | `toudocu changes`, `changes file`, or `task changes`, initially text |
| Known document details | Read its relevant source sections directly |
| Code, tests, consumers | Ordinary repository/code tools |
| Task work / portal / creation | Only [task-workflow](task-workflow.md), [portal](portal.md), or [create-documents](create-documents.md) |

## Bounded discovery

Search with a specific ID/topic and a small limit. Refine an ambiguous query
before widening; do not read every hit or dump the documentation tree. For
changes, inspect the compact file map, then a selected file's diff or relevant
hunks. Use existing base/target conventions and task/tree scope only when
requested. JSON changes can contain source patches, rendered sections and
Mermaid bodies; never print the entire report for a path inventory.

`check`, search and changes are read-only; report flags may write an explicitly
selected report. Task commands never run during ordinary checks/builds/context.
Use command-specific `--help` only for unknown syntax, not repeated root help.

## Edit and validate

1. Identify audience, document purpose/language, source of truth and evidence.
2. Update the existing owner document. Apply [writing-quality](writing-quality.md)
   and [semantic-gate](semantic-gate.md), plus only the applicable typed model.
3. Obtain independent review when the semantic gate requires it.
4. Run the project-wide check once using the project's required strict policy.
   Default to text: check JSON is a whole `ProjectReport`, not just diagnostics.
   If JSON is needed, use [report-output](report-output.md) before displaying it.
5. Group issues by document/code, repair actual errors, and evaluate warnings
   against evidence. Never invent content or remove meaningful relationships to
   obtain a clean report. Recheck after fixes, not after each unchanged read.

An ordinary check fails on errors; `--strict` also fails on warnings. A required
strict check already covers the ordinary check. An unchanged passing result for
the same root, flags and source state may be reused; it is not proof after edits.
Do not build a portal merely to validate a source edit. Summarize changes, check
outcomes and unresolved warnings; keep full logs/reports outside documentation
and expose only relevant excerpts, without hiding omitted failures.
