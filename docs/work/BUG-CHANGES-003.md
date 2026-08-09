# BUG-CHANGES-003: Выбирать task changes по точному ID

- Тип: Bug
- Статус: Выполнено
- Серьёзность: Средняя
- Приоритет: Высокий
- Воспроизводимость: Всегда
- Регрессия: Нет
- Модуль: MOD-CHANGES
- Сценарий: UC-DOCS-05
- Владелец: Команда Docu-docu
- Стандарты: STD-GO-001, STD-DOCS-001
- Последнее обновление: 2026-08-09

## Симптом

`task changes` зависит от имени task-файла и смешивает ID с общим префиксом.

## Ожидаемое поведение

Task contract выбирается по точному стабильному ID из H1 выбранного Git
snapshot; имя файла не участвует в идентичности.

## Фактическое поведение

Файл без ID в имени не находится, а изменение `TASK-X-0010` считается
task-файлом для `TASK-X-001`.

## Шаги воспроизведения

1. Создать валидный work item в файле `custom-name.md`.
2. Добавить второй work item с ID, имеющим общий префикс.
3. Вызвать `task changes` первого ID и проверить выбранный contract и changes.

## Доказательства

`taskDocumentContent`, `buildTaskImpact` и `changeRelatedToTask` используют
`strings.Contains` по basename вместо parsed ID. Ранее корректное поведение для
произвольного имени не подтверждено, поэтому regression отмечена как «Нет».

## Причина

Changes повторно выводит identity work item из filename вместо использования
точного H1 ID snapshot-документа.

## Область изменения

- `internal/app/changes_git.go`;
- `internal/app/changes_build.go`;
- `internal/app/changes_report.go`;
- `internal/app/changes_types.go`;
- `internal/app/changes_test.go`;
- `docs/work/BUG-CHANGES-003.md`.

## Не входит в исправление

- переименование существующих work items;
- изменение стабильных task IDs;
- построение полной ProjectModel для каждой Git-стороны.

## План

1. Найти точный ID через parsed H1 всех snapshot task-документов.
2. Сохранить выбранный task path в приватном change context.
3. Использовать exact path в impact и task filter.

## Критерии приёмки

- [x] `AC-01` Регрессионный тест выбирает task по точному ID при произвольном
  filename.
- [x] `AC-02` Work item с ID-расширением не попадает в `TaskChanges` выбранной
  задачи.

## Проверка

- `AC-01` → `go test ./internal/app -run TestTaskChangesSelectsExactTaskIDFromHeading`
- `AC-02` → `go test ./internal/app -run TestTaskChangesSelectsExactTaskIDFromHeading`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/docu-docu || exit 1; done`

## Регрессионный тест

Git fixture использует filename без task ID и соседний ID с общим префиксом.

## Влияние на документацию

Изменяется только `docs/work/BUG-CHANGES-003.md`; правило стабильного ID уже
задокументировано.
