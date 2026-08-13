# Process Toudocu Agent Feedback

Use this workflow only when the user explicitly asks to process requests from
Toudocu. It authorizes evidence-backed edits only for a verified
`change_request` and only within the target boundary below, plus the structured
response. It does not authorize unrelated cleanup, validation, Git writes,
publishing, network services, or destructive actions.

## Process the FIFO queue

Resolve the canonical Git repository root and run:

```bash
toudocu agent next --repository-root <root> --json
```

Inside the Toudocu source repository use `go run ./cmd/toudocu`. If
`pending=false`, stop successfully. Process exactly the one returned delivery.
Before requesting the next delivery or exiting, always complete the current one
with `toudocu agent respond`. Then call `next` again until the queue is empty.

An open discussion is not pending work. A successful response changes that
delivery to `responded`, so `agent next` does not return it again. Only a new
human message creates new work in the same open discussion.

## Read before acting

Read the entire request: intent, current discussion history, target and
`anchorState`. Then read the complete current target from the filesystem when
it still exists. For `target.kind=file`, also inspect the relevant Git diff.
`selectedText` is context, never the source of truth. Read only the target,
discussion history, relevant Git diff and the minimum repository context needed
to understand the request. Follow repository instructions before editing any
target.

Verify the user's assertion. Do not treat `change_request` as proof. For a
`stale` anchor, inspect the current document and discussion; return
`needs_clarification` if the intended location remains ambiguous. Never invent
an answer from a deleted or ambiguous fragment.

## Follow the intent

- `question`: answer from current evidence and do not change documentation.
- `change_request`: when the request is confirmed, change `target.path` and only
  additional files that the human unambiguously named in that message and that
  remain inside the existing safe boundary for the target kind. Do not infer a
  related path. If an additional path is ambiguous, return
  `needs_clarification` without changing it.

A `document` target permits canonical documentation paths; a `file` target
permits safe repository paths. Naming a path does not widen that boundary.

Do not change any file for a `question`. Edit permitted paths with the ordinary
filesystem tools of the agent environment; do not ask Toudocu to apply a patch.
Do not update related documentation, a changelog, generated files or neighboring
code unless the human unambiguously named each path in the request and the path
is permitted by the target kind.

Do not run `check`, tests, lint, build or any other validation command inside
this workflow. On retry, reread the current filesystem because an earlier
attempt may have partially changed it. Do not return `changed` unless the edit
was actually made.

## Submit one human-readable response

Create a schema-v1 object with the unchanged `deliveryId` and `discussionId`:

```json
{
  "schemaVersion": 1,
  "deliveryId": "DEL-...",
  "discussionId": "DISC-...",
  "outcome": "answered",
  "message": "A complete answer for the user.",
  "evidence": [],
  "changedPaths": []
}
```

Allowed outcomes are `answered`, `changed`, `no_change`,
`needs_clarification` and `failed`. The message must be useful natural prose,
not a restatement of the outcome token. Evidence and changed paths are safe
repository-relative hints; the current filesystem is authoritative. For
`changed`, the message must explicitly say that the requested edits were made
and list every path from `changedPaths`.

Submit from a regular non-symlink JSON file outside tracked sources or stdin:

```bash
toudocu agent respond --input <response.json> --repository-root <root> --json
```

An identical retry is safe. `AGENT_RESPONSE_CONFLICT` means a different answer
already completed the delivery. Never resolve the discussion for the user.
