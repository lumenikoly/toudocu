# BUG-CHANGES-001: Сохранять Git-state путей с пробелами

- Тип: Bug
- Статус: Выполнено
- Серьёзность: Средняя
- Приоритет: Высокий
- Воспроизводимость: Всегда
- Регрессия: Нет
- Модуль: MOD-CHANGES
- Сценарий: UC-DOCS-05
- Владелец: Команда Toudocu
- Стандарты: STD-GO-001, STD-DOCS-001
- Последнее обновление: 2026-08-09

## Симптом

Изменённый Markdown-файл с пробелами в имени присутствует в change set, но его
`gitState` не показывает staged или unstaged состояние.

## Ожидаемое поведение

NUL-separated Git path сохраняется целиком для modified и renamed records.

## Фактическое поведение

Путь `docs/file with spaces.md` регистрируется под ключом `spaces.md`, поэтому
последующий lookup возвращает пустой `ChangeGitState`.

## Шаги воспроизведения

1. Закоммитить Markdown-файл с пробелами в имени.
2. Изменить либо переименовать его и staged/unstaged состояние.
3. Построить Changes report и проверить `gitState` полного пути.

## Доказательства

Focused Git fixture вернул map с ключом `spaces.md`. Ранее корректное поведение
для такого пути не подтверждено тестами или историей, поэтому это не regression.

## Причина

Porcelain v2 record после NUL-разделения повторно разбивается через
`strings.Fields`, а путь берётся последним whitespace-токеном.

## Область изменения

- `internal/app/changes_git.go`;
- `internal/app/changes_test.go`;
- `docs/work/BUG-CHANGES-001.md`.

## Не входит в исправление

- изменение Git revisions или rename similarity;
- изменение публичной Changes schema;
- изменение source diff.

## План

1. Разбирать фиксированный prefix porcelain v2 без деления path по whitespace.
2. Проверить modified, staged и renamed paths с пробелами.

## Критерии приёмки

- [x] `AC-01` Регрессионный тест сохраняет staged/unstaged признаки полного
  modified path с пробелами.
- [x] `AC-02` Rename record с пробелами связывает Git-state с новым полным path.

## Проверка

- `AC-01` → `go test ./internal/app -run TestStatusStatesPreservePathsWithSpaces`
- `AC-02` → `go test ./internal/app -run TestStatusStatesPreservePathsWithSpaces`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

## Регрессионный тест

Временный Git repository покрывает unstaged, staged и renamed состояния одного
пути с пробелами.

## Влияние на документацию

Изменяется только `docs/work/BUG-CHANGES-001.md`; документированный Changes
contract остаётся прежним.
