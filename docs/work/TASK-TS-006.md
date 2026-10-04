<!-- toudocu
id: TASK-TS-006
status: done
taskType: maintenance
module: MOD-CLI
parentTask: TASK-TS-001
dependsOn: TASK-TS-005
standards: STD-DOCS-001
updated: 2026-09-19
-->

# TASK-TS-006: Перенести запись, проверки задач и установку skills

<!-- toudocu:section result -->
## Результат

Команды изменения и доставки skills работают через application services с прежними ограничениями записи и выполнения.

Это требуемый результат этапа; статус и отмеченные критерии показывают фактическую готовность. Основание — этап и пункты 4; 21–23; 47–50 исходного ТЗ, преобразованного в [дерево миграции](TASK-TS-001.md).

<!-- toudocu:section use-case-omission-reason -->
## Почему нет отдельного сценария

Миграция реализации сохраняет существующие пользовательские сценарии и публичные CLI/JSON-контракты. Новый сценарий ради смены языка не вводится.

<!-- toudocu:section scope -->
## Область изменения

Исходные точки переноса: `internal/`, `web/`, `scripts/`, `skills/` и `docs/`.
Новые пакеты создаются в пределах репозитория согласно результату этапа.

task init/scaffold/archive/restore/verify; agent next/respond; skill install/update/status/uninstall.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

Изменение семантики CLI, документационного формата и модели задач, MCP, база данных, облачный backend, Next.js, Astro и автоматический запуск агента ядром. Другие этапы выполняются по зависимостям родительской задачи.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Create-only, архивирование, восстановление и атомарная запись сохраняют исходники при ошибке и не обходят PathPolicy.
- [x] `AC-02` Только явный task verify --run выполняет команды; dry-run/context/check/build никогда их не запускают.
- [x] `AC-03` Очередь agent next/respond и состояния установки skills сохраняют JSON-контракты и защиту локальных изменений.

<!-- toudocu:section plan -->
## План

1. Сопоставить task init/archive/restore/verify и skill install/update/status/
   uninstall с create-only, digest, local-change и approval contracts.
2. Перенести PathPolicy и atomic write service с realpath/symlink/root checks;
   отделить dry-run/context/check/build от единственного execution path.
3. Перенести agent next/respond и skill state machine через общий CLI output
   layer, сохранив локальные изменения и machine JSON.
4. Воспроизвести write failure, traversal, symlink, dry-run и approval cases;
   обновить task, workflow и skills documentation.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` -> `pnpm test`
- `AC-02` -> `pnpm test`
- `AC-03` -> `pnpm check`
- `ALL` -> `pnpm check`
- `DOCS` -> `node apps/cli/dist/main.js check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` -> `pnpm check`

Команды новой системы являются целевыми проверками этапа. До появления соответствующих тестов их успешный запуск не подтверждает критерии. При удалении Go документационные проверки переводятся на новый CLI; совпадение отчётов проверяется до переключения.

## Ход переноса

В TypeScript CLI подключены `task init`, `scaffold`, `task archive` и
`task restore`. Для создания задачи, семи видов документов, архивирования и
восстановления десять сценариев сравнения с Go подтвердили совпадение вывода
и созданных файлов после нормализации версии генератора и даты. Отдельные
тесты проверяют отказ при существующем назначении, небезопасных символических
ссылках, отсутствующем исходнике и отмене операции.

`task verify`, `agent next/respond` и управление установленными skills
подключены к TypeScript CLI. Узкие тесты подтверждают dry-run без выполнения,
явный run, отмену и timeout, JSON очереди, идемпотентный ответ и защиту
изменённых, неизвестных, более новых и небезопасных установок. Go остаётся
действующей реализацией продукта до завершающего переключения CLI.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Обновить описание соответствующей границы в модулях и руководствах вместе с работающей реализацией. Сохранять различие между действующим Go runtime и целевым TypeScript runtime; не объявлять перенос завершённым до выполнения критериев. Текущий план и общие ограничения находятся в [родительской задаче](TASK-TS-001.md).
