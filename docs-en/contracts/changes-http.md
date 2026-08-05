# HTTP contract Documentation Changes v1

- Identifier: CON-CHANGES-HTTP-V1
- Status: Completed
- Owner: Docu-docu Team
- Last updated: 2026-07-31

All endpoints are read-only, use `Cache-Control: no-store`, accept only
local Git revisions and restrict access to documentation roots.

| Method | Endpoint | Answer |
|---|---|---|
| `GET/HEAD` | `/_docu-docu/api/changes` | `ChangeSetReport`, ETag = digest |
| `GET` | `/_docu-docu/api/changes/file?path=...` | one `DocumentationChange` |
| `GET` | `/_docu-docu/api/changes/task?task=TASK-*` | `TaskImpactReport` |
| `GET` | `/_docu-docu/api/changes/content?side=before|after&path=...` | Git content |
| `GET` | `/_docu-docu/api/changes/render?side=before|after&path=...` | sanitized HTML |
| `GET` | `/_docu-docu/api/changes/screen-map` | screen/transition overlay v1 |

Summary accepts `base`, `target`, `type`, `status`, `module` and `task`.
Invalid revision returns 400; absence of Git - 503. Error envelope contains
`schemaVersion: 1` and `diagnostics[]`.

`path` — canonical repository-relative POSIX path of the change set element.
Absolute path, backslash, `..`, file outside documentation roots and `.git` not
are allowed. content responses are limited in size, use `nosniff` and CSP
`default-src 'none'`; SVG does not receive script, style or network permissions.
Renderer uses the existing sanitization policy.

Summary and file detail are cached by comparison, workspace revision, `HEAD`,
porcelain-v2 status and resolved by custom refs. Changing working tree,
index or HEAD creates a new cache key. The UI queries the HEAD summary from the ETag.
The changed digest saves the open path and URL filters and loads a new one
change set.

`file`, `content` and `render` perform path-scoped analysis: source patches and
specialized models are built only for the requested file. Summary does not transfer
full patch; The UI loads it lazily when opening detail.

For OpenAPI `semanticChanges[].field` addresses operation, parameter, response
header, security scheme or schema property. `compatibility` accepts
`breaking`, `potentially-breaking`, `non-breaking` or `informational`.
