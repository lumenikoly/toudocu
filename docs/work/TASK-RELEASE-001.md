# TASK-RELEASE-001: Подготовить стабильный релиз 0.0.1

- Статус: Выполнено
- Тип: Maintenance
- Приоритет: Высокий
- Модуль: MOD-CLI
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Toudocu
- Последнее обновление: 2026-08-09

## Результат

Репозиторий локально готов к публикации стабильного релиза `0.0.1`: версия,
детерминированные порталы, проверки, release bundle и GitHub workflow
согласованы, но тег и публикация не выполняются.

## Область изменения

- `Makefile`;
- `.github/workflows/`;
- `internal/app/`;
- `docs/`;
- `README.md`;
- `CHANGELOG.md`;
- `project-docs/`;

## Не входит в задачу

- создание Git-тега;
- настройка или чтение GitHub remote;
- push, GitHub Actions и публикация GitHub Release;
- изменение набора или сигнатур CLI-команд, экспортов Go API и структуры JSON
  schema v1; меняется только значение существующей константы `toudocu.Version`.

## Критерии приёмки

- [x] `AC-01` CLI и каноническая документация используют версию `0.0.1`, а
  release workflow принимает тег с точно таким же именем.
- [x] `AC-02` Одинаковые исходники дают побайтово одинаковый
  `assets/search-index.js` независимо от порядка обхода metadata map.
- [x] `AC-03` Единая локальная команда проверяет форматирование, Go-код,
  race detector, модули и канонический documentation root.
- [x] `AC-04` Локальный release bundle содержит шесть целевых бинарников,
  notices, лицензии и проверяемый `checksums.txt`.
- [x] `AC-05` Исходная документация и отслеживаемый портал согласованы с
  поведением релиза без преждевременной отметки о публикации.

## План

1. Зафиксировать версию и release contract.
2. Устранить недетерминированный порядок поискового индекса.
3. Унифицировать локальные и CI release gates.
4. Обновить документацию и пересобрать порталы.
5. Выполнить полный локальный release cycle без обращения к GitHub.
6. Получить независимый semantic review изменённой release-документации.

## Проверка

- `AC-01` → `go run ./cmd/toudocu version && test "$(go run ./cmd/toudocu version)" = "0.0.1"`
- `AC-02` → `go test ./internal/app -run TestSearchIndexMetadataOrderIsDeterministic`
- `AC-03` → `make check`
- `AC-04` → `make release && cd dist && sha256sum -c checksums.txt`
- `AC-05` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

## Влияние на документацию

Обновляются версия, текущее состояние, завершённые Changes-сущности, канонический
changelog и описание dependency-free поставки. Отслеживаемый портал
пересобираются из исходного Markdown.

## Обоснование отсутствия сценария

Задача меняет release engineering и воспроизводимость артефактов, не добавляя
нового пользовательского сценария CLI.
