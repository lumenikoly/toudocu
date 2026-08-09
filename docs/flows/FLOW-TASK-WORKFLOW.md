# FLOW-TASK-WORKFLOW: Работа с проверяемой задачей

- Идентификатор: FLOW-TASK-WORKFLOW
- Сценарий: UC-TASK-01, UC-TASK-02, UC-TASK-03
- Модуль: MOD-CLI
- Последнее обновление: 2026-07-28

Схема связывает подготовку контракта, read-only получение контекста и явный
запуск проверок.

## Процесс

```mermaid
flowchart TD
    Search["toudocu search QUERY"] --> Init["toudocu task init"]
    Init --> Fill["Агент выбирает сущности и заполняет контракт"]
    Fill --> Ready["toudocu task ready TASK-ID"]
    Ready --> Complete{"Контракт полный?"}
    Complete -->|Нет| Fill
    Complete -->|Да| Status["Агент вручную меняет Draft на Ready"]
    Status --> Context["toudocu task context TASK-ID"]
    Context --> Find["Найти ровно одну задачу"]
    Find --> Found{"Задача найдена однозначно?"}
    Found -->|Нет| ContextError["Вернуть код 1 без запуска команд"]
    Found -->|Да| Slice["Собрать задачу, связи, ограничения и diagnostics"]
    Slice --> Plan["Спланировать и выполнить изменения вне Toudocu"]
    Plan --> DryRun["Явно вызвать task verify --dry-run"]
    DryRun --> Check["После проверки плана вызвать task verify --run"]
    Check --> Gate["Применить task-local validation gate"]
    Gate --> Valid{"Контракт задачи корректен?"}
    Valid -->|Нет| Blocked["Вернуть status blocked без запуска команд"]
    Valid -->|Да| Commands["Собрать уникальные команды AC, ALL и DOCS"]
    Commands --> Run["Последовательно выполнить команды из repository root"]
    Run --> Results["Связать результаты с критериями приёмки"]
    Results --> Passed{"Все проверки успешны?"}
    Passed -->|Да| Success["Вернуть status passed и код 0"]
    Passed -->|Нет| Failed["Вернуть status failed и код 1"]
```

## Границы процесса

- `task context` никогда не выполняет системные команды.
- `task ready` никогда не меняет статус или Markdown.
- `task verify --dry-run` никогда не выполняет команды.
- `task verify --run` запускает только явно объявленные доверенные команды после
  локального validation gate.
- Только агент интерпретирует запрос, создаёт смысловые связи и подтверждает
  критерии.
- Ошибка одной команды не останавливает остальные; timeout завершает дерево
  процессов.

## Связанные документы

- [UC-TASK-01: Получить контекст рабочей задачи](../use-cases/task-workflow.md)
- [UC-TASK-02: Выполнить проверки рабочей задачи](../use-cases/task-verify.md)
- [UC-TASK-03: Подготовить новую рабочую задачу](../use-cases/UC-TASK-03.md)
- [MOD-CLI: CLI и workflow задач](../modules/cli.md)
- [Руководство по рабочим задачам](../guides/work-items.md)
- [CLI-контракт](../contracts/cli.md)
