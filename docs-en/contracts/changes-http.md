# Changes HTTP API: Behavior and Boundaries

- Identifier: CON-CHANGES-HTTP-V1
- Status: Completed
- Owner: Docu-docu Team
- Last updated: 2026-08-05

[OpenAPI 3.1.0](changes.openapi.yaml) contains routes, parameters, response
codes, and data schemas. In canonical `serve`, this page also provides a button
for opening the specification in Swagger UI.

This document answers a different question: where the API obtains changes and
which constraints it preserves while reading Git and files.

## Availability

The API operates only in `serve` mode and writes nothing. When a translation
root is served directly, it reads that selected root; locale sections of the
canonical portal receive no separate API. Go enables the changes UI only with
the `changes` capability and passes a same-origin API base in the versioned page
bootstrap; the static frontend contains no endpoint.

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

## Related documents

- [Why the wire contract is separate from behavior](../decisions/ADR-004.md)
- [Documentation Changes module](../modules/MOD-CHANGES.md)
- [How documentation comparison works](../architecture/documentation-changes.md)
- [ChangeSetReport fields](../reference/changes-report.md)
