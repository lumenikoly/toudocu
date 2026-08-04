# SC-CORE-REQUEST: Новый запрос

- Идентификатор: SC-CORE-REQUEST
- Тип: Экран
- Модуль: MOD-CORE
- Статус: В работе
- Маршрут: `/request`
- Превью: `../assets/screens/request.png`
- Родительский экран: SC-CORE-HOME
- Компонент: `web/pages/request/`
- Владелец: Frontend Team
- Последнее обновление: 2026-07-29

Экран принимает данные основного пользовательского запроса.

## Состояния

| ID | Название | Превью |
|---|---|---|
| DEFAULT | Исходное состояние | `../assets/screens/request.png` |
| INVALID-INPUT | Некорректные данные | — |

## Переходы

| ID | Сценарий | Действие | Условие | Результат | Состояние | Ошибка | Сообщение | Контракт | Тип |
|---|---|---|---|---|---|---|---|---|---|
| TR-CORE-002 | UC-CORE-01 | Открыть подсказку | Всегда | SC-CORE-HELP | DEFAULT | — | — | — | navigation |
| TR-CORE-004 | UC-CORE-01 | Отправить | Данные корректны | SC-CORE-RESULT | DEFAULT | — | — | CON-CORE-API | redirect |
| TR-CORE-005 | UC-CORE-01 | Отправить | Данные некорректны | SC-CORE-REQUEST | INVALID-INPUT | INVALID_INPUT | — | CON-CORE-API | error |

## Связанные сценарии

- [UC-CORE-01](../use-cases/core.md)
