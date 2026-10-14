# Clarify before implementation

Only an explicit `$toudocu clarify <subject>` or Toudocu clarification interview
activates this workflow. Ordinary questions/implementation requests do not.
It authorizes read-only investigation, questions, confirmed canonical-document
updates and ordinary documentation checks—not implementation, product migration,
refactoring, arbitrary commands, Git writes/publishing, feedback or task runs.

## Investigate facts

Use the named task/document/feature/decision as the subject; do not ask the user
to restate it. No task is created merely to hold clarification.

Resolve conventions from `SKILL.md`. For initial Ready+ task context run
`task context <ID> <docs-root> --repository-root <root> --format text`, then read
the named contract once. For a free-form subject use
`search "<query>" <docs-root> --limit 5 --format text`; no task is assumed.
For current changes use scoped changes/file/task changes, initially text.
These maps precede broad canonical-document searches, not code investigation.

Read every context-linked standard/runbook; inspect other standards' scope
manually. Read only necessary source sections/code/tests/contracts/config/CI
and relevant history/UI evidence. Reuse current evidence across rounds and
refresh only changed, missing or uncertain facts. Never load full task/project
JSON to extract a few fields; select them before displaying. Investigation
expands when a concrete unresolved question needs more evidence, not to
inventory unrelated documentation.

Facts (current code, documented behavior, defaults, IDs, interfaces, tests and
constraints) are the agent's job. Decisions (desired behavior, policy, scope,
compatibility, terminology, ownership, trade-offs and priorities) are the user's.
Never disguise incomplete research as a design question or repeat a settled
answer. If a user claim conflicts with evidence, explain both and ask whether
it is a new requirement or misunderstanding; current code does not dictate the
future. An explicitly delegated decision is researched, recommended with its
material trade-off, and confirmed only within that delegated scope. Independent
research/questions may proceed while fact-dependent questions wait.

## Work through the design tree

Keep the tree internally; do not create `design-tree.json`, `clarification.json`,
`CONTEXT.md`, `CONTEXT-MAP.md`, transcripts or generic decision ledgers.
The frontier is every unresolved material decision whose prerequisites are
settled. A round asks the entire current frontier: no arbitrary question/round
maximum, no one-at-a-time interview when independent questions are answerable,
and no speculative downstream questions before their prerequisites. Prefer
upstream decisions that may eliminate branches; grouping never omits questions.

After each answer, record settled decisions, apply them, remove irrelevant
branches, identify newly needed facts/eligible decisions, recompute the whole
frontier and ask the next round. Continue until no reachable material decision
remains unresolved or unintentionally unexplored. Context optimization must
not shrink the decision frontier or replace it with a fixed checklist.

Number questions with short titles; each addresses one real decision and its
consequence. Give a defensible recommendation explicitly, with meaningful
alternatives/material downsides when relevant. It is advice, not a hidden
default. Avoid vague "anything else?", redundant phrasings, manufactured options
and asking users to choose facts. Use the authoritative glossary; surface
conflicting/overloaded terminology and propose precision only when useful.
Use concrete boundary/failure scenarios when they expose ambiguity: exclusions,
compatibility, stale/partial state, retries/cancellation, authority/ownership,
recovery/deletion, migration/rollback, limits, ordering/consistency or locales.
These are reasoning prompts, not mandatory extra questions.

Retain a compact decision state—confirmed constraints, exclusions, open nodes,
prerequisites and evidence handles—not the entire interview in each round.
Do not continuously rewrite canonical sources while the frontier is open.
Only an explicit request to persist an already settled decision permits an
early update, with the ordinary documentation gates.

## Confirm shared understanding

An empty frontier alone authorizes nothing. Recheck the original goal: each
material ambiguity is established by evidence, decided by the user, resolved
under explicit delegation, deliberately left open or made irrelevant. Present
confirmed decisions, exclusions/negative requirements, implementation constraints,
intentional open questions and owner documents, without reproducing the interview.
Ask for confirmation/correction. A correction reopens affected branches and the
interview resumes. Completion requires both an empty frontier and explicit
user confirmation.

## Preserve the confirmed design

After confirmation, update the smallest set of proper canonical sources; do
not leave durable implementation constraints only in conversation when an owner
exists. Use cases/guides/contracts own behavior; flows reusable processes;
architecture/modules boundaries; contracts/references public interfaces/defaults;
screen models navigation; qualifying tasks acceptance/verification; standards
rules; runbooks procedures; an existing glossary terminology. Temporary details
normally need no permanent document. Prefer existing owners; load the applicable
model only when selecting/authoring typed structure. Never invent a glossary,
typed document or task merely to store an answer.

An ADR requires all three: meaningful cost to reverse, surprising without
context, and a real choice among credible alternatives. Importance alone is
insufficient. Record an actual confirmed decision in `decisions/ADR-*.md`, not
an invented retrospective justification; include useful rationale/consequences.

Apply writing/semantic and relevant typed gates. Distinguish current behavior,
new requirements, planned implementation and gaps. Do not invent statuses,
dates, relationships, commands or implementation detail; no durable change
means no manufactured document. Run one project check with required strict
policy after edits, respecting prohibited checks; build only when requested or
necessary. Clarification still stops before implementation/migration/task runs,
even after confirmation. Finish with what was clarified, changed sources,
intentional open questions, validation and that implementation has not started.
A later implementation request uses the canonical result as evidence.
