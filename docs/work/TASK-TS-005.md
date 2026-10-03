<!-- toudocu
id: TASK-TS-005
status: done
taskType: maintenance
module: MOD-CLI
parentTask: TASK-TS-001
dependsOn: TASK-TS-004
standards: STD-DOCS-001
updated: 2026-09-19
-->

# TASK-TS-005: Перенести команды чтения и Git-отчёты

<!-- toudocu:section result -->
## Результат

Новый CLI возвращает прежние JSON и exit codes для команд чтения, не меняя Git и исходники.

Это требуемый результат этапа; статус и отмеченные критерии показывают фактическую готовность. Основание — этап и пункты 3; 10–12; 19–20; 46 исходного ТЗ, преобразованного в [дерево миграции](TASK-TS-001.md).

<!-- toudocu:section use-case-omission-reason -->
## Почему нет отдельного сценария

Миграция реализации сохраняет существующие пользовательские сценарии и публичные CLI/JSON-контракты. Новый сценарий ради смены языка не вводится.

<!-- toudocu:section scope -->
## Область изменения

Исходные точки переноса: `internal/`, `web/`, `scripts/`, `skills/` и `docs/`.
Новые пакеты создаются в пределах репозитория согласно результату этапа.

check/search/task ready/candidates/context/tree/changes/task changes/version; Commander; application services; общий ProcessRunner и logger.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

Изменение семантики CLI, документационного формата и модели задач, MCP, база данных, облачный backend, Next.js, Astro и автоматический запуск агента ядром. Другие этапы выполняются по зависимостям родительской задачи.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Каждая команда сохраняет аргументы, help, stdout, stderr, JSON schemaVersion и коды завершения.
- [x] `AC-02` Git корректно обрабатывает NUL, Unicode, staged/unstaged/untracked, сравнение коммитов, rename/copy/type changes без shell и external diff.
- [x] `AC-03` Операции чтения не выполняют команды задач, не меняют index и работают без сети; отмена и лимиты процессов проверены.
- [x] `AC-04` Общие ProcessRunner и Git adapter принимают AbortSignal, ограничивают stdout/stderr и завершают дерево процессов без shell interpolation.
- [x] `AC-05` ToudocuError переносит code, exitCode, path, range и details; `--format json` сохраняет чистый JSON stdout, а debug logging включается явно.

<!-- toudocu:section plan -->
## План

1. Сопоставить каждую read-only command с legacy argv, help, JSON schema,
   stderr и exit code, включая task context/candidates/tree и changes.
2. Реализовать единые ProcessRunner, Git adapter, logger и typed error mapping;
   handlers только валидируют argv, вызывают application service и форматируют output.
3. Перенести NUL/Unicode/staged/unstaged/untracked/rename Git cases без shell,
   fetch, checkout, index writes или external diff.
4. Запустить compatibility fixtures, cancellation/error tests и обновить CLI
   contract documentation.

## Ход переноса

В TypeScript CLI подключены `check`, `search`, `task ready`, `task candidates`,
`task context` и `task tree`. Для 75 задач канонической документации JSON и
текстовый вывод контекста совпали с Go после исключения версии генератора.
Эта проверка закреплена в `pnpm test:task-context-parity`.

Для Changes реализованы сравнения Markdown, Mermaid, экранов и OpenAPI,
объединение переносов по стабильному ID, расчёт влияния на документацию задачи,
форматирование отчёта и подключения команд `changes`, `changes file` и
`task changes` к CLI. 14 сценариев совместимости для текстового вывода,
Markdown, записи отчёта в файл и JSON совпадают с Go. Отдельные тесты
метаданных изображений завершены. Корпус совместимости покрывает help,
аргументы, stdout, stderr, JSON и коды завершения перенесённых команд.

Общий запуск процессов и чтение Git-снимков реализованы и покрыты тестами,
включая рабочую директорию, индекс, коммиты, Unicode/NUL-пути, отсутствие
обращения к настроенному remote, отмену, пределы вывода и завершение дерева
процессов. CI запускает эти проверки на Linux, macOS, Windows и Windows ARM.
Go остаётся действующей реализацией продукта до завершающего переключения CLI.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` -> `node scripts/compatibility.mjs`
- `AC-02` -> `pnpm exec vitest run packages/platform-node/src/git/repository.test.ts packages/platform-node/src/git/status.test.ts`
- `AC-03` -> `pnpm exec vitest run packages/platform-node/src/git/repository.test.ts packages/application/src/task-verify.test.ts`
- `AC-04` -> `pnpm exec vitest run packages/platform-node/src/process-runner.test.ts packages/platform-node/src/git/repository.test.ts packages/platform-node/src/git/status.test.ts`
- `AC-05` -> `pnpm exec vitest run apps/cli/src/cli.test.ts packages/application/src/errors.test.ts packages/application/src/logger.test.ts` (JSON/errors/debug logging покрыты)
- `ALL` -> `pnpm check`
- `DOCS` -> `node apps/cli/dist/main.js check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` -> `pnpm check`

Корпус совместимости сравнивает перенесённые команды с действующим Go CLI.
Узкие тесты проверяют Git и процессы без shell interpolation, изменения index
и сетевых обращений. При удалении Go expected fixtures остаются regression
baseline, а документационные проверки переводятся на новый CLI.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Обновить описание соответствующей границы в модулях и руководствах вместе с работающей реализацией. Сохранять различие между действующим Go runtime и целевым TypeScript runtime; не объявлять перенос завершённым до выполнения критериев. Текущий план и общие ограничения находятся в [родительской задаче](TASK-TS-001.md).
