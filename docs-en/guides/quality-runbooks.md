# Standards, Runbooks and Custom sections

The manual describes the author's contract for optional sections. Globally
`index.md` and `architecture/overview.md` are required; lack of manifest
appeared `quality/`, `runbooks/` or custom section is a warning and
becomes gate only with `--strict`.

## Standards

Each `quality/*.md`, except `quality/index.md`, declares one unique
`STD-*`.

The structure required for a useful document is:

- `Идентификатор` / `Identifier`: correct `STD-*`; error if incorrect or
  repeated ID;
- `Владелец` / `Owner`, `Область` / `Scope`, ISO date
  `Последнее обновление` / `Last updated`: warning if missing or error;
- status `Черновик` / `Draft`, `Действует` / `Active` or `Effective`,
  `Устарел` / `Obsolete` or `Deprecated`, `Заменён` / `Superseded`;
- non-empty `Правила` / `Rules` and `Автоматические проверки` /
  `Automated checks`: warning if missing;
- the replaced standard specifies `Заменён` / `Superseded by: STD-*`; unfaithful,
  unknown or self reference is error.

Commands from the standard are not executed. Work item with non-empty `Стандарты` declares
own mapping `QUALITY`.

## Runbooks

Each `runbooks/*.md`, except `runbooks/index.md`, declares one unique
`RB-*`. Invalid or duplicate ID and inaccessible or insecure Markdown link
are errors.

Fields `Владелец` / `Owner`, `Среда` / `Environment`, `Риск` / `Risk`, status and
ISO date `Последняя проверка` / `Last verified` are checked by warnings. Statuses:
`Черновик` / `Draft`, `Действует` / `Active`, `Требует проверки` /
`Requires review`, `Устарел` / `Obsolete` or `Deprecated`. Risk:
`Низкий` / `Low`, `Средний` / `Medium`, `Высокий` / `High`,
`Критический` / `Critical`.

Must be non-empty:

- `Предварительные условия` / `Prerequisites`;
- `Процедура` / `Procedure` with numbered steps;
- `Проверка` / `Verification`;
- `Откат` / `Rollback`.

For high and critical risk, additional
`Условия остановки` / `Stop conditions`.

For a valid runbook, a valid date within `--stale-days` means
`recent`, older - `overdue`. The `--stale-days 0` value only disables
age-based overdue. Missing, incorrect or future date and status
`Requires review` means `review-required`. Draft and obsolete with valid
date have freshness `not-applicable`.

## Custom sections

Unknown top-level directory with Markdown is not classified by name,
number of files or content. Its `index.md` contains:

- `Тип: Custom` / `Type: Custom`;
- owner;
- non-empty description;
- H1, which becomes the title of the section in the navigation.

The absence or incompleteness of manifest are warnings. Other documents
sections remain normal Markdown.

## Task context and JSON

Fields `Стандарты` / `Standards` and `Затронутые runbooks` /
`Affected runbooks` only accept existing IDs. Task context includes
explicitly related entries in typed collections, `documents` and `requiredReads`.
There is no standard automatic mapping of task scope to `Scope`.

ProjectReport schema v1 additively contains `knowledge.standards`,
`knowledge.runbooks`, task ID collections, and four runbook metrics. Empty
collections are serialized as `[]`; The version of schema and generator does not change.