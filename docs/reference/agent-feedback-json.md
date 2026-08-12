# JSON обратной связи с агентом, версия 1

Публичные данные содержат `schemaVersion: 1`. Пути задаются относительно корня
репозитория с `/`, строки и столбцы в символах Unicode начинаются с единицы, отметки времени
записываются в UTC RFC3339, а пустые массивы сериализуются как `[]`.

## Получение записи очереди

```bash
toudocu agent next --json
```

Пустая очередь возвращает код `0`:

```json
{
  "schemaVersion": 1,
  "pending": false
}
```

При наличии работы команда возвращает одну старейшую запись очереди, историю
только её обсуждения, актуальное состояние привязки, текущий `HEAD`,
`pendingCount` и `hasMore`. Вызов одновременно создаёт ограниченную по времени
блокировку.

При создании привязки браузер передаёт выделенный текст и порядковый номер
одинакового фрагмента в поле `occurrence` (нумерация начинается с единицы).
Сервер сам вычисляет строки и столбцы в символах Unicode; координаты элементов
страницы не сохраняются.

## Отправка ответа

```bash
toudocu agent respond --input response.json --json
cat response.json | toudocu agent respond --json
```

Минимальный ответ:

```json
{
  "schemaVersion": 1,
  "deliveryId": "DEL-01J...",
  "discussionId": "DISC-01J...",
  "outcome": "answered",
  "message": "Полная пересборка нужна только после изменения конфигурации.",
  "evidence": [
    {
      "path": "internal/server/rebuild.go",
      "startLine": 81,
      "endLine": 103
    }
  ],
  "changedPaths": []
}
```

Поле `outcome` принимает `answered`, `changed`, `no_change`,
`needs_clarification` или `failed`. `changed` требует хотя бы один путь внутри
канонической документации. Для `question` результат `changed` запрещён.

## Лимиты

| Поле | Максимальный размер |
|---|---:|
| Сообщение человека | 64 КиБ |
| Полный `AgentResponse` | 64 КиБ |
| `selectedText` | 32 КиБ |
| `contextBefore` | 2 КиБ |
| `contextAfter` | 2 КиБ |

## Диагностика

Стабильные коды: `AGENT_DISCUSSION_NOT_FOUND`, `AGENT_DELIVERY_NOT_FOUND`,
`AGENT_INVALID_TARGET`, `AGENT_INVALID_MESSAGE`, `AGENT_INVALID_PATH`,
`AGENT_PATH_OUTSIDE_ROOT`, `AGENT_REVISION_CONFLICT`, `AGENT_INBOX_BUSY`,
`AGENT_RESPONSE_CONFLICT`, `AGENT_STATE_CORRUPTED` и
`AGENT_PAYLOAD_TOO_LARGE`.

Некорректные входные данные, неизвестный ID и конфликт не меняют локальное состояние.
