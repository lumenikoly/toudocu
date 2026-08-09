# FLOW-REVIEW-FEEDBACK: Передача локального feedback агенту

- Идентификатор: FLOW-REVIEW-FEEDBACK
- Сценарий: UC-REVIEW-01
- Модуль: MOD-REVIEW
- Последнее обновление: 2026-08-09

## Процесс

```mermaid
sequenceDiagram
    actor Developer as Разработчик
    participant Browser as Changes workspace
    participant Review as Review service
    participant Store as Local user-state
    participant Skill as Установленный skill
    participant Agent as AI-агент

    Developer->>Browser: Создать line/file/global comment
    Browser->>Review: target + Unicode coordinates + CAS
    Review->>Review: Проверить path и извлечь text/context
    Review->>Store: Lock, snapshot, atomic state replace
    Developer->>Browser: Отправить агенту · N
    Browser->>Review: Snapshot всех unsent open messages
    Review->>Store: Добавить immutable FIFO batch
    Agent->>Skill: $toudocu feedback
    Skill->>Review: changes feedback pending --json
    Review-->>Skill: Oldest pending batch
    Skill->>Agent: Проверенные targets и comment semantics
    Agent->>Agent: Обоснованные изменения и проверки
    Skill->>Review: changes feedback respond --input response.json
    Review->>Store: Atomic full response
    Review-->>Browser: Agent messages в исходных threads
    Developer->>Browser: Resolve или новый reply
```

## Границы процесса

- Browser не является источником selected text, context или digest.
- `pending` повторяет oldest batch до полного успешного `respond`.
- Response с missing, duplicate или invalid item не меняет state.
- `fixed` остаётся outcome сообщения и не закрывает discussion.
- Ни UI, ни CLI не запускают агента и не изменяют Git.

## Связанные документы

- [UC-REVIEW-01](../use-cases/UC-REVIEW-01.md)
- [MOD-REVIEW](../modules/MOD-REVIEW.md)
- [Перенос anchors](../architecture/review-anchoring.md)
- [CLI-контракт](../contracts/cli.md)
