<!-- toudocu
id: BUG-CHANGES-001
status: done
taskType: bug
severity: medium
priority: high
reproducibility: always
regression: false
module: MOD-CHANGES
useCase: UC-DOCS-05
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-10
-->

# BUG-CHANGES-001: Сохранять состояние Git для путей с пробелами

<!-- toudocu:section symptom -->
## Симптом

Изменённый Markdown-файл с пробелами в имени входит в отчёт, но в `gitState`
не видно, подготовлено ли изменение к коммиту (`staged`) или осталось только в
рабочем дереве (`unstaged`).

<!-- toudocu:section expected-behavior -->
## Ожидаемое поведение

Git разделяет пути нулевым байтом, поэтому пробелы должны оставаться частью
имени. Это правило одинаково действует для изменённых и переименованных
файлов.

<!-- toudocu:section actual-behavior -->
## Фактическое поведение

Путь `docs/file with spaces.md` сохранялся под ключом `spaces.md`. Поиск по
полному пути затем возвращал пустой `ChangeGitState`.

<!-- toudocu:section steps-to-reproduce -->
## Шаги воспроизведения

1. Добавить в Git Markdown-файл с пробелами в имени.
2. Изменить или переименовать его, оставив часть изменений в рабочем дереве
   либо подготовив их к коммиту.
3. Построить отчёт Changes и посмотреть `gitState` полного пути.

<!-- toudocu:section evidence -->
## Доказательства

Изолированный Git-сценарий вернул карту с ключом `spaces.md`. Тестов или
истории, подтверждающих прежнюю правильную работу этого случая, нет, поэтому
ошибка не считается регрессией.

<!-- toudocu:section cause -->
## Причина

После разбиения записи формата Git Porcelain v2 по нулевым байтам код ещё раз
применял `strings.Fields`. Эта функция разделяет строку по пробелам, и в
качестве пути оставалось только последнее слово.

<!-- toudocu:section scope -->
## Область изменения

- `internal/app/changes_git.go`;
- `internal/app/changes_test.go`;
- `docs/work/BUG-CHANGES-001.md`.

<!-- toudocu:section out-of-scope -->
## Не входит в исправление

- изменение выбираемых ревизий Git или порога сходства при переименовании;
- изменение публичной схемы Changes;
- изменение формата исходного diff.

<!-- toudocu:section plan -->
## План

1. Разбирать фиксированную часть записи Porcelain v2, не разделяя путь по
   пробелам.
2. Проверить изменённые, подготовленные к коммиту и переименованные пути с
   пробелами.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Регрессионный тест сохраняет признаки `staged` и `unstaged` для
  полного пути изменённого файла с пробелами.
- [x] `AC-02` После переименования файла с пробелами состояние Git связано с
  его новым полным путём.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `go test ./internal/app -run TestStatusStatesPreservePathsWithSpaces`
- `AC-02` → `go test ./internal/app -run TestStatusStatesPreservePathsWithSpaces`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section regression-test -->
## Регрессионный тест

Временный Git-репозиторий проверяет `unstaged`, `staged` и переименованное
состояния одного пути с пробелами.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Меняется только эта историческая запись об исправлении. Публичный контракт
Changes остаётся прежним.
