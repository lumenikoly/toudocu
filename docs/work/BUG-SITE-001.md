<!-- toudocu
version: 1
id: BUG-SITE-001
status: done
taskType: bug
severity: medium
priority: high
reproducibility: always
regression: false
module: MOD-SITE
useCase: UC-DOCS-03
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-11
-->

# BUG-SITE-001: Подчёркивать ошибки только в текущем файле

<!-- toudocu:section symptom -->
## Симптом

CodeMirror подчёркивал в открытом файле диагностические сообщения, которые
относятся к другим документам проекта.

<!-- toudocu:section expected-behavior -->
## Ожидаемое поведение

Общий список показывает сообщения по всему проекту и позволяет перейти к
нужному файлу. Подчёркивания внутри редактора получают только сообщения с
точным путём текущего файла.

<!-- toudocu:section actual-behavior -->
## Фактическое поведение

В CodeMirror передавался весь список. Номера строк и столбцов других файлов
ограничивались размером открытого документа и превращались в ложные
подчёркивания.

<!-- toudocu:section steps-to-reproduce -->
## Шаги воспроизведения

1. Открыть файл A, когда в файле B есть диагностическое сообщение.
2. Дождаться проверки документации.
3. Увидеть сообщение файла B внутри файла A.

<!-- toudocu:section evidence -->
## Доказательства

Сервер возвращал общий список `model.Issues`, а `renderDiagnostics` передавал
его в `setDiagnostics` без фильтра по пути. Подтверждений прежней правильной
работы нет, поэтому ошибка не считается регрессией.

<!-- toudocu:section cause -->
## Причина

Один массив использовался и как список сообщений по проекту, и как локальный
источник подчёркиваний CodeMirror.

<!-- toudocu:section scope -->
## Область изменения

- `web/src/features/editor/`;
- `web/tests/`;
- `internal/site/assets/generated/`;
- `docs/work/BUG-SITE-001.md`.

<!-- toudocu:section out-of-scope -->
## Не входит в исправление

- скрытие сообщений других файлов из общего списка;
- изменение схемы диагностических сообщений сервера;
- изменение дизайна редактора.

<!-- toudocu:section plan -->
## План

1. Выделить небольшую проверяемую функцию отбора сообщений текущего файла.
2. Фильтровать только данные для CodeMirror, сохранив общий список.
3. Пересобрать отслеживаемые браузерные ресурсы.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Регрессионный браузерный тест оставляет для подчёркивания только сообщения с
  точным путём текущего файла. Сообщение без пути не получает выдуманную
  привязку.
- [x] `AC-02` Сообщение другого файла остаётся в списке, но не попадает в
  CodeMirror; тест подключения фиксирует фильтр в `renderDiagnostics`.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `npm --prefix web test`
- `AC-02` → `npm --prefix web test`
- `ALL` → `npm --prefix web test && go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && npm --prefix web run typecheck && npm --prefix web run build && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section regression-test -->
## Регрессионный тест

Node-тест собирает вспомогательную TypeScript-функцию закреплённым esbuild,
передаёт ей сообщения двух файлов и проверяет вызов фильтра из
`renderDiagnostics`.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Меняется только эта историческая запись. Контракт редактора не изменился.
