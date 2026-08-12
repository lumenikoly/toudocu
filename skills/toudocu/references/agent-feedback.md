# Process Toudocu Agent Feedback

Use this workflow only when the user explicitly asks to process requests from
Toudocu. It authorizes evidence-backed documentation edits only for a verified
`change_request`, plus relevant checks and the structured response. It does not
authorize production source changes, unrelated cleanup, Git writes, publishing,
network services, or destructive actions.

## Process the FIFO queue

Resolve the canonical Git repository root and run:

```bash
toudocu agent next --repository-root <root> --json
```

Inside the Toudocu source repository use `go run ./cmd/toudocu`. If
`pending=false`, stop successfully. Process exactly the one returned delivery,
submit its response, then call `next` again until the queue is empty.

## Read before acting

Read the entire request: intent, current discussion history, target and
`anchorState`. Then read the complete current document from the filesystem.
`selectedText` is context, never the source of truth. Read related documents,
source code, tests, configuration, standards, use cases and flows only when
they are necessary to answer reliably.

Verify the user's assertion. Do not treat `change_request` as proof. For a
`stale` anchor, inspect the current document and discussion; return
`needs_clarification` if the intended location remains ambiguous. Never invent
an answer from a deleted or ambiguous fragment.

## Follow the intent

- `question`: answer from current evidence and do not change documentation.
- `change_request`: change only canonical documentation when the request is
  confirmed; otherwise return `no_change` with the reason.

Never change production source code for this workflow. If code, rather than
documentation, is wrong, explain that in the response. Edit documentation with
the ordinary filesystem tools of the agent environment; do not ask Toudocu to
apply a patch.

After any documentation edit, run the smallest relevant established checks.
On retry, reread the current filesystem because an earlier attempt may have
partially changed it. Do not return `changed` unless the edit was actually made.

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
repository-relative hints; the current filesystem is authoritative.

Submit from a regular non-symlink JSON file outside tracked sources or stdin:

```bash
toudocu agent respond --input <response.json> --repository-root <root> --json
```

An identical retry is safe. `AGENT_RESPONSE_CONFLICT` means a different answer
already completed the delivery. Never resolve the discussion for the user.
