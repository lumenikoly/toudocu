# Карта экранов

Карта демонстрирует каталог экранов и переходы основного сценария.

## Каталог экранов

| ID | Экран | Модуль | Тип | Роль | Маршрут | Статус | Ошибки |
|---|---|---|---|---|---|---|---|
| SC-CORE-HOME | Главная | MOD-CORE | page | entry | `/` | Готово | — |
| SC-CORE-REQUEST | Новый запрос | MOD-CORE | page | normal | `/request` | В работе | ERR-CORE-INVALID |
| SC-CORE-HELP | Подсказка | MOD-CORE | modal | normal | — | В работе | — |
| SC-CORE-RESULT | Результат | MOD-CORE | page | terminal | `/result` | Запланировано | — |

## Переходы

| Из | Действие | Условие | В | Тип |
|---|---|---|---|---|
| SC-CORE-HOME | Создать запрос | — | SC-CORE-REQUEST | navigation |
| SC-CORE-REQUEST | Открыть подсказку | — | SC-CORE-HELP | navigation |
| SC-CORE-HELP | Закрыть | — | SC-CORE-REQUEST | navigation |
| SC-CORE-REQUEST | Отправить | Данные корректны | SC-CORE-RESULT | redirect |
