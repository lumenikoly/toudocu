<!-- toudocu
id: TASK-TS-012
status: done
taskType: maintenance
module: MOD-AGENT-CONSOLE
parentTask: TASK-TS-001
dependsOn: TASK-TS-011
standards: STD-DOCS-001
updated: 2026-09-19
-->

# TASK-TS-012: Перенести Agent Console и Project Terminal

<!-- toudocu:section result -->
## Результат

Агент и системный терминал продолжают работу при навигации SPA и корректно завершаются.

Это требуемый результат этапа; статус и отмеченные критерии показывают фактическую готовность. Основание — этап и пункты 10; 20; 51–55; 73 исходного ТЗ, преобразованного в [дерево миграции](TASK-TS-001.md).

<!-- toudocu:section use-case-omission-reason -->
## Почему нет отдельного сценария

Миграция реализации сохраняет существующие пользовательские сценарии и публичные CLI/JSON-контракты. Новый сценарий ради смены языка не вводится.

<!-- toudocu:section scope -->
## Область изменения

Исходные точки переноса: `internal/`, `web/`, `scripts/`, `skills/` и `docs/`.
Новые пакеты создаются в пределах репозитория согласно результату этапа.

ProcessRunner, provider sessions, approvals, persistent scoped providers, node-pty adapter и cleanup.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

Изменение семантики CLI, документационного формата и модели задач, MCP, база данных, облачный backend, Next.js, Astro и автоматический запуск агента ядром. Другие этапы выполняются по зависимостям родительской задачи.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Agent Console и Project Terminal не размонтируются при смене route и сохраняют состояние сессии.
- [x] `AC-02` Браузер не выбирает произвольные executable/argv/cwd/env; PTY работает с правами пользователя и loopback по умолчанию.
- [x] `AC-03` Закрытие сессии и serve завершает PTY и дочерние процессы; агент использует установленный skill и публичный CLI.
- [x] `AC-04` Запуски агента и PTY принимают AbortSignal; явная отмена и остановка сервера освобождают сессии и дочерние процессы, а обычная смена страницы сохраняет их.

<!-- toudocu:section plan -->
## План

1. Использовать общий ProcessRunner для подпроцессов агента; разместить состояние сессий выше переключаемых страниц.
2. Подключить Agent Console и Project Terminal с текущими правилами CLI, навыков, подтверждений и выбора оболочки.
3. Передать AbortSignal операциям агента и PTY; освобождать процессы и соединения при явном закрытии сессии или сервера, сохраняя их при переходе между страницами.
4. Проверить непрерывность сессий, ограничения запуска, подтверждения, отмену и очистку; обновить документацию агента и терминала.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` -> `pnpm test`
- `AC-02` -> `pnpm test:browser`
- `AC-03` -> `pnpm test:browser`
- `AC-04` -> `pnpm exec vitest run packages/platform-node/src/pty/cancellation.test.ts packages/server/src/agent-session-cleanup.test.ts`
- `ALL` -> `pnpm check`
- `DOCS` -> `node apps/cli/dist/main.js check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` -> `pnpm check`

Команды новой системы проверяют перенесённые жизненные циклы и браузерную навигацию. При удалении Go документационные проверки переводятся на новый CLI; совпадение отчётов проверяется до переключения.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Обновить описание соответствующей границы в модулях и руководствах вместе с работающей реализацией. Сохранять различие между действующим Go runtime и целевым TypeScript runtime; не объявлять перенос завершённым до выполнения критериев. Текущий план и общие ограничения находятся в [родительской задаче](TASK-TS-001.md).
