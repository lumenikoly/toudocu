# CLI-контракт Docgent v1

- Идентификатор: CON-CLI-V1
- Статус: Готово
- Владелец: Команда Docgent
- Последнее обновление: 2026-07-30

Контракт фиксирует публичные команды, exit codes и машинные JSON-форматы
Docgent.

## Команды

| Команда | Побочные эффекты | Результат |
|---|---|---|
| `check` | отсутствуют | diagnostics или `ProjectReport` |
| `build` | записывает output, при `--clean` безопасно очищает его | автономный портал и `report.json` |
| `serve` | собирает output, запускает HTTP и по явному browser save изменяет workspace | editor API, watcher и live rebuild |
| `changes` | отсутствуют; только read-only Git | text, Markdown или `ChangeSetReport` v1 |
| `changes file` | отсутствуют | detail одного изменённого path |
| `search` | отсутствуют | `SearchReport` по свежим Markdown |
| `task init` | атомарно создаёт новый `TASK-*` или `BUG-*` по типу | `TaskInitReport` |
| `scaffold` | атомарно создаёт выбранную сущность | `ScaffoldReport` |
| `task ready` | отсутствуют | `TaskReadyReport` |
| `task context` | отсутствуют | `TaskContextReport` выбранной Ready+ задачи |
| `task verify --dry-run` | отсутствуют | план `TaskVerifyReport` |
| `task verify --run` | исполняет доверенные команды задачи | `TaskVerifyReport` |
| `task archive` | без перезаписи перемещает один терминальный work item в `work/archive/YYYY/` | `TaskMoveReport` |
| `task restore` | без перезаписи возвращает один архивный work item в `work/` | `TaskMoveReport` |
| `task changes` | отсутствуют | task-specific report и impact diagnostics |
| `version` | отсутствуют | версия генератора |

Вызов `docgent ./docs ...` эквивалентен `docgent build ./docs ...`.
Историческая команда верхнего уровня `init`, skill-level имя `refresh` и
прежняя `task check` отсутствуют без alias. Вызовы `docgent init` и `docgent
refresh` отклоняются как неизвестные команды; `$use-docgent init`,
`$use-docgent refresh` и `$use-docgent refresh diff` принадлежат AI-skill.

```text
docgent search "<query>" [docs-dir] [--limit N] [--format text|json]
docgent task init [docs-dir] --area AREA --title TITLE --type TYPE [--lang en|ru]
  docgent scaffold module|use-case|flow|screen|decision|standard|runbook ID [docs-dir] --title TITLE [--lang en|ru]
docgent task ready TASK-ID [docs-dir] [--strict] [--format text|json]
docgent task context TASK-ID [docs-dir] [--format text|json]
docgent task verify TASK-ID [docs-dir] (--dry-run|--run) [--target TARGET] [--report FILE] [--timeout DURATION] [--format text|json]
docgent task archive TASK-ID [docs-dir] [--repository-root DIR] [--format text|json]
docgent task restore TASK-ID [docs-dir] [--repository-root DIR] [--format text|json]
docgent changes [docs-dir] [--base REV|--branch-base REF] [--target working-tree|index|HEAD|REV] [--format text|json|markdown]
docgent changes file PATH [docs-dir] [параметры changes]
docgent task changes TASK-ID [docs-dir] [параметры changes]
```

В каталоге документации глобально ожидаются `index.md` и
`architecture/overview.md`. Overview обязан иметь тип `Architecture Overview`,
а каждый другой `architecture/**/*.md` — непустой архитектурный вопрос и
прямую локальную ссылку из overview. Архитектурные broken/blocked links являются
errors. `status.md`, `roadmap.md` и остальные типизированные каталоги
необязательны; правила конкретного типа применяются при его наличии.

Статусы, типы, обязательные поля, разделы и команды `TASK-*`/`BUG-*` описаны в
[руководстве по рабочим задачам](../guides/work-items.md).
Значение `--title` для `task init` и `scaffold` всегда однострочное.

## Общие параметры

```text
-o, --output <directory>
-t, --title <name>
    --exclude <paths>
    --stale-days <number>
    --repository-root <path>
    --repository-url <http(s)-url>
    --repository-ref <exact-ref>
    --clean
    --open
    --strict
    --screen-map
    --no-screen-map
    --host <address>
    --port <number>
    --format text|json
    --report <file>
    --timeout <duration>
    --base <revision>
    --branch-base <ref>
    --status <status>
    --module <MOD-ID>
    --task <TASK-ID>
    --permanent-only
```

`--host` и `--port` разрешены только для `serve`; значения по умолчанию —
`127.0.0.1` и `8080`. Для доступа из локальной сети требуется явный
`--host 0.0.0.0`.

Пока работает `serve`, HTML-запрос, save/create, watcher и ручная кнопка могут
перестроить портал, не закрывая listener. Editor API и его JSON schema v1
определены в [отдельном HTTP-контракте](editor-http.md). `build` всегда остаётся
static read-only: editor markup, CodeMirror, API URL и server-only scripts в его
результат не входят.

Семантика `--host`, `--port` и `--open` не меняется; auto-open без `--open`
отсутствует. Параметры `--no-open` и `--edit` не существуют и отклоняются как
неизвестные. Редактор не зависит нормативно от адреса listener. При явном
non-loopback listener доступные прямые HTTP-клиенты входят в trust boundary;
same-origin guards не являются сетевой аутентификацией.

`--report` и `--timeout` разрешены только для `task verify`.
`task verify --run` разрешён только для статусов Ready, In Progress, Blocked и
Done; безопасный `--dry-run` также можно использовать для полного Draft.

Changes parameters, JSON/Markdown contract и Git security описаны в
[руководстве](../guides/documentation-changes.md). Exit codes changes: `0` —
нет blocking diagnostics, `1` — отчёт построен с error, `2` — arguments или
revision, `3` — Git/repository недоступен, `4` — внутренняя ошибка.

`--screen-map` и `--no-screen-map` разрешены для `build` и `serve`. Карта
генерируется по умолчанию при наличии `screens/SC-*.md`; `--no-screen-map`
отключает только страницу общей карты, сохраняя каталог, страницы use cases с
пошаговым режимом и JSON.

## Exit codes

- `0` — операция успешно завершена;
- `1` — ошибка аргументов, I/O, модели, генерации или проверки;
- при `--strict` наличие warning также приводит к `1`;
- `task ready` возвращает `0` для `contract_ready` и `ready`;
- `task verify` возвращает `0` для `planned` и `passed`.
- `task archive` и `task restore` возвращают `0` только после успешного
  перемещения; policy-блокировка возвращает `1` и `TaskMoveReport`.
- `serve` возвращает `1`, если первоначальная сборка или запуск listener
  завершились ошибкой; ошибка последующей пересборки возвращается клиенту как
  HTTP 500, не останавливая сервер; при ошибке ручной пересборки кнопка получает
  error-состояние, доступное сообщение объявляется через live region, а запрос
  можно повторить; editor API возвращает schema-v1 error envelope, а conflict —
  `409 stale_digest` без потери текста.

## Architecture diagnostics

Структурный контракт архитектуры использует стабильные error codes:

- `missing-architecture-overview`;
- `invalid-architecture-overview-type`;
- `missing-architecture-question`;
- `unlisted-architecture-document`.

Неработающие и заблокированные локальные ссылки сохраняют общие коды
`broken-link` и `blocked-link`, но внутри `architecture/` имеют severity
`error`. Необязательный стабильный ID архитектурного документа участвует в
общей проверке `duplicate-id`. CLI не оценивает пунктуацию, вопросительные
слова и архитектурный смысл непустого вопроса.

## ProjectReport schema v1

Schema v1 аддитивно включает `knowledge.standards`, `knowledge.runbooks`,
`standardIds`/`runbookIds` у `WorkItem`, typed collections task context и
четыре runbook-метрики в `stats`. Пустые коллекции сериализуются как `[]`;
версия schema и генератора не меняется.

Architecture overview и подробные ответы сериализуются как обычные documents с
`type: "architecture"`; различие остаётся в `sourcePath` и `metadata`.

`check --format json` и сгенерированный `report.json` содержат:

- `schemaVersion`, generator и время построения;
- project, current status и агрегированные stats;
- документы, безопасно разрешённые links и backlinks;
- optional `flowId` у work item, если задача ссылается на `FLOW-*`;
- `knowledge.flows[]` и двусторонние связи `UC.flowIds ↔ FLOW.useCaseIds`;
- экраны, состояния и переходы в top-level коллекциях `screens` и
  `transitions`;
- вычисленные экранные `playableFlows`, hotspots, справочник ошибок и traceability;
- экранную статистику и `screenIds` у связанных сущностей;
- roadmap с declared и effective completion;
- риски, knowledge model и issues.

Пустые коллекции имеют вид `[]`. Строки business rules, criteria, roadmap и
issues начинаются с единицы.

## TaskContextReport schema v1

Read-only отчёт содержит полный `WorkItem`, `requiredReads`, business rules,
зависимости, documentation-impact документы и фиксированные разделы связанных
module, use case, flow и screens.

Команда не выполняет содержимое `checks`.

## Workflow reports schema v1

`SearchReport`, `TaskInitReport`, `ScaffoldReport` и `TaskReadyReport`
используют schema v1.

`WorkItem` и результаты поиска содержат `archived` и optional `archiveYear`.
`TaskMoveReport` использует schema v1 и содержит `kind`, итоговый `status`
(`archived`, `restored` или `blocked`), снимок задачи, исходный и целевой пути,
optional `archiveYear` и issues. Команды перемещения не редактируют Markdown.

## TaskVerifyReport schema v1

Итоговый `status` принимает `passed`, `failed` или `blocked`. Статус команды:
`passed`, `failed`, `timed_out` или `start_error`.

Отчёт содержит:

- task snapshot и task-local `validationIssues`;
- все project issues для диагностики;
- уникально выполненные команды и их targets;
- `exitCode`, timestamps, duration и ограниченные stdout/stderr;
- результат каждого `AC-*`, `ALL` и `DOCS`;
- итоговую summary.

## Совместимость

Все публичные отчёты используют schema v1. Контракт развивается напрямую без
legacy-слоя, преобразователей и параллельной выдачи нескольких версий схемы.

`ChangeSetReport` имеет независимую schema v1 и не добавляется в обычный
`ProjectReport`; поля определены в [JSON reference](../reference/changes-report.md).
