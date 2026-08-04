# TASK-CLI-001: Реализовать полный workflow рабочей задачи

- Статус: Выполнено
- Тип: Feature
- Приоритет: Высокий
- Модуль: MOD-CLI
- Сценарий: UC-TASK-03
- Процесс: FLOW-TASK-WORKFLOW
- Владелец: Команда Docu-docu
- Последнее обновление: 2026-07-29

## Результат

CLI предоставляет детерминированный путь от поиска документации и создания
каркаса до readiness, контекста и явной проверки выбранной задачи.

## Изменение поведения

### Было

CLI предоставлял только `task context` и исполняющую команду `task check`;
каркасы, readiness и source-level поиск отсутствовали.

### Станет

CLI предоставляет `search`, `task init`, `scaffold`, `task ready`, расширенный
`task context` и `task verify`; старая команда `task check` отсутствует.

## Область изменения

- `internal/app/cli.go`
- `internal/app/types.go`
- `report_types.go`
- `internal/app/knowledge.go`
- `internal/app/task_verify.go`
- `internal/app/task_context.go`
- `search.go`
- `internal/app/scaffold.go`
- `internal/app/task_ready.go`
- `docs/`
- `skills/use-docu-docu/`

## Не входит в задачу

- интерпретация natural-language запроса внутри Docu-docu;
- автоматический выбор или заполнение сущностей;
- автоматическое изменение статусов и acceptance checkboxes;
- новые внешние зависимости.

## Критерии приёмки

- [x] `AC-01` Новые CLI-формы разбираются детерминированно, а `task check` отклоняется.
- [x] `AC-02` Search, init и scaffold соблюдают ranking, ID-based paths и atomic create.
- [x] `AC-03` Ready и context возвращают полный локальный контракт без изменения файлов и выполнения команд.
- [x] `AC-04` Verify поддерживает dry-run, targeted и full run с безопасным отчётом и ограниченным выводом.
- [x] `AC-05` Все публичные JSON-отчёты используют единую schema v1.

## План

- [x] Расширить parser, типы отчётов и task contract.
- [x] Реализовать search, создание каркасов и readiness.
- [x] Расширить context и заменить check на verify.
- [x] Синхронизировать документацию, skill и тесты.
- [x] Выполнить полный verification cycle.

## Проверка

- `AC-01` → `go test ./... -run 'TestCLI|TestTask'`
- `AC-02` → `go test ./... -run 'TestSearch|TestInit|TestScaffold'`
- `AC-03` → `go test ./... -run 'TestTaskReady|TestTaskContext'`
- `AC-04` → `go test ./... -run 'TestTaskVerify|TestCommandProcess'`
- `AC-05` → `go test ./... -run 'TestGenerateSite|TestProjectReport'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict`

## Влияние на документацию

Обновляются `README.md`, `CHANGELOG.md`, `docs/contracts/cli.md`,
`docs/roadmap.md`, `docs/use-cases/`, `docs/flows/FLOW-TASK-WORKFLOW.md`,
`docs/decisions/ADR-002.md` и `skills/use-docu-docu/`.
