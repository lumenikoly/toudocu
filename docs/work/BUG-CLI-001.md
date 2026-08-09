# BUG-CLI-001: Отклонять Changes flags в других командах

- Тип: Bug
- Статус: Выполнено
- Серьёзность: Низкая
- Приоритет: Обычный
- Воспроизводимость: Всегда
- Регрессия: Нет
- Модуль: MOD-CLI
- Сценарий: Не применяется
- Владелец: Команда Toudocu
- Стандарты: STD-GO-001, STD-DOCS-001
- Последнее обновление: 2026-08-09

## Симптом

CLI принимает `--base`, `--branch-base`, `--status`, `--module` и
`--permanent-only` для команд, которые не используют Changes.

## Ожидаемое поведение

Command-specific flag вне `changes`, `changes file` и `task changes`
завершает argument parsing с ненулевым exit code и понятной ошибкой.

## Фактическое поведение

Например, `check ./docs --base definitely-not-a-ref` завершается успешно и
молча игнорирует значение.

## Шаги воспроизведения

1. Вызвать `check` с одним из Changes flags.
2. Наблюдать успешную проверку вместо argument error.

## Доказательства

Команда `check ./docs --base definitely-not-a-ref` завершилась с exit code `0`.
Parser устанавливает `Change*` поля, но вне Changes-ветки не проверяет их
принадлежность. Ранее строгое поведение не подтверждено, поэтому regression
отмечена как «Нет».

## Причина

Parser проверяет применимость большинства flags через отдельные booleans, но
для Changes flags такой общий gate отсутствует.

## Связь с пользовательским поведением

Это общий контракт CLI arguments, а не отдельный продуктовый сценарий:
пользователь получает ложное подтверждение применения параметра в любой
команде.

## Область изменения

- `internal/app/cli.go`;
- `internal/app/integration_test.go`;
- `docs/work/BUG-CLI-001.md`.

## Не входит в исправление

- изменение семантики применимых Changes filters;
- добавление новых flags;
- изменение exit codes валидных команд.

## План

1. Зафиксировать факт передачи каждого Changes-only flag.
2. Добавить единый command ownership gate.
3. Покрыть обе формы flags table-driven regression-тестом.

## Критерии приёмки

- [x] `AC-01` Регрессионный тест отклоняет обе формы всех Changes-only flags в
  command families build, check, serve, search, scaffold и task lifecycle.
- [x] `AC-02` Те же flags продолжают приниматься `changes`, `changes file` и
  `task changes`.

## Проверка

- `AC-01` → `go test ./internal/app -run TestChangeFlagsRejectedOutsideChanges`
- `AC-02` → `go test ./internal/app -run TestChangeFlagsRejectedOutsideChanges`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

## Регрессионный тест

Table-driven test проверяет обе формы каждого Changes-only flag во всех
посторонних command families и в трёх допустимых Changes-командах.

## Влияние на документацию

Изменяется только `docs/work/BUG-CLI-001.md`; command-specific flags уже
описаны в CLI-контракте.
