# CLI-контракт Docgent v2

- Идентификатор: CON-CLI-V1
- Статус: Готово
- Владелец: Команда Docgent
- Последнее обновление: 2026-07-29

Контракт фиксирует публичные команды, exit codes и машинные JSON-форматы
Docgent.

## Команды

| Команда | Побочные эффекты | Результат |
|---|---|---|
| `check` | отсутствуют | diagnostics или `ProjectReport` |
| `build` | записывает output, при `--clean` безопасно очищает его | автономный портал и `report.json` |
| `serve` | собирает output и запускает локальный HTTP-сервер | портал с пересборкой при обновлении HTML |
| `search` | отсутствуют | `SearchReport` по свежим Markdown |
| `task init` | атомарно создаёт новый `TASK-*` | `TaskInitReport` |
| `scaffold` | атомарно создаёт выбранную сущность | `ScaffoldReport` |
| `task ready` | отсутствуют | `TaskReadyReport` |
| `task context` | отсутствуют | `TaskContextReport` выбранной Ready+ задачи |
| `task verify --dry-run` | отсутствуют | план `TaskVerifyReport` |
| `task verify --run` | исполняет доверенные команды задачи | `TaskVerifyReport` |
| `version` | отсутствуют | версия генератора |

Вызов `docgent ./docs ...` эквивалентен `docgent build ./docs ...`.
Историческая команда верхнего уровня `init` и прежняя `task check` отсутствуют
без alias.

```text
docgent search "<query>" [docs-dir] [--limit N] [--format text|json]
docgent task init [docs-dir] --area AREA --title TITLE --type TYPE [--lang en|ru]
docgent scaffold module|use-case|flow|screen|decision ID [docs-dir] --title TITLE [--lang en|ru]
docgent task ready TASK-ID [docs-dir] [--strict] [--format text|json]
docgent task context TASK-ID [docs-dir] [--format text|json]
docgent task verify TASK-ID [docs-dir] (--dry-run|--run) [--target TARGET] [--report FILE] [--timeout DURATION] [--format text|json]
```

В каталоге документации глобально ожидается только `index.md`. `status.md`,
`roadmap.md` и типизированные каталоги необязательны; правила конкретного типа
применяются, только если соответствующий документ существует.

Статусы, типы, обязательные поля, разделы и команды `TASK-*` описаны в
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
```

`--host` и `--port` разрешены только для `serve`; значения по умолчанию —
`127.0.0.1` и `8080`. Для доступа из локальной сети требуется явный
`--host 0.0.0.0`.

`--report` и `--timeout` разрешены только для `task verify`.
`task verify --run` разрешён только для статусов Ready, In Progress, Blocked и
Done; безопасный `--dry-run` также можно использовать для полного Draft.

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
- `serve` возвращает `1`, если первоначальная сборка или запуск listener
  завершились ошибкой; ошибка последующей пересборки возвращается клиенту как
  HTTP 500, не останавливая сервер.

## ProjectReport schema v2

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

## TaskContextReport schema v2

Read-only отчёт содержит полный `WorkItem`, `requiredReads`, business rules,
зависимости, documentation-impact документы и фиксированные разделы связанных
module, use case, flow и screens.

Команда не выполняет содержимое `checks`.

## Новые отчёты schema v1

`SearchReport`, `TaskInitReport`, `ScaffoldReport` и `TaskReadyReport`
используют schema v1.

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

ProjectReport и TaskContextReport используют schema v2. Остальные отчёты
workflow используют schema v1. Несовместимое изменение требует новой версии
соответствующей схемы.
