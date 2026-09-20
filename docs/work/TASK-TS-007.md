<!-- toudocu
id: TASK-TS-007
status: done
taskType: maintenance
module: MOD-SITE
parentTask: TASK-TS-001
dependsOn: TASK-TS-004
standards: STD-DOCS-001
updated: 2026-09-18
-->

# TASK-TS-007: Ввести модели представления и единый реестр маршрутов

<!-- toudocu:section result -->
## Результат

Портал получает сериализуемые модели представления вместо внутренних объектов компилятора.

Это требуемый результат этапа; статус и отмеченные критерии показывают фактическую готовность. Основание — этап и пункты 5; 4; 9; 26–30 исходного ТЗ, преобразованного в [дерево миграции](TASK-TS-001.md).

<!-- toudocu:section use-case-omission-reason -->
## Почему нет отдельного сценария

Миграция реализации сохраняет существующие пользовательские сценарии и публичные CLI/JSON-контракты. Новый сценарий ради смены языка не вводится.

<!-- toudocu:section scope -->
## Область изменения

Исходные точки переноса: `internal/`, `web/`, `scripts/`, `skills/` и `docs/`.
Новые пакеты создаются в пределах репозитория согласно результату этапа.

PortalSnapshotV1, PageViewV1 unions, NavigationViewV1, RuntimeCapabilitiesV1; единый RouteManifest и mapper.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

Изменение семантики CLI, документационного формата и модели задач, MCP, база данных, облачный backend, Next.js, Astro и автоматический запуск агента ядром. Другие этапы выполняются по зависимостям родительской задачи.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Публичные DTO и runtime schemas имеют единый источник; ProjectModel не сериализуется как публичный контракт.
- [x] `AC-02` Один реестр определяет href, output path и page identifier, включая serve-only маршруты.
- [x] `AC-03` Static и serve используют одинаковые PageView; runtime capabilities не подменяют доступность маршрутов.

<!-- toudocu:section plan -->
## План

1. Выписать public DTO, schemaVersion, runtime validation и fields needed by
   CLI, static pages, serve API and browser loaders.
2. Создать один contracts source of truth, PageView unions, capabilities и
   RouteManifest с typed href, page identifier и output path.
3. Написать mappers из internal ProjectModel в DTO/PageView; запретить прямую
   сериализацию core model и проверить static/serve parity.
4. Зафиксировать route and contract ownership в site architecture docs.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` -> `pnpm test`
- `AC-02` -> `pnpm test`
- `AC-03` -> `pnpm check`
- `ALL` -> `pnpm check`
- `DOCS` -> `node apps/cli/dist/main.js check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` -> `pnpm check`

Команды новой системы являются целевыми проверками этапа. До появления соответствующих тестов их успешный запуск не подтверждает критерии. При удалении Go документационные проверки переводятся на новый CLI; совпадение отчётов проверяется до переключения.

Проверено 19 сентября 2026: contracts и portal собираются и проходят
typecheck; целевые тесты проверяют runtime schemas, отсутствие внутренней
`CompiledProject` в сериализуемом снимке, единый маршрут для каждой страницы,
коллизии путей, специализированные страницы и иерархию задач, а также
одинаковые общие `PageView` в static и serve. Serve-only маршруты и страницы в
static отсутствуют. Независимая повторная проверка после исправления пути
health и полей capabilities блокеров не обнаружила. Зависимость `TASK-TS-004`
завершена после compiler parity и независимой проверки.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Обновить описание соответствующей границы в модулях и руководствах вместе с работающей реализацией. Сохранять различие между действующим Go runtime и целевым TypeScript runtime; не объявлять перенос завершённым до выполнения критериев. Текущий план и общие ограничения находятся в [родительской задаче](TASK-TS-001.md).
