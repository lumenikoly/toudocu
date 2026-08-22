# Standards, runbooks, and custom sections

Only `index.md` and `architecture/overview.md` are globally required. The
`quality/`, `runbooks/`, and any unknown top-level section become meaningful
when they contain Markdown. At that point, the section needs its own
`index.md`; a missing index is a warning and blocks only strict mode.

## `STD-*` standards

Every `quality/STD-*.md` file describes one unique `STD-*` standard.

A useful standard contains:

- canonical `id`, `status`, `scope`, and `updated` fields;
- status `draft`, `active`, `obsolete`, or `superseded`;
- non-empty sections marked `rules` and `automated-checks`;
- for a superseded standard, `supersededBy: STD-*` naming another existing ID.

An invalid or duplicate identifier and an invalid supersession link are
errors. Missing descriptive fields or sections are warnings. Commands written
in a standard are not executed automatically. A work item that names Standards
must map them to its `QUALITY` verification target.

Field names, machine values, and section kinds are never translated. Headings
and all other reader-facing text may use any language.

For example, define a rule for all Go code as a standard when the project can
name both its scope and its check precisely:

```markdown
<!-- toudocu
id: STD-GO-001
status: active
scope: Go code and tests
updated: 2026-08-18
-->

# STD-GO-001: Verify Go code


<!-- toudocu:section rules -->
## Rules

Code must pass formatting and tests.

<!-- toudocu:section automated-checks -->
## Automated checks

- `gofmt -w .`
- `go test ./...`
```

## `RB-*` runbooks

A runbook is a verified operational procedure. Every `runbooks/RB-*.md`
describes one unique `RB-*`.

It records canonical `id`, `status`, `risk`, and `lastVerified` fields, plus
an optional `environment` field, and contains these marked sections:

- `prerequisites`;
- `procedure` with numbered steps;
- `verification`;
- `rollback`.

High- and critical-risk runbooks also need `stop-conditions`. Supported
statuses are `draft`, `active`, `review-required`, and `obsolete`; supported
risks are `low`, `medium`, `high`, and `critical`.

For an active runbook, a date within `--stale-days` produces `recent`; an older
date produces `overdue`. `--stale-days 0` disables only the age comparison. A
missing, invalid, or future date, or status `Requires review`, produces
`review-required`. Freshness does not apply to draft or obsolete runbooks.

This repository currently has no `docs/runbooks/` section: no operational
procedures have been documented here yet.

Create a runbook only for an operation that people actually perform. For
example, recovering a service after an outage needs prerequisites, numbered
actions, result verification, and rollback. A general explanation of how to
start the service remains a guide and does not need an `RB-*` identifier.

## Custom sections

An unknown top-level directory is not classified by its name or contents. Its
`index.md` must contain:

- a non-empty description;
- an H1 title, used as the section name in portal navigation.

Other files in that directory remain ordinary Markdown.

## Work items and JSON

The Standards and Affected runbooks fields accept only existing identifiers.
`task context` adds those documents to typed collections, `documents`, and
`requiredReads`. Toudocu deliberately does not infer that a standard applies
from its Scope; the person doing the work makes that decision.

`ProjectReport` schema v1 contains `knowledge.standards`,
`knowledge.runbooks`, related work-item identifiers, and four runbook freshness
counters. Empty collections serialize as `[]`.
