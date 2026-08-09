# BUG-SITE-002: Игнорировать устаревшие ответы Editor

- Тип: Bug
- Статус: Выполнено
- Серьёзность: Средняя
- Приоритет: Высокий
- Воспроизводимость: Часто
- Регрессия: Нет
- Модуль: MOD-SITE
- Сценарий: UC-DOCS-03
- Владелец: Команда Docu-docu
- Стандарты: STD-GO-001, STD-DOCS-001
- Последнее обновление: 2026-08-09

## Симптом

Поздний validation или preview response файла A заменяет diagnostics или
preview уже открытого файла B.

## Ожидаемое поведение

Editor применяет ответ только когда path и поколение запроса всё ещё актуальны.

## Фактическое поведение

После `await` frontend не сверяет response с текущим файлом или более новым
запросом.

## Шаги воспроизведения

1. Запустить validation или preview файла A.
2. До ответа открыть файл B либо отправить более новый запрос.
3. Дождаться старого ответа и наблюдать состояние A в workspace B.

## Доказательства

`validateCurrent` и `updatePreview` непосредственно применяют data после
`await`; request token или path gate отсутствуют. Репозиторий не подтверждает
ранее работавшее ordering, поэтому regression отмечена как «Нет».

## Причина

Frontend не инвалидирует поколения validation/preview при переключении файла и
не сравнивает завершившийся request с последним request того же вида.

## Область изменения

- `web/src/features/editor/`;
- `web/tests/`;
- `internal/site/assets/generated/`;
- `docs/work/BUG-SITE-002.md`.

## Не входит в исправление

- изменение Editor HTTP API;
- отмена server-side model build;
- изменение save conflict workflow.

## План

1. Ввести отдельные поколения validation и preview.
2. Инвалидировать их при применении другого файла.
3. Проверять path и поколение до изменения UI.

## Критерии приёмки

- [x] `AC-01` Регрессионный frontend-тест отклоняет ответ старого path.
- [x] `AC-02` Более старое поколение одного path не может заменить новое.
- [x] `AC-03` Wiring-тест фиксирует gates в success/error ветках validation и
  preview, а также инвалидацию поколений при `applyFile`.

## Проверка

- `AC-01` → `npm --prefix web test`
- `AC-02` → `npm --prefix web test`
- `AC-03` → `npm --prefix web test`
- `ALL` → `npm --prefix web test && go test ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && npm --prefix web run typecheck && npm --prefix web run build && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/docu-docu || exit 1; done`

## Регрессионный тест

Node test компилирует TypeScript helper, проверяет path mismatch, stale
generation и актуальный response, затем фиксирует wiring обоих Editor workflow.

## Влияние на документацию

Изменяется только `docs/work/BUG-SITE-002.md`; документированная синхронность
Editor для текущего workspace сохраняется.
