<!-- toudocu
id: TASK-AGENT-018
status: done
taskType: feature
priority: normal
module: MOD-AGENT-CONSOLE
useCase: UC-AGENT-CONSOLE-01
standards: STD-GO-001, STD-DOCS-001
updated: 2026-09-04
parentTask: TASK-AGENT-001
-->

# TASK-AGENT-018: Завершать выполненную задачу из интерфейса

<!-- toudocu:section result -->
## Результат

Разработчик завершает подготовленную одиночную задачу из локального портала без
повторного запуска агента.

<!-- toudocu:section behavior-change -->
## Изменение поведения

<!-- toudocu:section before -->
### Было

После выполнения одиночной задачи агент мог оставить её в статусе «В работе».
Для перехода в Done требовался новый turn агента или ручное редактирование
Markdown.

<!-- toudocu:section after -->
### Станет

Для задачи с отмеченными критериями и завершёнными связями портал показывает
действие «Завершить задачу». После подтверждения Toudocu повторно проверяет
условия и меняет статус в исходном Markdown.

<!-- toudocu:section scope -->
## Область изменения

- `internal/app/agent_task.go` и HTTP-контракт действий задачи;
- `web/src/features/task-actions/` и локализация портала;
- документация сценария и модуля Agent Console.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

- автоматическое завершение после turn агента;
- повторный запуск Verification-команд;
- автоматическая архивация.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Задачу «В работе» с отмеченными критериями, завершёнными
  зависимостями и дочерними задачами можно явно перевести в Done.
- [x] `AC-02` Перед изменением портал требует подтверждение и сообщает, что
  команды проверки повторно не запускаются.
- [x] `AC-03` Неготовая задача и запрос с устаревшим digest не изменяют файл.

<!-- toudocu:section plan -->
## План

1. Добавить прямое действие в существующий Task Actions API.
2. Переиспользовать серверные правила готовности и безопасную запись файла.
3. Добавить подтверждение и локализованные сообщения в портал.
4. Обновить контракт и пользовательский сценарий.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` -> `go test ./internal/app -run TestCompleteTask`
- `AC-02` -> `cd web && npm test -- --run ui.test.tsx`
- `AC-03` -> `go test ./internal/app -run 'TestCompleteTask|TestTaskActionDigest'`
- `ALL` -> `go test ./...`
- `DOCS` -> `go run ./cmd/toudocu check ./docs --strict --stale-days 0`
- `QUALITY` -> `cd web && npm run typecheck`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Обновить `docs/contracts/task-actions.md`,
`docs/contracts/task-actions.openapi.yaml`,
`docs/use-cases/UC-AGENT-CONSOLE-01.md` и
`docs/modules/MOD-AGENT-CONSOLE.md`.
