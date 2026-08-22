<!-- toudocu
id: BUG-CHANGES-003
status: done
taskType: bug
severity: medium
priority: high
reproducibility: always
regression: false
module: MOD-CHANGES
useCase: UC-DOCS-05
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-11
-->

# BUG-CHANGES-003: Выбирать задачу в Changes по точному идентификатору

<!-- toudocu:section symptom -->
## Симптом

`task changes` зависел от имени файла задачи и мог спутать два
идентификатора с общим префиксом.

<!-- toudocu:section expected-behavior -->
## Ожидаемое поведение

Рабочая задача определяется по точному стабильному идентификатору из H1 в
выбранном снимке Git. Имя файла на её идентичность не влияет.

<!-- toudocu:section actual-behavior -->
## Фактическое поведение

Задача в файле без идентификатора в имени не находилась. Кроме того,
`TASK-X-0010` ошибочно считался файлом задачи `TASK-X-001`.

<!-- toudocu:section steps-to-reproduce -->
## Шаги воспроизведения

1. Создать корректную задачу в файле `custom-name.md`.
2. Добавить рядом задачу с более длинным идентификатором того же префикса.
3. Вызвать `task changes` для первого идентификатора и проверить выбранную
   задачу и набор изменений.

<!-- toudocu:section evidence -->
## Доказательства

Функции `taskDocumentContent`, `buildTaskImpact` и `changeRelatedToTask`
искали идентификатор через `strings.Contains` в имени файла, а не разбирали H1.
Подтверждений прежней правильной работы нет, поэтому ошибка не считается
регрессией.

<!-- toudocu:section cause -->
## Причина

Changes повторно выводил идентичность задачи из имени файла вместо точного
идентификатора в документе выбранного снимка.

<!-- toudocu:section scope -->
## Область изменения

- `internal/app/changes_git.go`;
- `internal/app/changes_build.go`;
- `internal/app/changes_report.go`;
- `internal/app/changes_types.go`;
- `internal/app/changes_test.go`;
- `docs/work/BUG-CHANGES-003.md`.

<!-- toudocu:section out-of-scope -->
## Не входит в исправление

- переименование существующих рабочих задач;
- изменение их стабильных идентификаторов;
- построение полной `ProjectModel` для обеих сторон сравнения Git.

<!-- toudocu:section plan -->
## План

1. Разобрать H1 всех задач в снимке и найти точное совпадение идентификатора.
2. Сохранить путь выбранной задачи во внутреннем контексте изменений.
3. Использовать точный путь при расчёте влияния и фильтрации изменений.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Регрессионный тест выбирает задачу по точному H1-идентификатору при
  произвольном имени файла.
- [x] `AC-02` Задача с более длинным идентификатором не попадает в
  `TaskChanges` выбранной задачи.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `go test ./internal/app -run TestTaskChangesSelectsExactTaskIDFromHeading`
- `AC-02` → `go test ./internal/app -run TestTaskChangesSelectsExactTaskIDFromHeading`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section regression-test -->
## Регрессионный тест

Временный Git-репозиторий содержит файл без идентификатора в имени и соседнюю
задачу с более длинным идентификатором того же префикса.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Меняется только эта историческая запись. Правило стабильного идентификатора
уже описано в документации рабочих задач.
