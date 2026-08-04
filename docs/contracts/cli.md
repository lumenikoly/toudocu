# CLI-контракт Docgent v1

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
| `task context` | отсутствуют | `TaskContextReport` выбранной задачи |
| `task check` | исполняет доверенные команды задачи | `TaskCheckReport` |
| `version` | отсутствуют | версия генератора |

Вызов `docgent ./docs ...` эквивалентен `docgent build ./docs ...`.
Команда `init` намеренно отсутствует: до первого релиза действует один чистый
CLI-контракт v1 без legacy-слоя.

В каталоге документации глобально ожидается только `index.md`. `status.md`,
`roadmap.md` и типизированные каталоги необязательны; правила конкретного типа
применяются, только если соответствующий документ существует.

Статусы, типы, обязательные поля, разделы и команды `TASK-*` описаны в
[руководстве по рабочим задачам](../guides/work-items.md).

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

`--report` и `--timeout` разрешены только для `task check`.

`--screen-map` и `--no-screen-map` разрешены для `build` и `serve`. Карта
генерируется по умолчанию при наличии `screens/SC-*.md`; `--no-screen-map`
отключает только страницу карты, сохраняя каталог, playable flows и JSON.

## Exit codes

- `0` — операция успешно завершена;
- `1` — ошибка аргументов, I/O, модели, генерации или проверки;
- при `--strict` наличие warning также приводит к `1`;
- `task check` возвращает `0` только для итогового статуса `passed`.
- `serve` возвращает `1`, если первоначальная сборка или запуск listener
  завершились ошибкой; ошибка последующей пересборки возвращается клиенту как
  HTTP 500, не останавливая сервер.

## ProjectReport schema v1

`check --format json` и сгенерированный `report.json` содержат:

- `schemaVersion`, generator и время построения;
- project, current status и агрегированные stats;
- документы, безопасно разрешённые links и backlinks;
- optional `flowId` у work item, если задача ссылается на `FLOW-*`;
- экраны, состояния и переходы в top-level коллекциях `screens` и
  `transitions`;
- вычисленные `playableFlows`, hotspots, справочник ошибок и traceability;
- экранную статистику и `screenIds` у связанных сущностей;
- roadmap с declared и effective completion;
- риски, knowledge model и issues.

Пустые коллекции имеют вид `[]`. Строки business rules, criteria, roadmap и
issues начинаются с единицы.

## TaskContextReport schema v1

Read-only отчёт содержит выбранный `WorkItem`, признак `fullVerification`,
связанные module, use case, screens и incident screen transitions, business
rules, зависимости, зависимые задачи, компактные сведения о документах и
относящиеся к контексту issues.

Команда не выполняет содержимое `checks`.

## TaskCheckReport schema v1

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

Все публичные отчёты используют schema v1. До первого релиза схема развивается
как единый чистый контракт без слоя миграции. После релиза несовместимое
изменение потребует новой версии соответствующей схемы.
