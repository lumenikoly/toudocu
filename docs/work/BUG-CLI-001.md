<!-- toudocu
id: BUG-CLI-001
status: done
taskType: bug
severity: low
priority: normal
reproducibility: always
regression: false
module: MOD-CLI
useCase: not-applicable
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-11
-->

# BUG-CLI-001: Отклонять параметры Changes в других командах

<!-- toudocu:section symptom -->
## Симптом

CLI принимал `--base`, `--branch-base`, `--status`, `--module` и
`--permanent-only` даже в командах, которые не используют Changes.

<!-- toudocu:section expected-behavior -->
## Ожидаемое поведение

Параметр конкретной команды, переданный в другом месте, должен завершать
разбор аргументов с ненулевым кодом и понятной ошибкой. Перечисленные параметры
разрешены только для `changes`, `changes file` и `task changes`.

<!-- toudocu:section actual-behavior -->
## Фактическое поведение

Например, `check ./docs --base definitely-not-a-ref` успешно завершался и
молча игнорировал значение `--base`.

<!-- toudocu:section steps-to-reproduce -->
## Шаги воспроизведения

1. Передать команде `check` один из параметров Changes.
2. Получить успешную проверку вместо ошибки аргументов.

<!-- toudocu:section evidence -->
## Доказательства

Команда `check ./docs --base definitely-not-a-ref` завершилась с кодом `0`.
Разборщик заполнял поля `Change*`, но вне ветки Changes не проверял, какой
команде они принадлежат. Подтверждений прежнего строгого поведения нет, поэтому
ошибка не считается регрессией.

<!-- toudocu:section cause -->
## Причина

Для большинства параметров применимость проверялась отдельными признаками, но
для параметров Changes общей проверки принадлежности команде не было.

<!-- toudocu:section relationship-to-user-behavior -->
## Связь с пользовательским поведением

Это часть общего контракта CLI, а не отдельный продуктовый сценарий. Опасность
в том, что пользователь получал ложное подтверждение применения параметра.

<!-- toudocu:section scope -->
## Область изменения

- `internal/app/cli.go`;
- `internal/app/integration_test.go`;
- `docs/work/BUG-CLI-001.md`.

<!-- toudocu:section out-of-scope -->
## Не входит в исправление

- изменение смысла параметров там, где они разрешены;
- добавление новых параметров;
- изменение кодов завершения корректных команд.

<!-- toudocu:section plan -->
## План

1. Зафиксировать передачу каждого параметра, относящегося только к Changes.
2. Добавить одну общую проверку его принадлежности команде.
3. Проверить обе формы записи параметров табличным регрессионным тестом.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Регрессионный тест отклоняет обе формы всех параметров Changes в семействах
  `build`, `check`, `serve`, `search`, `scaffold` и команд жизненного цикла
  задач.
- [x] `AC-02` Те же параметры по-прежнему принимаются командами `changes`,
  `changes file` и `task changes`.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `go test ./internal/app -run TestChangeFlagsRejectedOutsideChanges`
- `AC-02` → `go test ./internal/app -run TestChangeFlagsRejectedOutsideChanges`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section regression-test -->
## Регрессионный тест

Табличный тест проверяет обе формы каждого параметра во всех посторонних
семействах команд и в трёх разрешённых командах Changes.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Меняется только эта историческая запись. Принадлежность параметров командам уже
описана в CLI-контракте.
