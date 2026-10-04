<!-- toudocu
id: TASK-TS-014
status: done
taskType: maintenance
module: MOD-CLI
parentTask: TASK-TS-001
dependsOn: TASK-TS-013
standards: STD-TS-001, STD-DOCS-001
updated: 2026-09-20
-->

# TASK-TS-014: Завершить миграцию, удалить Go и обновить документацию

<!-- toudocu:section result -->
## Результат

После полного паритета production-код и поставка используют TypeScript/React; документация описывает проверенную итоговую систему.

Это требуемый результат этапа; статус и отмеченные критерии показывают фактическую готовность. Основание — этап и пункты 12; 77–80 исходного ТЗ, преобразованного в [дерево миграции](TASK-TS-001.md).

<!-- toudocu:section use-case-omission-reason -->
## Почему нет отдельного сценария

Миграция реализации сохраняет существующие пользовательские сценарии и публичные CLI/JSON-контракты. Новый сценарий ради смены языка не вводится.

<!-- toudocu:section scope -->
## Область изменения

Область финализации: `apps/`, `packages/`, `scripts/`, `.github/`, `docs/`,
`README.md`, `CONTRIBUTING.md`, `package.json` и `pnpm-workspace.yaml`.

Удаление Go runtime/API/CI и islands lifecycle; README/CONTRIBUTING, architecture, modules, CLI/install/workflow/skills/release/security docs.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

Изменение семантики CLI, документационного формата и модели задач, MCP, база данных, облачный backend, Next.js, Astro и автоматический запуск агента ядром. Другие этапы выполняются по зависимостям родительской задачи.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Все compatibility, security, offline и browser проверки подтверждают прежние пользовательские возможности и контракты.
- [x] `AC-02` Production Go, go.mod/go.sum, Go renderer и custom navigation удалены; сохранён регрессионный корпус.
- [x] `AC-03` pnpm lint/typecheck/test/test:browser/build/check проходят; документация согласована с реализацией и все дочерние задачи выполнены.

<!-- toudocu:section plan -->
## План

1. Подтвердить совместимость, безопасность, работу без сети и браузерные сценарии до переключения основной точки входа.
2. После сохранения эталонного корпуса удалить Go-код, публичный Go API, Go CI, генерацию HTML, острова и собственную навигацию.
3. Выполнить полный набор проверок TypeScript/React и поставки; согласовать README, CONTRIBUTING, архитектуру, модули, контракты и руководства с реализацией.
4. Завершить родителя только после всех дочерних задач и проверки согласованности исходников, сборки и установки.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` -> `pnpm test`
- `AC-02` -> `pnpm test`
- `AC-03` -> `pnpm check`
- `ALL` -> `pnpm check`
- `DOCS` -> `node apps/cli/dist/main.js check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` -> `pnpm check`

Эталонные fixtures и compatibility-корпус остаются в репозитории после удаления Go runtime.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Архитектура, модули, контракты, руководства и release-процесс описывают только текущий TypeScript/React runtime.
