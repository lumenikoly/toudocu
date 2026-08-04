# CLI-контракт Docgent v1

- Идентификатор: CON-CLI-V1
- Статус: Готово
- Владелец: Команда Docgent
- Последнее обновление: 2026-07-26

Контракт фиксирует публичные команды, exit codes и машинные JSON-форматы
Docgent 1.x.

## Команды

| Команда | Побочные эффекты | Результат |
|---|---|---|
| `check` | отсутствуют | diagnostics или `ProjectReport` |
| `build` | записывает output, при `--clean` безопасно очищает его | автономный портал и `report.json` |
| `task context` | отсутствуют | `TaskContextReport` выбранной задачи |
| `task check` | исполняет доверенные команды задачи | `TaskCheckReport` |
| `version` | отсутствуют | версия генератора |

Вызов `docgent ./docs ...` эквивалентен `docgent build ./docs ...`.

В каталоге документации глобально ожидается только `index.md`. `status.md`,
`roadmap.md` и типизированные каталоги необязательны; правила конкретного типа
применяются, только если соответствующий документ существует.

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
    --format text|json
```

`--report` и `--timeout` разрешены только для `task check`.

## Exit codes

- `0` — операция успешно завершена;
- `1` — ошибка аргументов, I/O, модели, генерации или проверки;
- при `--strict` наличие warning также приводит к `1`;
- `task check` возвращает `0` только для итогового статуса `passed`.

## ProjectReport schema v1

`check --format json` и сгенерированный `report.json` содержат:

- `schemaVersion`, generator и время построения;
- project, current status и агрегированные stats;
- документы, безопасно разрешённые links и backlinks;
- roadmap с declared и effective completion;
- риски, knowledge model и issues.

Пустые коллекции имеют вид `[]`. Строки business rules, criteria, roadmap и
issues начинаются с единицы.

## TaskContextReport schema v1

Read-only отчёт содержит выбранный `WorkItem`, признак `fullVerification`,
связанные module и use case, business rules, зависимости, зависимые задачи,
компактные сведения о документах и относящиеся к контексту issues.

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

В пределах schema v1 поля не меняют смысл и тип. Добавление несовместимого
обязательного поведения требует новой версии схемы. Человекочитаемый текст
может уточняться без изменения кодов issues и JSON-полей.
