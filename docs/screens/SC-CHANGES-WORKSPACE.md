# SC-CHANGES-WORKSPACE: Просмотр изменений

- Идентификатор: SC-CHANGES-WORKSPACE
- Тип: Экран
- Модуль: MOD-CHANGES
- Статус: Реализован
- Маршрут: `/changes/`
- Превью: `../assets/screens/changes-workspace.png`
- Последнее обновление: 2026-08-06

Read-only workspace сравнения выбранных Git-состояний документации: сводка,
исходный, rendered и semantic diff, экранная overlay-карта и task impact.

## Оболочка и состояния

Общий workspace header показывает project branding, переходы в портал,
Редактор и Изменения, активные Изменения через `aria-current`, а также тему
оформления и цветовую схему. Base, optional branch base, target revision и
действие сравнения находятся в отдельной контекстной панели.

Смена оформления применяется сразу и сохраняется для остальных поверхностей.
Read-only CodeMirror merge обновляет theme compartment без сброса выбранного
документа и tab. Активный Mermaid diff перерисовывается, сохраняя отчёт,
фильтры и URL state. На узком экране метрики, список и diff используют только
локальную прокрутку без горизонтального overflow страницы.
