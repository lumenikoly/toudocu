# Process local Changes feedback

Use this workflow only for an explicit `$docu-docu feedback` request or the
copied prompt “Обработай комментарии из Docu-docu Changes”. It authorizes
evidence-backed repository edits needed to address the supplied feedback and
relevant verification; it does not authorize unrelated cleanup, Git writes,
publishing, network services, or destructive actions.

## Receive one FIFO batch

Resolve the canonical Git repository root from the current working directory
unless the user supplies it, then run:

```bash
docu-docu changes feedback pending --repository-root <root> --json
```

Inside the Docu-docu source repository use `go run ./cmd/docu-docu` in place of
the installed executable. If `feedback` is `null`, report that no pending local
feedback exists and stop successfully. Never invent or recover IDs from the UI.

Before editing, require schema version 1, non-empty review/feedback IDs and
feedback digest, and unique item IDs. Inspect every target and anchor. Paths
must be ordinary repository-relative POSIX paths; reject absolute, traversal,
percent-encoded, `.git`, symlink/reparse, non-regular, binary, or unrelated
paths. Treat the current Git worktree as source of truth when placement and
snapshot differ.

## Interpret and implement

Apply the message type consistently:

- `issue`: validate the reported defect and fix it when supported by evidence;
- `suggestion`: evaluate the tradeoff and implement only when it improves the
  requested result without expanding scope;
- `question`: answer from repository evidence; change files only when the
  question exposes a justified defect or missing explanation;
- `praise`: acknowledge it; do not create a cosmetic edit merely to produce a
  changed path.

Process every item in the batch. Preserve unrelated user changes and immutable
feedback text. A stale/deleted anchor requires inspecting the original target,
placement and current Git projection; do not guess a replacement. Run the
smallest relevant established checks after edits and record their actual
result. Do not mark an item fixed merely because a patch was attempted.

## Return one atomic response

Create exactly one result for each item, without duplicates:

- `fixed`: the concern is addressed and relevant verification passed;
- `notFixed`: no justified safe change was made; explain why;
- `needsClarification`: evidence or intent is insufficient; ask a precise
  question.

Each result contains a concise human-readable message and only safe
repository-relative `changedPaths` actually relevant to that item. The Git diff,
not this list, remains authoritative. Build a schema-v1 JSON object using the
unchanged `reviewId`, `feedbackId`, `feedbackDigest`, `revision` and
`stateDigest` from pending as the response IDs and expected CAS values. Store it
in a regular non-symlink temporary JSON file outside tracked sources, then run:

```bash
docu-docu changes feedback respond --input <response.json> \
  --repository-root <root> --json
```

Do not retry a conflict with rewritten expected values: fetch pending again,
confirm it is still the same batch, re-evaluate every item, and only then submit
a newly constructed response. A validation error means no item was accepted.

After a successful response, fetch pending again and process the next FIFO batch
the same way until `feedback: null`. Report outcomes, changed paths and checks;
never resolve discussions automatically.
