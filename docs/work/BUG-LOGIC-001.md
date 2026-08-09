# BUG-LOGIC-001: Согласовать task readiness со специальным Bug-контрактом

- Тип: Bug
- Статус: Выполнено
- Серьёзность: Высокая
- Приоритет: Высокий
- Воспроизводимость: Всегда
- Регрессия: Нет
- Модуль: MOD-CLI
- Сценарий: UC-TASK-02
- Владелец: Команда Toudocu
- Стандарты: STD-GO-001, STD-DOCS-001
- Последнее обновление: 2026-08-09

## Симптом

Валидный Ready-баг нельзя провести через `task ready` или `task verify`.

## Ожидаемое поведение

Специальный контракт `BUG-*`, принятый проектной моделью, проходит task-local
readiness gate. Технический баг с `Сценарий: Не применяется` сохраняет
документированное исключение.

## Фактическое поведение

Ready-баг получает `missing-task-result` и `missing-behavior-change`, а
технический баг дополнительно получает `missing-task-use-case`.

## Шаги воспроизведения

1. Построить модель из полного Ready-баг-контракта без Feature-разделов.
2. Вызвать `task ready` или `task verify --dry-run` для его ID.
3. Наблюдать блокирующие Feature-diagnostics.

## Доказательства

Focused Go-сценарий вернул `contract_incomplete` с
`missing-task-result,missing-behavior-change` для fixture, которую основной
валидатор принимает без issues. Репозиторий не содержит доказательств ранее
работавшего readiness для этого контракта, поэтому дефект не классифицирован
как регрессия.

## Причина

`taskReadiness` безусловно требует `Result` и применяет Feature-поля
`BehaviorChange`, `Before`, `After` ко всем элементам типа Bug, не сохраняя
разрешённое исключение use case из основной модели.

## Область изменения

- `internal/app/task_ready.go`;
- `internal/app/knowledge.go`;
- `internal/app/types.go`;
- `internal/app/bug_test.go`;
- `docs/work/BUG-LOGIC-001.md`.

## Не входит в исправление

- изменение специального Bug-контракта;
- изменение статусов или команд task workflow;
- исправления других типов work item.

## План

1. Сохранить признак допустимого отсутствия use case в `WorkItem`.
2. Разделить общие, Feature- и Bug-требования readiness.
3. Добавить регрессии для обычного и технического Ready-багов.

## Критерии приёмки

- [x] `AC-01` Регрессионные тесты подтверждают, что валидные обычный и
  технический Ready-баги проходят `task ready`.
- [x] `AC-02` `task verify --dry-run` строит план валидного Bug без
  Feature-diagnostics и не исполняет команды.

## Проверка

- `AC-01` → `go test ./internal/app -run 'TestBugWorkItemValidationAndPortalFilters|TestTechnicalBugMayExplainMissingUseCase'`
- `AC-02` → `go test ./internal/app -run 'TestBugWorkItemValidationAndPortalFilters'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

## Регрессионный тест

Обычный и технический Ready-баги проверяются через публичные readiness и
dry-run отчёты, а не только через внутренний parser.

## Влияние на документацию

Изменяется только `docs/work/BUG-LOGIC-001.md`: исправление восстанавливает уже
описанный специальный Bug-контракт.
