# FLOW-TASK-WORKFLOW: Работа с проверяемой задачей

- Идентификатор: FLOW-TASK-WORKFLOW
- Сценарий: UC-TASK-01, UC-TASK-02
- Модуль: MOD-CLI
- Последнее обновление: 2026-07-28

Схема связывает read-only получение контекста и явный запуск проверок. Контракт
этих операций определяют [UC-TASK-01](../use-cases/task-workflow.md) и
[UC-TASK-02](../use-cases/task-check.md).

## Процесс

```mermaid
flowchart TD
    Context["docgent task context TASK-ID"] --> Find["Найти ровно одну задачу"]
    Find --> Found{"Задача найдена однозначно?"}
    Found -->|Нет| ContextError["Вернуть код 1 без запуска команд"]
    Found -->|Да| Slice["Собрать задачу, связи, ограничения и diagnostics"]
    Slice --> Plan["Спланировать и выполнить изменения вне Docgent"]
    Plan --> Check["Явно вызвать docgent task check TASK-ID"]
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
- `task check` запускает только явно объявленные доверенные команды после
  локального validation gate.
- Ошибка одной команды не останавливает остальные; timeout завершает дерево
  процессов.

## Связанные документы

- [UC-TASK-01: Получить контекст рабочей задачи](../use-cases/task-workflow.md)
- [UC-TASK-02: Выполнить проверки рабочей задачи](../use-cases/task-check.md)
- [MOD-CLI: CLI и workflow задач](../modules/cli.md)
- [Руководство по рабочим задачам](../guides/work-items.md)
- [CLI-контракт](../contracts/cli.md)
