<!-- toudocu
id: BUG-SITE-002
status: done
taskType: bug
severity: medium
priority: high
reproducibility: often
regression: false
module: MOD-SITE
useCase: UC-DOCS-03
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-11
-->

# BUG-SITE-002: Игнорировать устаревшие ответы редактора

<!-- toudocu:section symptom -->
## Симптом

Запоздавший ответ проверки или предпросмотра файла A мог заменить сообщения
или предпросмотр уже открытого файла B.

<!-- toudocu:section expected-behavior -->
## Ожидаемое поведение

Редактор применяет ответ, только если путь и порядковый номер запроса всё ещё
совпадают с текущим состоянием.

<!-- toudocu:section actual-behavior -->
## Фактическое поведение

После `await` браузерный код не сверял ответ с открытым файлом и не проверял,
не завершился ли более новый запрос.

<!-- toudocu:section steps-to-reproduce -->
## Шаги воспроизведения

1. Запустить проверку или предпросмотр файла A.
2. До ответа открыть файл B либо отправить более новый запрос для A.
3. Дождаться первого ответа и увидеть состояние A в рабочей области B либо
   старый результат поверх нового.

<!-- toudocu:section evidence -->
## Доказательства

`validateCurrent` и `updatePreview` сразу применяли данные после `await`.
Маркера запроса и проверки пути не было. Репозиторий не подтверждает, что
правильный порядок раньше обеспечивался, поэтому ошибка не считается
регрессией.

<!-- toudocu:section cause -->
## Причина

При переключении файла браузерный код не делал прежние поколения запросов
недействительными и не сравнивал завершившийся запрос с последним запросом
того же вида.

<!-- toudocu:section scope -->
## Область изменения

- `web/src/features/editor/`;
- `web/tests/`;
- `internal/site/assets/generated/`;
- `docs/work/BUG-SITE-002.md`.

<!-- toudocu:section out-of-scope -->
## Не входит в исправление

- изменение HTTP API редактора;
- отмена построения модели на сервере;
- изменение разрешения конфликтов при сохранении.

<!-- toudocu:section plan -->
## План

1. Вести отдельные поколения запросов проверки и предпросмотра.
2. Делать прежние поколения недействительными при открытии другого файла.
3. Перед изменением интерфейса проверять путь и поколение ответа.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Регрессионный браузерный тест отклоняет ответ для прежнего пути.
- [x] `AC-02` Старое поколение запроса одного файла не заменяет новое.
- [x] `AC-03` Тест подключения проверяет защиту в успешной и ошибочной ветках
  проверки и предпросмотра, а также сброс поколений в `applyFile`.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `npm --prefix web test`
- `AC-02` → `npm --prefix web test`
- `AC-03` → `npm --prefix web test`
- `ALL` → `npm --prefix web test && go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && npm --prefix web run typecheck && npm --prefix web run build && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section regression-test -->
## Регрессионный тест

Node-тест собирает вспомогательную TypeScript-функцию, проверяет другой путь,
устаревшее поколение и актуальный ответ, а затем подтверждает её использование
в обеих операциях редактора.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Меняется только эта историческая запись. Обещанное поведение редактора для
текущего файла остаётся прежним.
