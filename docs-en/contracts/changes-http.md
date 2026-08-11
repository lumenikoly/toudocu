# Changes HTTP API: Behavior and Boundaries

- Identifier: CON-CHANGES-HTTP-V1
- Status: Ready
- Owner: Toudocu team
- Last updated: 2026-08-10

[OpenAPI 3.1.0](changes.openapi.yaml) contains routes, parameters, response
codes, and data schemas. In canonical `serve`, this page also provides a button
for opening the specification in Swagger UI.

This document covers the guarantees that the HTTP schema cannot express on its
own: where versions come from, how Git reads are bounded, and how local
discussions are stored.

## Availability

The change-view API operates only in `serve` mode and writes nothing. When a translation
root is served directly, it reads that selected root; locale sections of the
canonical portal receive no separate API. Go enables the changes UI only with
the `changes` capability and passes a same-origin API base in the versioned page
bootstrap; the static frontend contains no endpoint.

The review endpoints in the same OpenAPI contract exist only in the main
`serve` portal. Every supported Git range can be read, but discussions, agent
batches, and cleanup can be changed only when the comparison ends at
`working-tree`.

## Version comparison

The API compares local commits, index, and working tree without `fetch`,
`checkout`, or changes to Git state. The `branchBase` parameter computes a merge
base with `HEAD`. If `base` is supplied with it, both references must resolve
locally.

The ETag is computed from the filtered change set. The cache includes the
comparison, current documentation revision, `HEAD`, Git status, and resolved
revisions, so an index or working-tree change cannot return a stale report.

The summary does not contain a full patch. A detailed report, source content,
and HTML representation are built only for the requested file.

## Read security

The path must be a relative POSIX path inside an allowed documentation root.
Absolute paths, `..`, backslashes, `.git`, symlink escapes, and paths outside the
root are rejected.

Source content is returned with a server-selected media type,
`X-Content-Type-Options: nosniff`, and a restrictive CSP. Before Markdown is
served as `text/html`, it passes through the safe renderer. SVG receives no
permission to run scripts, access the network, or apply embedded styles.

A failure while analyzing one representation—semantic diff, Mermaid, OpenAPI,
screen, or asset—remains a local diagnostic and does not hide an available
source diff.

## Repository-wide discussions

`/_toudocu/api/changes/review/` lists tracked files and new non-ignored files
across the repository. It uses the same read-only Git mode but does not change
the public `ChangeSetReport`, the regular `changes` command, or the Go API.

Old and current file contents and patches are loaded only when requested. Go
validates the path, regular-file type, UTF-8 encoding, absence of NUL bytes and
binary content, and the 2 MiB limit. Known documentation files also receive the
usual rendered and semantic views.

Discussion state is stored outside the repository. Every write requires JSON,
the exact `X-Toudocu-Action`, a same-origin browser context, and the expected
state version and hash. The write takes an inter-process lock, checks those
values again, and atomically replaces the state file.

Common error responses are:

- `409` when the state changed;
- `REVIEW_STATE_BUSY` when another process holds the store;
- `413` when a message or file is too large;
- `415` for a binary file;
- `403` for an unsafe path or symbolic link;
- `404` for an unknown identifier;
- `503` when Git is unavailable;
- `500` for corrupt storage, which Toudocu does not overwrite automatically.

The review ETag combines the stored state hash with the current repository
version. Anchor relocation is therefore recalculated after a Git change even
when no discussion was edited.

“Send to agent” includes every new message from open discussions in one batch.
The CLI returns batches in order and repeats the oldest until it accepts one
complete valid response. That response must contain exactly one result per
message and safe relative `changedPaths`. A `fixed` result does not resolve the
discussion.

Exact limits, fields, examples, and HTTP statuses are defined in the
[OpenAPI contract](changes.openapi.yaml).

## Related documents

- [Why the wire contract is separate from behavior](../decisions/ADR-004.md)
- [Documentation Changes module](../modules/MOD-CHANGES.md)
- [Local discussions module](../modules/MOD-REVIEW.md)
- [Keeping comments attached](../architecture/review-anchoring.md)
- [How documentation comparison works](../architecture/documentation-changes.md)
- [ChangeSetReport fields](../reference/changes-report.md)
