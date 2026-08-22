<!-- toudocu
version: 1
id: TASK-CLI-003
status: done
taskType: maintenance
module: MOD-CLI
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-21
-->

# TASK-CLI-003: Перевести вывод Go CLI на английский язык

<!-- toudocu:section result -->
## Результат

Все подписи и сообщения, создаваемые самим Go CLI, выводятся на английском
независимо от языка исходной документации.

<!-- toudocu:section behavior-change -->
## Изменение поведения

<!-- toudocu:section before -->
### Было

Справка CLI, текстовые отчёты, сообщения об успехе и вывод запуска сервера
смешивали русский и английский языки. Диагностические сообщения JSON уже были
на английском.

<!-- toudocu:section after -->
### Станет

Go CLI использует английский для собственных подписей, пояснений и сообщений.
Русские каркасы при выборе `--lang ru` переводят только видимый читателю текст.
Скрытые аннотации — имена полей, виды разделов и допустимые значения — в
русских и английских каркасах совпадают. Пользовательские заголовки и другой
текст исходных документов CLI не переводит.

<!-- toudocu:section scope -->
## Область изменения

- Пользовательская справка, текстовые отчёты, сообщения об успехе и вывод
  запуска в `internal/app/`.
- Поведенческие тесты представительных текстовых ответов команд.
- Инвариант языка CLI в `docs/contracts/cli.md`.
- Граница интерфейсного текста в `docs/modules/cli.md`.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

- Перевод канонической документации проекта или настроенных каталогов
  переводов.
- Удаление каркасов `--lang ru`.
- Перевод пользовательских заголовков, путей или значений метаданных.
- Выбор языка интерфейса CLI во время выполнения.

<!-- toudocu:section use-case-omission-reason -->
## Обоснование отсутствия сценария

Эта доработка унифицирует представление существующих команд и не добавляет
новый пользовательский сценарий.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Общая и контекстная справка содержит английский интерфейсный
  текст без русских подписей.
- [x] `AC-02` Текстовый вывод операций check, build, serve, changes, search,
  task и agent использует английские подписи и сообщения.
- [x] `AC-03` Русские каркасы остаются поддерживаемыми и используют те же
  скрытые машинные аннотации, что и английские.
- [x] `AC-04` Публичный контракт CLI фиксирует английский язык интерфейса Go
  CLI и сохранение исходных значений документов.

<!-- toudocu:section plan -->
## План

- [x] Перевести существующие пользовательские строки Go на месте.
- [x] Обновить затронутые тестовые ожидания и добавить регрессионную проверку.
- [x] Обновить контракт CLI и правило модуля.
- [x] Выполнить обязательные проверки Go и документации.
- [x] Получить независимое ревью поведения и контракта задачи.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` -> `go test ./internal/app -run 'TestCLIHelpUsesEnglish|TestContextualHelp'`
- `AC-02` -> `go test ./internal/app`
- `AC-03` -> `go test ./internal/app -run 'TestTaskInitAndScaffoldAtomicCreate|TestScaffoldLanguageDefaultsToProjectLocale|TestTaskInitWithParent'`
- `AC-04` -> `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `ALL` -> `go test ./...`
- `DOCS` -> `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` -> `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

- `docs/contracts/cli.md` — язык справки, сообщений и текстовых отчётов.
- `docs/modules/cli.md` — граница между интерфейсным текстом CLI и исходными
  данными.
