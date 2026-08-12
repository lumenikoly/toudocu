# Agent feedback JSON, version 1

Public data contains `schemaVersion: 1`. Paths use `/` and are relative to the
repository root, one-based lines and columns count Unicode characters,
timestamps use UTC RFC3339, and empty arrays serialize as `[]`.

## Retrieve a queue entry

```bash
toudocu agent next --json
```

An empty queue returns exit code `0`:

```json
{
  "schemaVersion": 1,
  "pending": false
}
```

When work is available, the command returns the single oldest queue entry, the
history of that discussion only, the current anchor placement, current `HEAD`,
`pendingCount`, and `hasMore`. The call also creates a time-limited lease.

When an anchor is created, the browser sends the selected text and the
one-based ordinal of an identical fragment in `occurrence`. The server computes
Unicode character lines and columns; page-element coordinates are not stored.

## Submit a response

```bash
toudocu agent respond --input response.json --json
cat response.json | toudocu agent respond --json
```

Minimal response:

```json
{
  "schemaVersion": 1,
  "deliveryId": "DEL-01J...",
  "discussionId": "DISC-01J...",
  "outcome": "answered",
  "message": "A full rebuild is needed only after a configuration change.",
  "evidence": [
    {
      "path": "internal/server/rebuild.go",
      "startLine": 81,
      "endLine": 103
    }
  ],
  "changedPaths": []
}
```

`outcome` accepts `answered`, `changed`, `no_change`,
`needs_clarification`, or `failed`. `changed` requires at least one path inside
the canonical documentation root. It is not allowed for `question`.

## Limits

| Field | Maximum size |
|---|---:|
| Human message | 64 KiB |
| Complete `AgentResponse` | 64 KiB |
| `selectedText` | 32 KiB |
| `contextBefore` | 2 KiB |
| `contextAfter` | 2 KiB |

## Diagnostics

Stable codes are `AGENT_DISCUSSION_NOT_FOUND`, `AGENT_DELIVERY_NOT_FOUND`,
`AGENT_INVALID_TARGET`, `AGENT_INVALID_MESSAGE`, `AGENT_INVALID_PATH`,
`AGENT_PATH_OUTSIDE_ROOT`, `AGENT_REVISION_CONFLICT`, `AGENT_INBOX_BUSY`,
`AGENT_RESPONSE_CONFLICT`, `AGENT_STATE_CORRUPTED`, and
`AGENT_PAYLOAD_TOO_LARGE`.

Invalid input, an unknown ID, or a conflict does not change local state.
