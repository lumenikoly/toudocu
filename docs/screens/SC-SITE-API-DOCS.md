# SC-SITE-API-DOCS: HTTP API

- Идентификатор: SC-SITE-API-DOCS
- Тип: Экран
- Модуль: MOD-SITE
- Статус: Реализован
- Маршрут: `/_docu-docu/api-docs/`
- Превью: `../assets/screens/site-api-docs.png`
- Последнее обновление: 2026-08-06

Serve-only каталог wire-level контрактов Editor и Changes API. Пользователь
выбирает OpenAPI source, раскрывает operations и может выполнить только
безопасные `GET`/`HEAD` запросы к canonical local server.

## Переходы

У экрана нет исходящих переходов: возврат выполняется обычной browser navigation.
