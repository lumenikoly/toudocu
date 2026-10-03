<!-- toudocu
id: TASK-TS-008
status: done
taskType: maintenance
module: MOD-SITE
parentTask: TASK-TS-001
dependsOn: TASK-TS-007
standards: STD-DOCS-001
updated: 2026-09-19
-->

# TASK-TS-008: Перенести общие страницы в единое React-приложение

<!-- toudocu:section result -->
## Результат

Документы, архитектура, экраны, roadmap, задачи и поиск используют общие React-компоненты и React Router.

Это требуемый результат этапа; статус и отмеченные критерии показывают фактическую готовность. Основание — этап и пункты 6; 24–30; 35–37; 55–57 исходного ТЗ, преобразованного в [дерево миграции](TASK-TS-001.md).

<!-- toudocu:section use-case-omission-reason -->
## Почему нет отдельного сценария

Миграция реализации сохраняет существующие пользовательские сценарии и публичные CLI/JSON-контракты. Новый сценарий ради смены языка не вводится.

<!-- toudocu:section scope -->
## Область изменения

Исходные точки переноса: `internal/`, `web/`, `scripts/`, `skills/` и `docs/`.
Новые пакеты создаются в пределах репозитория согласно результату этапа.

AppShell, navigation, shared pages, data adapters, UI catalogs; повторное использование существующей системы компонентов.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

Изменение семантики CLI, документационного формата и модели задач, MCP, база данных, облачный backend, Next.js, Astro и автоматический запуск агента ядром. Другие этапы выполняются по зависимостям родительской задачи.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Страницы показывают прежние документы, связи и вычисленные состояния без вычисления domain semantics в React.
- [x] `AC-02` Навигация принадлежит React Router; новые страницы не используют islands или замену HTML через DOMParser.
- [x] `AC-03` Чтение, ссылки, навигация, задачи и roadmap работают без JavaScript; поиск, Mermaid и переходы проверены браузером.
- [x] `AC-04` Общий UI component layer использует существующие design tokens/components; feature styles остаются colocated или CSS Modules, а новый giant `portal.css` не появляется.
- [x] `AC-05` UI labels берутся из frontend/application catalogs; domain statuses остаются machine values, CLI/diagnostic language policy сохраняется, а project content не переводится frontend автоматически.

<!-- toudocu:section plan -->
## План

1. Перенести AppShell, providers, shared navigation и public routes на один
   React Router tree, используя PageView и data adapters из TASK-TS-007.
2. Собрать общие document/task/architecture/screen/roadmap/search pages без
   вычисления domain state в React.
3. Сохранить единый component layer, tokens, feature-local styles и catalogs;
   проверить machine statuses и отсутствие frontend translation of content.
4. Прогнать static no-JS, route, link, search, Mermaid and browser regressions;
   обновить UI, i18n и frontend architecture docs.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` -> `pnpm test`
- `AC-02` -> `pnpm test:browser`
- `AC-03` -> `pnpm test:browser`
- `AC-04` -> `pnpm --filter @toudocu/web-app test`
- `AC-05` -> `pnpm --filter @toudocu/web-app test`
- `ALL` -> `pnpm check`
- `DOCS` -> `node apps/cli/dist/main.js check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` -> `pnpm check`

Проверены строгая типизация, семь модульных тестов и два браузерных сценария.
Production output из `TASK-TS-009` подтверждает навигацию React Router, поиск,
Mermaid и чтение документов, связей, задач, дорожной карты и блоков кода без
JavaScript.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Обновить описание соответствующей границы в модулях и руководствах вместе с работающей реализацией. Сохранять различие между действующим Go runtime и целевым TypeScript runtime; не объявлять перенос завершённым до выполнения критериев. Текущий план и общие ограничения находятся в [родительской задаче](TASK-TS-001.md).
