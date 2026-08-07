# SC-SITE-HOME: Главная портала

- Идентификатор: SC-SITE-HOME
- Тип: Страница
- Модуль: MOD-SITE
- Статус: Реализован
- Маршрут: `/`
- Превью: `../assets/screens/site-home.png`
- Последнее обновление: 2026-08-06

Главная точка входа в собранную документацию: показывает состояние проекта и
ведёт к документам, локальному редактору, просмотру изменений и HTTP API.

## Переходы

| ID | Сценарий | Действие | Условие | Результат | Тип |
|---|---|---|---|---|---|
| TR-SITE-001 | UC-DOCS-03 | Открыть документ | Документ выбран | SC-SITE-DOCUMENT | navigation |
| TR-SITE-002 | UC-DOCS-03 | Открыть редактор | Портал запущен через serve | SC-SITE-EDITOR | navigation |
| TR-SITE-005 | UC-DOCS-05 | Открыть изменения | Портал запущен через serve | SC-CHANGES-WORKSPACE | navigation |
| TR-SITE-006 | UC-DOCS-03 | Открыть HTTP API | Canonical портал запущен через serve | SC-SITE-API-DOCS | navigation |
