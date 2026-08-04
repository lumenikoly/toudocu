# FLOW-DOCS-CHANGES: Построение и просмотр изменений документации

- Идентификатор: FLOW-DOCS-CHANGES
- Сценарий: UC-DOCS-05
- Модуль: MOD-CHANGES
- Последнее обновление: 2026-07-31

Процесс показывает путь от явно выбранного Git-диапазона к ленивым
представлениям одного детерминированного change set.

## Процесс

```mermaid
flowchart TD
    Select["Выбрать base и target"] --> Resolve["Разрешить локальные Git revisions"]
    Resolve --> Files["Получить статусы, numstat и snapshots"]
    Files --> Report["Построить metadata и ChangeSetReport"]
    Report --> Source["Загрузить source diff"]
    Report --> Semantic["Нормализовать изменённые сущности"]
    Report --> Rendered["Отрендерить Markdown до и после"]
    Report --> Specialized["Построить OpenAPI, Mermaid, map и asset diff"]
    Source --> Review["Просмотреть или экспортировать отчёт"]
    Semantic --> Review
    Rendered --> Review
    Specialized --> Review
```

## Связанные документы

- [UC-DOCS-05: Просматривать изменения документации](../use-cases/UC-DOCS-05.md)
- [MOD-CHANGES: Изменения документации](../modules/MOD-CHANGES.md)
- [Как Git-состояния становятся change set?](../architecture/documentation-changes.md)
