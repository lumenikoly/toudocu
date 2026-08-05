# CONTRACT-EDITOR-HTTP: Local editor API

- Type: HTTP contract
- Status: Completed
- Schema version: 1
- Mode: `docu-docu serve` only
- Task: TASK-SITE-002
- Module: MOD-SITE
- Script: UC-DOCS-03
- Process: FLOW-DOCS-SERVE

The contract defines the current same-origin API of the local workspace. All
routes are prefixed with `/_docu-docu/api/editor` and always return
`Cache-Control: no-store` and do not issue CORS headers. JSON responses contain
`schemaVersion: 1`.

This contract is published only for the canonical docs root. Direct `serve`
on a configured translation root builds the portal without the editor UI or
editor API; translation sources change only through an explicit
`$docu-docu translate` workflow.

## General rules

- Maximum JSON request body - 3 MiB, `content` field - 2 MiB.
- JSON is decoded strictly: unknown fields and value after the first object
  return `400 invalid_json`.
- The `PUT`/`POST` writer requires the `Content-Type: application/json` header
  `X-Docu-docu-Action` with the operation value and same-origin browser context:
  matching `Origin` and/or `Sec-Fetch-Site: same-origin`.
- Unknown method returns `405 method_not_allowed` and `Allow`.
- The error has a single form:

```json
{
  "schemaVersion": 1,
  "error": {"code": "stale_digest", "message": "Файл изменён", "details": {}}
}
```

`details` is optional. For `stale_digest` it contains the actual `digest`,
`content` and `revision` so that the user can compare versions. API doesn't accept
commands and does not launch Git, shell or task verification.

Diagnostics in all success envelopes have the form
`{severity, code, message, path, line, column}`; `line` and `column` start with
ones and equal to zero when the position is unknown. `rebuild` has the form
`{documents, pages, warnings, errors}`. The file in all answers is serialized as
`{path, language, size, digest, title?, documentURL?}`; replies with content
add `content` and `diagnostics`.

Same-origin guards protect the browser from cross-origin entries, but do not authenticate
arbitrary HTTP client. If the operator is explicitly listening to a non-loopback address, it
includes available local network clients in the trust boundary and gets the current
CLI warning about lack of TLS and authorization.

## `GET /files`

Returns the current revision, list of files and general template registry:

```json
{
  "schemaVersion": 1,
  "revision": "<sha256-workspace-fingerprint>",
  "files": [{
    "path": "modules/site.md",
    "language": "markdown",
    "size": 1200,
    "digest": "<sha256>",
    "title": "MOD-SITE: Портал",
    "documentURL": "modules/site.html"
  }],
  "templates": [{
    "key": "module",
    "label": "Модуль",
    "fields": [{"name":"id","label":"Идентификатор","type":"text","required":true}],
    "languages": ["ru", "en"]
  }]
}
```

`ETag` contains quoted revision. Matching `If-None-Match` returns `304`
without body. Serve HTML contains the revision baseline, and the frontend polls this
route once every two seconds, so the change to the first poll is not lost.

## `GET|PUT /file`

`GET /file?path=<canonical-posix-path>` returns an object
`{schemaVersion, revision, file}`, where `file` contains `path`, `language`,
`size`, `content`, `digest`, optional `title`/`documentURL` and positional
`diagnostics`; even empty content and diagnostics are serialized as `""` and `[]`.
Revision is calculated from the current workspace fingerprint, not from the last one
successful reassembly. `GET` with `raw=1` returns
`text/plain; charset=utf-8`, `X-Content-Type-Options: nosniff` and read-only source.

`PUT /file` accepts:

```json
{
  "path": "modules/site.md",
  "content": "# MOD-SITE…",
  "expectedDigest": "<sha256>",
  "confirmOverwrite": false
}
```

`X-Docu-docu-Action` is equal to `save`. Success returns
`{schemaVersion, revision, file, rebuild}` with updated content, digest and
diagnostics.
Mismatch digest returns `409 stale_digest` and remembers pending
confirmation conflict. Explicit overwrite - a new request with the current digest from
conflict response and `confirmOverwrite: true`; same request without confirmation
gets `409` again, and the second external change updates the conflict and also
returns `409`.

## `POST /preview`

Accepts `{path, content}` and `X-Docu-docu-Action: preview`. For Markdown it returns
`{schemaVersion, path, html, diagnostics}` with secure HTML existing
renderer and diagnostics in-memory overlay. Links
are resolved relative to the document only to the secure portal/repository
targets. For other extensions, `415 preview_not_supported` is returned.

## `POST /validate`

Accepts `{path, content}` and `X-Docu-docu-Action: validate`. Returns an object:

```json
{"schemaVersion":1,"path":"index.md","diagnostics":[{"severity":"error","code":"broken-link","message":"…","path":"index.md","line":4,"column":1}]}
```

Markdown uses the full model with in-memory overlay. JSON gets syntax
diagnostics and existing `screens/hotspots.json` checks. YAML is not received
a fictitious general schema and returns only available Docu-docu diagnostics.
Diagnostics do not block saving.

## `POST /create`

Accepts `X-Docu-docu-Action: create`, `template` and typed fields of the selected
general registry element `task-init`, `module`, `use-case`, `flow`, `screen`,
`decision`, `standard` or `runbook`. Each template entry has `key`, `label`,
ordered `fields` and `languages`; field contains `name`, `label`, `type` (`text`
or `select`), `required` and optional `options`. The registry specifies the order, validation,
target path and renderer for both browser and CLI. Creation uses
atomic `O_EXCL`; success `201` returns
`{schemaVersion, revision, file, rebuild}` with content and diagnostics created
file. Path conflict returns `409 file_exists`.

## Path contract

Only a non-empty canonical relative POSIX path to a regular path is allowed
workspace file `.md`, `.yaml`, `.yml` or `.json`. Absolute paths, empty and
`.` segments, `..`, backslash, NUL, percent-encoded remainders, repeat URL
coding, hidden/excluded/output paths and any symlink/reparse component
are rejected as `400 invalid_path` or `403 path_forbidden`.

Workspace protects against accidental traversal and existing symlink/reparse
paths in the trusted local working copy. It repeats component checks before
pathname operations, but does not promise handle-relative protection against privileged
local process that deliberately replaces a directory in the exact window between
check and operation; such a process is outside the threat model of the local `serve`.
