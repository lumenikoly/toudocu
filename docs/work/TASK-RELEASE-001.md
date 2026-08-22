<!-- toudocu
version: 1
id: TASK-RELEASE-001
status: done
taskType: maintenance
priority: high
module: MOD-CLI
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-11
-->

# TASK-RELEASE-001: Собрать стабильный релиз 0.0.1

<!-- toudocu:section result -->
## Результат

Репозиторий содержит согласованную версию `0.0.1`, воспроизводимую сборку
портала, локальные проверки, релизный комплект и процесс GitHub Actions.
Создание тега и запуск публикации намеренно не входили в эту задачу.

<!-- toudocu:section scope -->
## Область изменения

- `Makefile`;
- `.github/workflows/`;
- `internal/app/`;
- `docs/`;
- `README.md`;
- `CHANGELOG.md`;
- `project-docs/`.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

- создание Git-тега;
- настройка или чтение удалённого репозитория GitHub;
- `push`, запуск GitHub Actions и публикация GitHub Release;
- изменение набора команд, публичного Go API или структуры JSON schema v1.
  Менялось только значение существующей константы `toudocu.Version`.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` CLI и каноническая документация используют версию `0.0.1`, а
  процесс выпуска принимает тег с точно таким же именем.
- [x] `AC-02` Одинаковые исходники дают одинаковый
  `assets/search-index.js` независимо от порядка обхода карты метаданных.
- [x] `AC-03` Одна локальная команда проверяет форматирование, Go-код, поиск
  гонок, модули и каноническую документацию.
- [x] `AC-04` Локальный набор релизных файлов содержит шесть бинарников,
  уведомления, лицензии и проверяемый `checksums.txt`.
- [x] `AC-05` Исходная документация и отслеживаемый портал описывают стабильную
  версию и поддерживаемые способы установки без временных оговорок.

<!-- toudocu:section plan -->
## План

1. Зафиксировать версию и контракт выпуска.
2. Устранить случайный порядок поискового индекса.
3. Согласовать локальные и CI-проверки выпуска.
4. Обновить документацию и пересобрать порталы.
5. Выполнить полный локальный цикл выпуска без обращения к GitHub.
6. Провести независимую проверку смысла изменённой документации.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `go run ./cmd/toudocu version && test "$(go run ./cmd/toudocu version)" = "0.0.1"`
- `AC-02` → `go test ./internal/app -run TestSearchIndexMetadataOrderIsDeterministic`
- `AC-03` → `make check`
- `AC-04` → `make release && cd dist && sha256sum -c checksums.txt`
- `AC-05` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Были обновлены версия, текущее состояние, завершённые сущности Changes,
корневой журнал изменений и описание автономной поставки. Отслеживаемый портал
пересобирался из Markdown.

<!-- toudocu:section use-case-omission-reason -->
## Обоснование отсутствия сценария

Задача относится к релизной инженерии и воспроизводимости файлов, а не к новому
пользовательскому сценарию CLI.
