# Standards, runbooks, and custom sections

Only `index.md` and `architecture/overview.md` are globally required. The
`quality/`, `runbooks/`, and any unknown top-level section become meaningful
when they contain Markdown. At that point, the section needs its own
`index.md`; a missing index is a warning and blocks only strict mode.

## `STD-*` standards

Every `quality/*.md` file except `quality/index.md` describes one unique
`STD-*` standard.

A useful standard contains:

- `Identifier`, `Owner`, `Scope`, and an ISO `Last updated` date;
- status `Draft`, `Active` or `Effective`, `Obsolete` or `Deprecated`, or
  `Superseded`;
- non-empty Rules and Automated checks sections;
- for a superseded standard, `Superseded by: STD-*` naming another existing
  standard.

An invalid or duplicate identifier and an invalid supersession link are
errors. Missing descriptive fields or sections are warnings. Commands written
in a standard are not executed automatically. A work item that names Standards
must map them to its `QUALITY` verification target.

Russian field names and statuses are also recognized; use them only in a
Russian-language documentation root.

## `RB-*` runbooks

A runbook is a verified operational procedure. Every `runbooks/*.md` file
except `index.md` describes one unique `RB-*`.

It records an owner, environment, risk, status, and `Last verified` date, and
contains these non-empty sections:

- Prerequisites;
- Procedure with numbered steps;
- Verification;
- Rollback.

High- and critical-risk runbooks also need Stop conditions. Supported statuses
are `Draft`, `Active`, `Requires review`, and `Obsolete` or `Deprecated`.
Supported risks are `Low`, `Medium`, `High`, and `Critical`.

For an active runbook, a date within `--stale-days` produces `recent`; an older
date produces `overdue`. `--stale-days 0` disables only the age comparison. A
missing, invalid, or future date, or status `Requires review`, produces
`review-required`. Freshness does not apply to draft or obsolete runbooks.

This repository currently has no `docs/runbooks/` section: no operational
procedures have been documented here yet.

## Custom sections

An unknown top-level directory is not classified by its name or contents. Its
`index.md` must contain:

- `Type: Custom`;
- an owner;
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
