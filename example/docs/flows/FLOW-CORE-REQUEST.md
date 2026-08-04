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
    participant UI as Service Desk UI
    participant API as Core API
    User->>UI: Отправить запрос
    UI->>API: validate(request)
    alt Данные корректны
        API-->>UI: created(result)
        UI-->>User: Показать результат
    else Данные некорректны
        API-->>UI: INVALID_INPUT
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
