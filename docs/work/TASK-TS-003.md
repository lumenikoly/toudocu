<!-- toudocu
id: TASK-TS-003
status: done
taskType: maintenance
module: MOD-CLI
parentTask: TASK-TS-001
standards: STD-DOCS-001
updated: 2026-09-19
-->

# TASK-TS-003: Подготовить TypeScript workspace и проверку границ

<!-- toudocu:section result -->
## Результат

Разработчик собирает строгий ESM workspace и запускает временный toudocu-ts, сохраняя Go CLI основным до подтверждения совместимости.

Это требуемый результат этапа; статус и отмеченные критерии показывают фактическую готовность. Основание — этап и пункты 1; 3; 5–7; 74 исходного ТЗ, преобразованного в [дерево миграции](TASK-TS-001.md).

<!-- toudocu:section use-case-omission-reason -->
## Почему нет отдельного сценария

Миграция реализации сохраняет существующие пользовательские сценарии и публичные CLI/JSON-контракты. Новый сценарий ради смены языка не вводится.

<!-- toudocu:section scope -->
## Область изменения

Исходные точки переноса: `internal/`, `web/`, `scripts/`, `skills/` и `docs/`.
Новые пакеты создаются в пределах репозитория согласно результату этапа.

pnpm, TypeScript, ESLint, Prettier, Vitest; packages contracts/core/application/platform-node/portal/server/skills и apps cli/web.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

Изменение семантики CLI, документационного формата и модели задач, MCP, база данных, облачный backend, Next.js, Astro и автоматический запуск агента ядром. Другие этапы выполняются по зависимостям родительской задачи.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Все новые production packages проверяются с strict, noUncheckedIndexedAccess и exactOptionalPropertyTypes.
- [x] `AC-02` Автоматическая проверка запрещает Node в браузере и React, HTTP, процессы и реализации filesystem в core.
- [x] `AC-03` Временный toudocu-ts запускается; pnpm build, lint, typecheck и test проверяют новую реализацию.

<!-- toudocu:section plan -->
## План

1. Настроить pnpm workspace, ESM, strict TypeScript flags, ESLint import
   restrictions и Prettier для всех новых packages.
2. Собрать временный `toudocu-ts version` entrypoint и production packages
   без переноса domain logic в CLI.
3. Проверить forbidden imports для core и browser, затем запустить build,
   lint, typecheck и test на workspace.
4. Зафиксировать границы пакетов и оставшиеся stage-1 gaps перед compiler.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` -> `pnpm typecheck`
- `AC-02` -> `pnpm lint`
- `AC-03` -> `pnpm build && pnpm test`
- `ALL` -> `pnpm check`
- `DOCS` -> `node apps/cli/dist/main.js check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` -> `pnpm check`

Команды новой системы являются целевыми проверками этапа. До появления соответствующих тестов их успешный запуск не подтверждает критерии. При удалении Go документационные проверки переводятся на новый CLI; совпадение отчётов проверяется до переключения.

Проверено 19 сентября 2026: `pnpm build` и `pnpm check` проходят. Проверка
границ включает отрицательные тесты импортов и прямого доступа к runtime- и
browser-глобалам из core. Команды `typecheck` и `test` сначала собирают
зависимые пакеты, поэтому не требуют заранее сохранённых `dist`.

Временный `toudocu-ts` поддерживает только `version`; неподдерживаемая команда
возвращает ошибку, а не делегирует работу Go. Сценарий `version` проверен
механизмом совместимости с пустым `PATH`, без Go. Перенос CLI продолжается
в следующих задачах.

Существующий frontend пока остаётся в пакете `web/`; его перенос в `apps/web`
относится к TASK-TS-008. Пустой дубликат приложения не создавался. CI использует
Node.js 24 и закреплённый pnpm lockfile, сохраняя действующий Go release.
Цикл разработки описан в [руководстве по проверкам](../guides/testing.md).

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Обновить описание соответствующей границы в модулях и руководствах вместе с работающей реализацией. Сохранять различие между действующим Go runtime и целевым TypeScript runtime; не объявлять перенос завершённым до выполнения критериев. Текущий план и общие ограничения находятся в [родительской задаче](TASK-TS-001.md).
