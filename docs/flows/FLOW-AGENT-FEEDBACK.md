# FLOW-AGENT-FEEDBACK: Обработка локальной очереди документации

- Идентификатор: FLOW-AGENT-FEEDBACK
- Сценарий: UC-AGENT-FEEDBACK-01
- Модуль: MOD-AGENT-FEEDBACK
- Последнее обновление: 2026-08-12

## Процесс

```mermaid
sequenceDiagram
    actor Human as Разработчик
    participant UI as Портал или Изменения
    participant Core as Серверная часть
    participant Store as Локальное хранилище
    participant Agent as Агент разработки с навыком Toudocu
    participant Files as Актуальные файлы

    Human->>UI: Создать вопрос или запрос изменения
    UI->>Core: Сохранить редактируемый черновик
    Core->>Store: Атомарно записать обсуждение
    Human->>UI: Добавить в очередь
    UI->>Core: Поставить одно сообщение в очередь
    Core->>Store: Отправленное сообщение и ожидающая запись
    Human->>Agent: Обработай запросы из Toudocu
    loop Пока есть ожидающие записи
        Agent->>Core: toudocu agent next --json
        Core->>Store: Закрепить старейшую запись
        Core-->>Agent: Обсуждение, намерение, привязка и HEAD
        Agent->>Files: Перечитать документ и собрать доказательства
        opt Запрос на изменение подтверждён
            Agent->>Files: Изменить канонический Markdown и проверить
        end
        Agent->>Core: toudocu agent respond
        Core->>Store: Дописать ответ и завершить запись
        Core-->>UI: Ответ в исходном обсуждении
    end
    Human->>UI: Закрыть ветку или отправить уточнение
```

## Важные условия

- `question` никогда не даёт разрешения изменить документацию.
- `change_request` требует проверки утверждения пользователя.
- После повторной попытки агент заново читает файлы: предыдущая попытка могла частично
  изменить документ.
- Ответ агента не закрывает обсуждение и не является источником фактического
  состояния документации.

## Связанные документы

- [UC-AGENT-FEEDBACK-01](../use-cases/UC-AGENT-FEEDBACK-01.md)
- [Доставка запроса](../architecture/agent-feedback-delivery.md)
- [JSON обратной связи с агентом](../reference/agent-feedback-json.md)
