# Toudocu skill evaluation cases

Use these cases when changing the skill description, routing table, or writing
rules. They are maintainer tests, not runtime instructions.

## Trigger evaluation

Use [`trigger-prompts.csv`](trigger-prompts.csv) as the routing dataset. Run each
prompt in a clean context with the same model, repository fixture, and available
skills. Repeat each case at least three times because skill selection is not
fully deterministic. Record the model version, skill checksum, invocation result,
and any unexpected side effects.

A routing run passes when:

- a `should_trigger=true` case loads this skill in at least two of three runs;
- a `should_trigger=false` case loads this skill in no more than one of three
  runs;
- explicit `$toudocu` workflows select only the requested operation;
- no case infers `$toudocu init` or executes `task verify --run` without the
  required explicit authorization.

When the description changes, compare the same prompt set before and after the
change. Add real false positives, false negatives, and ambiguous requests to the
dataset instead of weakening the expected boundary.

## Workflow routing

These behavioral cases inspect the execution transcript, not only the final
answer. Do not add them to `trigger-prompts.csv`; that file tests skill
activation, not tool order.

### Implement a Ready task

Input:

> Implement TASK-CLI-014.

Expected transcript:

- the skill activates and selects `references/task-workflow.md`, not the
  former all-purpose workflow;
- `task context --format text` runs before broad search across canonical
  documentation;
- the returned paths and relationships form the starting map;
- the task Markdown is read once; related documents are read only as needed;
- repository or code search may inspect source code afterward.

### Continue a bug investigation

Input:

> Continue investigating BUG-CLI-007.

Expected transcript:

- without a current map, `task context --format text` first maps the existing
  Ready+ work item, then the agent reads its missing contract details;
- with a current map and already-read contract, the agent reuses them;
- manual traversal of canonical documentation does not replace initial discovery.

### Prepare context and a verification plan

Input:

> Prepare the context for TASK-CLI-014 and show its verification plan without
> running commands.

Expected transcript:

1. `task context --format text`, then the missing task contract details;
2. `task verify --dry-run --format json` saved outside source documentation;
3. a projected command/target/validation summary, without full logs.

The producing CLI exit code is preserved. The agent does not run
`task verify --run`.

### Find documentation

Input:

> Find the Toudocu documentation describing authentication configuration.

Expected transcript:

- `toudocu search --limit 5 --format text` runs before any broad raw search
  across canonical documentation;
- an ambiguous query is refined before its limit is increased;
- broad `rg` does not replace `toudocu search`;
- identified files may then be read directly.

### Review a known file

Input:

> Review `docs/reference/configuration.md`.

Expected transcript:

- the agent may read the named file directly;
- it does not run `toudocu search` only to satisfy Toudocu-first routing.

### Find code consumers

Input:

> For TASK-CLI-014, find all Go consumers of the API mentioned in its context.

Expected transcript:

1. `task context --format text`, then the missing task contract details;
2. repository or code search for Go consumers.

Toudocu maps the task context but does not replace source-code search.

### Large task context

The fixture has a Ready task whose JSON context embeds large related documents.

Input:

> Implement TASK-CLI-014.

Expected transcript:

- the initial context command uses `--format text`, not a full JSON dump;
- the task contract and every context-linked standard and runbook are read
  before changes; the scope of other standards is inspected manually;
- related source sections are read only when needed;
- if issue details or dependency states require JSON, the agent filters the
  needed fields in a subprocess before displaying them;
- the agent never reads the entire saved JSON and then repeats its source text
  from Markdown.

### Continue with current evidence

The conversation already contains the task contract, applicable rules, relevant
source sections, a checkpoint, and check results; none has changed.

Input:

> Continue TASK-CLI-014 with the agreed scope.

Expected transcript:

- no repeated context command or duplicate document reads merely for a new turn;
- the checkpoint retains scope, exclusions, decisions, source paths, next step,
  and check outcomes;
- missing or uncertain evidence is refreshed selectively;
- when the task or its relationships change, the compact map is refreshed;
- an old saved report never proves current state, and state-changing actions
  still perform their required readiness or digest checks.

For a fresh-context workflow case, the required Toudocu command must actually
run before an equivalent broad raw search across canonical documentation. A
continuation case with current evidence must reuse it instead of repeating
discovery. Direct reading of a known file and later source-code search remain
allowed. The transcript must not contain irrelevant Toudocu commands, an
unauthorized `task verify --run`, or use of configured translation roots as
canonical documentation or work-item context.

### Bounded instruction loading

Input:

> Prepare the context for TASK-CLI-014, without changing it.

Expected transcript:

- the task operation reference is selected; creation/portal/clarification
  references and contract models are not loaded merely to obtain a map;
- current instructions are reused, not reread through links or symlinks;
- required repository standards and runbooks remain mandatory;
- evals and the entire template/reference directory are not runtime inputs.

### Large check report and strict validation

The fixture's project JSON exceeds 1 MB, with diagnostics including failures
beyond the first displayed page.

Input:

> Validate the documentation under the project's strict policy.

Expected transcript:

- one strict text check, not ordinary plus strict or a full project JSON dump;
- if structured diagnostics are needed, JSON stays in a temporary report and
  `scripts/report-summary.mjs check` projects counts and diagnostic pages;
- the original CLI exit code is retained independently of formatter success;
- omitted pages, truncation or helper errors are never proof of success;
- generated reports are not reread as source documentation.

### Explicit verification with large logs

Input:

> Run TASK-CLI-014's trusted verification commands.

Expected transcript:

- task-local validation and explicit execution authority remain required;
- the JSON report/logs stay outside source documentation and model context;
- `scripts/report-summary.mjs verify` returns commands/criterion outcomes and
  page metadata, without stdout/stderr;
- all reported failures are accounted for; relevant failure excerpts are read
  selectively, without replaying successful suite output;
- unchanged successful covering suites are not rerun alongside their subsets.

## Clarification workflow

### Case 1 — Existing task

Input:

> `$toudocu clarify TASK-CLI-014`

Expected transcript:

- the skill activates and selects `references/clarify.md`;
- `task context --format text` runs before broad documentation search;
- the task contract is read once, with targeted source reads afterward;
- implementation code does not change;
- `task verify --run` does not run.

### Case 2 — Free-form feature

Input:

> `$toudocu clarify the authentication configuration redesign`

Expected transcript:

- `toudocu search` runs before broad raw search across canonical documentation;
- the returned documents form the initial context;
- repository code is inspected when necessary;
- the user is not asked to supply facts available from the repository.

### Case 3 — Fact versus decision

The fixture defines an existing default in authoritative configuration and a
proposal that may change it.

Expected transcript:

- the agent finds and states the current default without asking the user;
- the desired future default remains a decision put to the user.

### Case 4 — Whole frontier

The fixture exposes several independent decisions with settled prerequisites.

Expected transcript:

- every currently independent decision appears in the same round;
- there is no artificial `1–3` or other numerical question limit;
- no available question is deferred merely because of the round size.

### Case 5 — Dependent question

Decision B can be formulated only after decision A is answered.

Expected transcript:

- A appears in the first round;
- B does not appear in that round;
- B appears in a later frontier only when A makes it relevant.

### Case 6 — Pruned branch

The user's answer to an upstream decision makes a downstream branch
irrelevant.

Expected transcript:

- the branch is removed when the frontier is recomputed;
- no question from that branch is ever asked.

### Case 7 — Recommendation

Expected transcript:

- each decision with a defensibly preferred option includes a recommendation
  and a short reason;
- the recommendation is not treated as the user's answer and does not resolve
  the decision automatically.

### Case 8 — Large frontier

The fixture has more than three independent frontier decisions.

Expected transcript:

- the round contains the complete frontier rather than only three questions.

### Case 9 — Shared understanding

After the frontier becomes empty, expected transcript:

- the agent summarizes the confirmed design, exclusions, constraints, open
  questions, and affected canonical documents;
- the agent waits for explicit user confirmation;
- clarification is not declared complete and implementation does not begin
  before confirmation.

### Case 10 — Correction after summary

The user corrects a decision in the shared-understanding summary.

Expected transcript:

- the design tree is updated and the frontier is recomputed;
- any newly reachable decisions are interviewed;
- implementation does not begin.

### Case 11 — Documentation persistence

After confirmation, a durable decision belongs to an existing canonical
source.

Expected transcript:

- the existing source of truth is updated and receives the exact durable
  constraints;
- `CONTEXT.md`, `CONTEXT-MAP.md`, `clarification.md`, and `decision-log.md` are
  not created without a separate product reason;
- the ordinary documentation check runs after the mutation.

### Case 12 — ADR gate

The fixture contains four decisions: one satisfies all three ADR criteria; the
others respectively lack hard-to-reverse cost, surprise without context, or a
real trade-off.

Expected transcript:

- an ADR is permitted only for the decision satisfying all three criteria;
- no ADR is created for any of the other three decisions.

## Reader-first writing

### Mixed-language prose

Input:

> Typed transport преобразует backend error payload в предсказуемую frontend
> ошибку и предоставляет recovery action.

Expected properties:

- the output uses idiomatic Russian prose;
- it explains the server response, client error, and available next action;
- it keeps an exact code token only when needed for traceability;
- it does not invent current behavior or a recovery path.

### Diagram labels

Input labels:

```text
Resolve event: JOIN_LINK
canJoin = true?
REGISTER
```

Expected properties:

- visible labels are written in the document language;
- the decision is a natural question about the business condition;
- `JOIN_LINK` or `REGISTER` appears only after a human-readable meaning when its
  exact identity matters;
- Mermaid node IDs and syntax remain unchanged.

### Truth states

Input evidence says that a recovery action is required but missing for two error
paths.

Expected properties:

- the required behavior and current gaps are separate statements;
- the output does not say the recovery behavior is fully implemented;
- issue or requirement IDs follow the explanation rather than replacing it.
