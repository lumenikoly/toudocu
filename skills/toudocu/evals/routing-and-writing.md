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
