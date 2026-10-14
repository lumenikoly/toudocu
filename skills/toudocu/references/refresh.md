# Documentation refresh

Only explicit `$toudocu refresh` or `$toudocu refresh diff` activates this
workflow. It updates source documentation from evidence, not code. Never
initialize, create a new tree or install/update managed guidance; missing
established documentation requires explicit init instead.

## Boundary and evidence

Resolve canonical root, language, CLI flags, standards/runbooks, strict and
tracked-portal conventions from repository policy. Exclude configured
translation roots from all ordinary search, inventory, semantic/implementation
review and task context, including their changed/untracked files.

Run the project check initially with compact text and the effective strict
policy. Structural diagnostics are not proof of truth; select only needed
JSON fields if necessary. Preserve the exit code and all diagnostic counts.

- Full mode: inventory every canonical source Markdown path and relevant code,
  tests, interfaces, schemas, config, CI, requirements, ADRs and confirmed input.
  Inventory paths/IDs first, not all document bodies in one output.
- Diff mode: require Git + valid HEAD; use `git diff --name-only HEAD --` plus
  `git ls-files --others --exclude-standard` (staged/unstaged/untracked). Never
  substitute merge-base/default branch or silently expand to full mode.
  Start with changed sources/artifacts and add affected documents through links,
  backlinks, stable IDs, task relations, declared code paths and public behavior.
  Exclude generated/build/cache/vendor artifacts as source documentation.
- Empty diff scope: report no semantic candidates and make no source changes;
  reuse the unchanged initial structural result instead of rerunning it.

Process one document or a small related group at a time. Track IDs/paths,
classification, evidence handles and unresolved findings, not accumulated full
texts/JSON/diffs. For each scoped document, identify reader/question/evidence;
compare behavior, interfaces, boundaries, status, relationships, examples,
commands and terminology. Classify current, needs update, unverifiable,
obsolete, duplicated or misplaced. Detect translation-like/mixed-language or
implementation-led wording. Distinguish documentation drift from product/code
conflicts; report ambiguous ownership instead of changing code or guessing.
Full mode still reviews every scoped document: batching never skips coverage.

## Update and validate

Update the existing owner and required related sources using writing/semantic
and applicable typed gates. Creation/deletion/rename/merge or ID changes require
unambiguous evidence and consistent links, task relations, architecture map and
routes; otherwise leave sources unchanged and report uncertainty. Preserve
unrelated working-tree changes. Never invent facts/entities/tasks to fix warnings.

Change update dates only with content/relationships; never advance runbook
Last verified without executing its procedure. Preserve valid locale/config
settings; complete the active built-in section-title map from established titles
or the selected locale pack, not an inventory of all packs/templates. Change
entry H1 only for existing built-in sections, not custom manifests.

Review changed prose and semantics, obtain independent review where required,
then run one final project check with the required strict policy after edits.
Recheck after actual fixes; do not run ordinary and strict variants separately.
No source changes means the initial current result can be reused. Rebuild only
if tracked output or project policy requires it, after gates pass and safe
output/clean paths are confirmed. Report mode/scope, changed paths, unresolved
findings, review/check outcomes and any date/ID/portal effects concisely; keep
full inventories/reports outside model context. State when no source diff exists.
