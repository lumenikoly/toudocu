# FLOW-DOCS-CHECK: Проверка документационного контракта

- Идентификатор: FLOW-DOCS-CHECK
- Сценарий: UC-DOCS-02
- Модуль: MOD-MODEL
- Последнее обновление: 2026-07-28

Схема показывает read-only проверку документации. Полный набор правил и
условия успешного завершения определяет
[UC-DOCS-02](../use-cases/check-documentation.md).

## Процесс

```mermaid
flowchart TD
    Start["toudocu check"] --> Resolve["Проверить вход и repository root"]
    Resolve --> Read["Прочитать Markdown без перехода по симлинкам"]
    Read --> Parse["Разобрать структуру, метаданные, ссылки и Mermaid"]
    Parse --> Validate["Проверить ID, связи, roadmap и work items"]
    Validate --> Report["Сформировать diagnostics или ProjectReport"]
    Report --> Errors{"Есть ошибки?"}
    Errors -->|Да| Failed["Вернуть код 1"]
    Errors -->|Нет| Strict{"Включён strict и есть предупреждения?"}
    Strict -->|Да| Failed
    Strict -->|Нет| Passed["Вернуть код 0"]
```

## Границы процесса

- Команда не создаёт сайт и не изменяет исходные документы.
- Команды из разделов `Проверка` рабочих задач не выполняются.
- В обычном режиме предупреждения входят в отчёт, но не меняют успешный exit
  code.

## Связанные документы

- [UC-DOCS-02: Проверить документацию](../use-cases/check-documentation.md)
- [MOD-MODEL: Проектная модель и валидация](../modules/model.md)
- [MOD-CLI: CLI и workflow задач](../modules/cli.md)
- [Правила проверки](../guides/testing.md)
