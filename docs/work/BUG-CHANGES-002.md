# BUG-CHANGES-002: Разрешать относительный documentation impact

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

Task impact не распознаёт documentation-impact ссылки, записанные относительно
task-файла.

## Ожидаемое поведение

Markdown links разрешаются от каталога task-файла и сопоставляются с
repository-relative paths выбранного Git snapshot.

## Фактическое поведение

Ссылки `../modules/site.md` и `../reference/features.md` дают пустой `declared`
и при изменении целей создают ложный `undeclared-document-change`.

## Шаги воспроизведения

1. Объявить documentation impact ссылкой `../modules/site.md`.
2. Изменить связанный документ.
3. Вызвать `task changes` и проверить declared/actual diagnostics.

## Доказательства

`task changes TASK-SITE-001 HEAD → HEAD` вернул `declared: []` для двух
существующих относительных ссылок. Доказательств ранее корректного поведения
нет, поэтому дефект не классифицирован как regression.

## Причина

Task impact извлекает пути regexp, теряет source path task-документа и жёстко
добавляет `docs/` вместо стандартного разрешения Markdown link.

## Область изменения

- `internal/app/changes_build.go`;
- `internal/app/changes_types.go`;
- `internal/app/changes_report.go`;
- `internal/app/changes_test.go`;
- `docs/work/BUG-CHANGES-002.md`.

## Не входит в исправление

- изменение значения task-impact warnings;
- сравнение файлов вне выбранного documentation root;
- изменение Markdown link policy.

## План

1. Сохранить task source path и docs root в snapshot context.
2. Разрешать links относительно task-файла и проверять границу docs root.
3. Добавить end-to-end regression для declared change.

## Критерии приёмки

- [x] `AC-01` Регрессионный тест относит `../modules/site.md` к
  `docs/modules/site.md` выбранного snapshot.
- [x] `AC-02` Заявленный изменённый документ не получает undeclared diagnostic.

## Проверка

- `AC-01` → `go test ./internal/app -run TestTaskImpactResolvesRelativeDocumentationLinks`
- `AC-02` → `go test ./internal/app -run TestTaskImpactResolvesRelativeDocumentationLinks`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/docu-docu || exit 1; done`

## Регрессионный тест

Git fixture изменяет цель относительной ссылки и проверяет declared entry и
отсутствие ложного warning.

## Влияние на документацию

Изменяется только `docs/work/BUG-CHANGES-002.md`; существующий task impact
contract уже требует стандартные относительные Markdown links.
