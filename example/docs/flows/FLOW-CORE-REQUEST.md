# FLOW-CORE-REQUEST: Создание запроса

- Идентификатор: FLOW-CORE-REQUEST
- Сценарий: UC-CORE-01
- Модуль: MOD-CORE
- Последнее обновление: 2026-07-29

Диаграммы визуализируют основной сценарий и состояния формы. Источником
переходов для Screen Map остаются документы `screens/SC-*.md`.

## Взаимодействие сервисов

```mermaid
sequenceDiagram
    actor User as Пользователь
    participant UI as Web Frontend
    participant API as Backend API
    participant DB as PostgreSQL
    User->>UI: Ввести заголовок и описание
    UI->>API: POST /api/v1/requests
    API->>API: Проверить и нормализовать данные
    alt Данные корректны
        API->>DB: INSERT request
        DB-->>API: id, created_at
        API-->>UI: 201 Created
        UI-->>User: Показать номер обращения
    else Данные некорректны
        API-->>UI: 400 INVALID_INPUT
        UI-->>User: Остаться на форме с ошибкой
    end
```

## Процесс

```mermaid
flowchart LR
    Home["Главная"] -->|Создать запрос| Request["Новый запрос"]
    Request -->|Открыть подсказку| Help["Подсказка"]
    Help -->|Закрыть| Request
    Request -->|Данные корректны| Result["Результат"]
    Request -->|Данные некорректны| Invalid["INVALID-INPUT"]
    Invalid -->|Исправить данные| Request
```

## Состояния формы

```mermaid
stateDiagram-v2
    [*] --> Ready
    Ready --> Invalid: Некорректные данные
    Invalid --> Ready: Исправить данные
    Ready --> [*]: Запрос создан
```

## Связанные документы

- [UC-CORE-01](../use-cases/core.md)
- [SC-CORE-REQUEST](../screens/SC-CORE-REQUEST.md)
