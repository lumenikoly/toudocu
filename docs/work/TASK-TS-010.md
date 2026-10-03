<!-- toudocu
id: TASK-TS-010
status: done
taskType: maintenance
module: MOD-SITE
parentTask: TASK-TS-001
dependsOn: TASK-TS-006, TASK-TS-009
standards: STD-DOCS-001
updated: 2026-09-19
-->

# TASK-TS-010: Перенести serve на Node и React SPA

<!-- toudocu:section result -->
## Результат

Локальный сервер обслуживает единое SPA и типизированный API поверх общего состояния проекта.

Это требуемый результат этапа; статус и отмеченные критерии показывают фактическую готовность. Основание — этап и пункты 8; 38–44; 70; 72–73 исходного ТЗ, преобразованного в [дерево миграции](TASK-TS-001.md).

<!-- toudocu:section use-case-omission-reason -->
## Почему нет отдельного сценария

Миграция реализации сохраняет существующие пользовательские сценарии и публичные CLI/JSON-контракты. Новый сценарий ради смены языка не вводится.

<!-- toudocu:section scope -->
## Область изменения

Исходные точки переноса: `internal/`, `web/`, `scripts/`, `skills/` и `docs/`.
Новые пакеты создаются в пределах репозитория согласно результату этапа.

Node HTTP framework, schemas/OpenAPI, watcher, revision, API loaders, rebuild events, loopback default.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

Изменение семантики CLI, документационного формата и модели задач, MCP, база данных, облачный backend, Next.js, Astro и автоматический запуск агента ядром. Другие этапы выполняются по зависимостям родительской задачи.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` API handlers вызывают application services; запросы используют общую модель и атомарную смену успешной revision.
- [x] `AC-02` Watcher объединяет burst/rename, исключает параллельные rebuild и сохраняет последний пригодный state при ошибке.
- [x] `AC-03` Serve SPA использует React Router; --no-update-check работает offline; shutdown закрывает watcher, sockets и HTTP-сервер.
- [x] `AC-04` HTTP-запросы и перестройки принимают AbortSignal; отмена освобождает ресурсы, перестройки не выполняются параллельно, а ошибка сохраняет последнюю пригодную модель.

<!-- toudocu:section plan -->
## План

1. Определить схемы HTTP-запросов и обработчики, вызывающие прикладные сервисы и публикующие успешную ревизию общей модели.
2. Объединить события наблюдателя, включая переименование, и последовательно выполнять отменяемые перестройки с сохранением последней пригодной модели.
3. Обслуживать общие React-маршруты на loopback; сохранить работу без сети с --no-update-check и закрытие всех ресурсов сервера.
4. Проверить конфликты ревизий, ошибки наблюдателя, работу без сети и завершение сервера; обновить описание API.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` -> `pnpm exec vitest run packages/server/src/server.test.ts`
- `AC-02` -> `pnpm exec vitest run packages/server/src/watcher-state.test.ts`
- `AC-03` -> `pnpm --filter @toudocu/web-app test:browser` и `pnpm exec vitest run apps/cli/src/cli.test.ts`
- `AC-04` -> `pnpm exec vitest run packages/server/src/rebuild-cancellation.test.ts packages/server/src/watcher-state.test.ts packages/server/src/server.test.ts`
- `ALL` -> `pnpm test` и `pnpm test:browser`
- `DOCS` -> `node apps/cli/dist/main.js check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` -> `pnpm check`

Проверки запускают реальный Fastify-сервер и предсобранное React-приложение,
открывают глубокий маршрут, читают API и выполняют ручную перестройку. Отдельные
тесты создают серию файловых событий с атомарным переименованием, проверяют
последовательность перестроек, сохранение последней успешной revision и отмену
ожидания HTTP-запроса и самой перестройки. Browser-сценарий с
`--no-update-check` также отклоняет любые обращения не к loopback origin.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Обновить описание соответствующей границы в модулях и руководствах вместе с работающей реализацией. Сохранять различие между действующим Go runtime и целевым TypeScript runtime; не объявлять перенос завершённым до выполнения критериев. Текущий план и общие ограничения находятся в [родительской задаче](TASK-TS-001.md).
