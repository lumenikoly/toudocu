# BUG-SITE-001: Показывать inline diagnostics только текущего файла

- Тип: Bug
- Статус: Выполнено
- Серьёзность: Средняя
- Приоритет: Высокий
- Воспроизводимость: Всегда
- Регрессия: Нет
- Модуль: MOD-SITE
- Сценарий: UC-DOCS-03
- Владелец: Команда Toudocu
- Стандарты: STD-GO-001, STD-DOCS-001
- Последнее обновление: 2026-08-09

## Симптом

CodeMirror подчёркивает в текущем файле diagnostics, принадлежащие другим
документам проекта.

## Ожидаемое поведение

Project diagnostics остаются в общем списке и доступны для перехода, но inline
markers получают только diagnostics текущего path.

## Фактическое поведение

Все diagnostics передаются в CodeMirror; их line/column ограничиваются
размером текущего документа и превращаются в ложные markers.

## Шаги воспроизведения

1. Открыть файл A при наличии diagnostic в файле B.
2. Дождаться validation.
3. Наблюдать marker B внутри A.

## Доказательства

Backend возвращает project-wide `model.Issues`, а `renderDiagnostics` передаёт
весь массив в `setDiagnostics` без path filter. Ранее корректное поведение не
подтверждено, поэтому regression отмечена как «Нет».

## Причина

Один массив используется одновременно как project navigation list и как
file-local CodeMirror lint source.

## Область изменения

- `web/src/features/editor/`;
- `web/tests/`;
- `internal/site/assets/generated/`;
- `docs/work/BUG-SITE-001.md`.

## Не входит в исправление

- скрытие diagnostics других файлов из общего списка;
- изменение backend diagnostic schema;
- редизайн Editor.

## План

1. Выделить тестируемый helper file-local diagnostics.
2. Фильтровать только CodeMirror input, сохраняя общий список.
3. Пересобрать tracked frontend assets.

## Критерии приёмки

- [x] `AC-01` Регрессионный frontend-тест оставляет в inline-наборе только
  diagnostics с точным path текущего файла; diagnostics без path не получают
  недоказанную файловую привязку.
- [x] `AC-02` Diagnostic другого path остаётся в списке, но не попадает в
  CodeMirror; wiring-тест фиксирует фильтр в `renderDiagnostics`.

## Проверка

- `AC-01` → `npm --prefix web test`
- `AC-02` → `npm --prefix web test`
- `ALL` → `npm --prefix web test && go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && npm --prefix web run typecheck && npm --prefix web run build && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

## Регрессионный тест

Node test компилирует TypeScript helper через закреплённый esbuild, проверяет
его результат на diagnostics двух paths и фиксирует wiring `renderDiagnostics`.

## Влияние на документацию

Изменяется только `docs/work/BUG-SITE-001.md`; Editor contract не меняется.
