# Конфигурация

Справочник параметров целевого развёртывания Service Desk. Секретные значения
передаются Backend API через окружение и никогда не встраиваются во Frontend.

| Параметр | Обязательный | Описание |
|---|---|---|
| `PUBLIC_API_BASE_URL` | Да для Frontend | Публичный HTTPS-префикс Backend API |
| `DATABASE_URL` | Да для Backend | Строка приватного подключения к PostgreSQL |
| `DATABASE_MAX_CONNECTIONS` | Нет | Размер пула, по умолчанию `10` |
| `REQUEST_TIMEOUT` | Нет | Timeout обработки API-запроса, по умолчанию `5s` |
| `SUPPORT_CENTER_URL` | Да для Frontend | Внешний HTTPS-адрес Support Center |

## Правила безопасности

- `DATABASE_URL` относится к секретам и не выводится в логи;
- значения с префиксом `PUBLIC_` не должны содержать пароли или токены;
- `SUPPORT_CENTER_URL` использует только HTTPS;
- production-конфигурация не хранится в репозитории.
