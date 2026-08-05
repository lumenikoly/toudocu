# Work tasks

Docu-docu stores each work item in a separate file, `work/*.md`.
Functionality, maintenance, documentation and research uses
`TASK-*`, and bugs - `BUG-*`. All types remain one `WorkItem` entity,
use general statuses, dependencies, context/verify commands and the annual archive.

## Minimum draft

There must be exactly one task in one file. Heading starts with
unique `TASK-*`:

```md
# TASK-AUTH-014: Добавить восстановление пароля

- Статус: Черновик
- Тип: Feature

## Результат

Пользователь может запросить ссылку для восстановления пароля.
```

For a draft, correct `Статус`, `Тип` and a non-empty section are required
`Результат`. Other fields and sections can be added later.

## When to create a task

Docu-docu creates a neutral framework, but does not decide whether the work item is needed for
specific request. Don't create `TASK-*` for every prompt, normal
question, reading code, formatting, small local edits or
refactoring without changing behavior.

A new task is justified when it is clearly required by the user or policy
repository or when significant work needs stable scope, acceptance
criteria, verification or transfer between sessions and executors. Usually this
contract or architecture changes, migrations and multi-step changes
behavior. If a Ready+ task already exists, use its context instead
creating a duplicate.

The installed skill sets this selective mode to `AGENTS.md` only by
explicit prompt call `$docu-docu init`. This is not a Go CLI command and is not a reason
create a separate task just for the sake of initialization.

Full `$docu-docu refresh` and limited `$docu-docu refresh diff` also
do not create `TASK-*` unconditionally. They apply the same threshold: durable work item
appears only with a significant scope, stable acceptance criteria,
handoff or an explicit requirement of the user or project.

## Statuses

| Status | When to use | Additional rules |
|---|---|---|
| `Черновик` | The task is still being specified | Type and result are enough |
| `Готово к работе` | Task contract agreed | All work sections and checks are required `AC-*` |
| `В работе` | Changes in progress | The same requirements apply as for a completed task |
| `Заблокировано` | Work cannot be continued | Requires a non-empty section `Блокер` |
| `Выполнено` | Work accepted | All `AC-*` are checked; `ALL` and `DOCS` are required; dependencies completed |
| `Отменено` | The task is no longer needed | Requires a non-empty section `Причина отмены` |

Markdown also accepts the English values `draft`, `ready`,
`in progress`, `blocked`, `done`/`completed` and `cancelled`/`canceled`.

## Actual impact on documentation

`docu-docu task changes TASK-ID --base ... --target ...` and the Changes tab
map explicitly listed `Влияние на документацию` paths to Git change
set. `TASK-*` itself is displayed separately as a task contract and does not increase
permanent documentation counter. Explicit paths take precedence over computed paths
connections module/use case/flow/screen/contract.

`declared-document-not-changed` and `undeclared-document-change` by default
warning: this is a review signal, not an automatic conclusion about the correctness of the code.
The active base/target is always shown; Docu-docu does not detect hidden source
commit tasks.

## Types

The type describes the nature of the change, not its state.

| Meaning | Meaning | Related Scenario |
|---|---|---|
| `Feature` | New or changed user functionality | Required |
| `Bug` | Fixing a user error | Required |
| `Maintenance` | Refactoring, Infrastructure and Maintenance | Optional |
| `Documentation` | Documentation changes | Optional |
| `Research` | Research or hypothesis testing | Optional |

For a technical type without a `Сценарий` field, a non-empty section is needed
`Обоснование отсутствия сценария`. If a script is specified for any type, it
`UC-*` must exist.

In Markdown you can use Russian values `Функциональность`, `Ошибка`,
`Обслуживание`, `Документация` and `Исследование`. In reports they are normalized to
English values from the table.

`task init --type Bug` creates `work/BUG-AREA-NNN.md`; other types receive
`TASK-AREA-NNN`. For `Тип: Bug` the prefix `BUG-` is required, but `BUG-*` is not possible
use with other type.

## Special bug contract

The bug first records the existence of a defect and then proves a fix
the same scenario. The following fields are always required: `Серьёзность`, `Приоритет`,
`Воспроизводимость`, `Регрессия`, `Модуль`, `Сценарий`, `Владелец` and
`Последнее обновление`.

| Field | Valid values ​​|
|---|---|
| `Серьёзность` | `Критическая`, `Высокая`, `Средняя`, `Низкая` |
| `Приоритет` | `Срочный`, `Высокий`, `Обычный`, `Низкий` |
| `Воспроизводимость` | `Всегда`, `Часто`, `Иногда`, `Редко`, `Не воспроизводится`, `Неизвестно` |
| `Регрессия` | `Да`, `Нет` |

Severity describes the consequences, and priority describes the order of operation; Docu-docu not
calculates one field from another. For `Регрессия: Да`, the document specifies
version or period of manifestation.

Even the bug draft contains non-empty sections `Симптом`, `Ожидаемое поведение`
and `Фактическое поведение`, as well as non-empty `Шаги воспроизведения` or
`Доказательства`. Starting with `Готово к работе`, additionally required
`Причина`, `Область изменения`, `Не входит в исправление`, `План`,
`Критерии приёмки`, `Проверка` and `Влияние на документацию`.

If the reason has not yet been confirmed, you should write `Не установлена` and make
assumptions in a separate section `Гипотезы`. The executed bug already has a reason
must be installed. The bug plan is drawn up as a numbered list without
checkboxes; checkboxes remain only for `AC-*`.

For a ready-to-run bug, you need a criterion that explicitly checks the regression test.
If automation is technically impossible, reason and exact manual scenario
are described in a non-empty `Регрессионный тест` section.

A technical defect could use `Сценарий: Не применяется`, but then
A non-empty `Связь с пользовательским поведением` section is required. Specified
`MOD-*`, `UC-*`, `SC-*`, `TR-*` and dependencies must exist.

Evidence should not contain passwords, tokens, keys, or personal data
or raw production dumps with sensitive data.

## Task fields

| Field | Requirement |
|---|---|
| `Статус` | Always required; value from the status table |
| `Тип` | Always required; value from type table |
| `Модуль` | Required starting with `Готово к работе`; `MOD-*` must exist |
| `Сценарий` | Required for `Feature` and `Bug`; the specified `UC-*` must exist |
| `Процесс` | Optional reference to an existing `FLOW-*`; added to task context |
| `Стандарты` | Optional list of existing `STD-*`; requires target `QUALITY` |
| `Затронутые runbooks` | Optional list of existing `RB-*`; added to task context |
| `Зависит от` | Optional list of `TASK-*` and `BUG-*` separated by space, comma or semicolon |
| `Приоритет` | Optional label; there is no fixed set of values ​​|
| `Владелец` | Optional team or owner name |
| `Последнее обновление` | Optional date used by expiration check |

Task IDs must be unique. Dependencies must exist and
do not form cycles. A task cannot be transferred to `Выполнено` until at least one
its dependency is not fulfilled.

## Archive

Active tasks are located in the `work/` root. Completed and canceled tasks can be
move to annual archive:

```text
work/TASK-AUTH-014.md
work/BUG-AUTH-021.md
work/archive/2026/TASK-AUTH-009.md
```

Use commands rather than manual movement:

```bash
docu-docu task archive TASK-AUTH-009 ./docs --format json
docu-docu task restore TASK-AUTH-009 ./docs --format json
```

Archiving is only allowed for `Done`/`Выполнено` and
`Cancelled`/`Отменено`. Team checking contract, safe path, conflict
assignments, incoming Markdown links, and relative links to the task itself. When
At the risk of the link being broken, the file remains in place. Contents and status of the task command
doesn't change.

`task restore` returns the file from `work/archive/YYYY/` to `work/`. It also
available for an erroneously archived active task to restore
correct structure. Identifiers `TASK-*`/`BUG-*` and dependencies are valid
globally throughout `work/**`; `task init` does not reuse archived numbers.

## Required sections

Starting with the `Готово к работе` status, the task contains non-empty sections:

1. `Результат` - observable result of the work.
2. `Изменение поведения` with subsections `Было` and `Станет` - required for
   Feature; The bug uses separate sections from a special contract.
3. `Область изменения` - files and directories that are allowed to be changed.
4. `Не входит в задачу` - clearly excluded work.
5. `Критерии приёмки` - conditions to be checked with ID `AC-*`.
6. `План` - expected sequence of work.
7. `Проверка` - commands for criteria, as well as `ALL` and `DOCS`.
8. `Влияние на документацию` - what needs to be updated or why the update is not needed.

Paths in `Области изменения` written in backticks are checked
regarding `--repository-root`. The path cannot go beyond the root of the repository and
must exist. A new missing file is allowed if it exists
safe parent directory. Glob patterns are required to find matches.

## Criteria and checks

Checkboxes are allowed in the `Критерии приёмки` and `План` sections. Each criterion
starts with a unique local ID `AC-*`:

```md
## Критерии приёмки

- [ ] `AC-01` Неверный токен возвращает ошибку `INVALID_TOKEN`.
- [ ] `AC-02` Действительный токен позволяет сменить пароль.
```

Each criterion requires exactly one entry in the `Проверка` section. One entry
refers to exactly one target and contains at least one command:

```md
## Проверка

- `AC-01` → `go test ./internal/auth -run TestInvalidToken`
- `AC-02` → `go test ./internal/auth -run TestResetPassword`
- `ALL` → `go test ./...`
- `DOCS` → `docu-docu check ./docs --strict`
```

Targets have the following meaning:

| Target | Which confirms |
|---|---|
| `AC-*` | Separate acceptance criterion |
| `ALL` | Full project check |
| `DOCS` | Full documentation check |
| `QUALITY` | Verification of explicitly related standards by task commands |

Readiness requires exactly one command for each `AC-*`, `ALL`, and `DOCS`.
If `Стандарты` is non-empty, exactly one additional `QUALITY` is required, and full
verification means `ALL + DOCS + QUALITY`. `task context` includes explicitly
related standards and runbooks in typed collections, `documents` and
`requiredReads`; There is no automatic comparison between the standard scope and scope.
For `Выполнено` status, all criteria must be `[x]`.

## Complete example

```md
# TASK-AUTH-014: Добавить восстановление пароля

- Статус: Готово к работе
- Тип: Feature
- Приоритет: Высокий
- Модуль: MOD-AUTH
- Сценарий: UC-AUTH-03
- Процесс: FLOW-AUTH-RECOVERY
- Владелец: Команда Identity
- Зависит от: TASK-MAIL-004
- Последнее обновление: 2026-07-27

## Результат

Пользователь может безопасно восстановить пароль по одноразовой ссылке.

## Изменение поведения

### Было

Пользователь не может самостоятельно восстановить забытый пароль.

### Станет

Пользователь восстанавливает пароль по одноразовой ссылке.

## Область изменения

- `internal/auth/`;
- `internal/mail/`;
- `docs/modules/auth.md`.

## Не входит в задачу

- изменение правил регистрации;
- новый почтовый провайдер.

## Критерии приёмки

- [ ] `AC-01` Просроченный токен отклоняется.
- [ ] `AC-02` Действительный токен позволяет сменить пароль один раз.

## План

- [ ] Добавить выпуск и хранение токена.
- [ ] Реализовать проверку срока и одноразового использования.
- [ ] Обновить документацию модуля.

## Проверка

- `AC-01` → `go test ./internal/auth -run TestExpiredResetToken`
- `AC-02` → `go test ./internal/auth -run TestResetTokenSingleUse`
- `ALL` → `go test ./...`
- `DOCS` → `docu-docu check ./docs --strict`

## Влияние на документацию

Обновить сценарий восстановления пароля и правила модуля авторизации.
```

## Executing commands

`task ready` checks the full Draft without changing the status. `task context`
collects information starting from Ready. `task verify --dry-run` returns the plan, and
`task verify --run` after the local gate sequentially executes the selected
commands from the repository root.

Identical commands are executed once, even if associated with several
targets. The error of one team does not stop the others. Teams count
trusted repository code and executed with the rights of the current user.

Details of report formats and exit codes are in
[CLI contract](../contracts/cli.md).