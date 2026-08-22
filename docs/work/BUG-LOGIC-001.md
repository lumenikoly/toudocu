<!-- toudocu
id: BUG-LOGIC-001
status: done
taskType: bug
severity: high
priority: high
reproducibility: always
regression: false
module: MOD-CLI
useCase: UC-TASK-02
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-11
-->

# BUG-LOGIC-001: Применять к Bug собственные правила готовности

<!-- toudocu:section symptom -->
## Симптом

Корректно оформленную ошибку со статусом готовности нельзя было провести через
`task ready` или `task verify`.

<!-- toudocu:section expected-behavior -->
## Ожидаемое поведение

Документ `BUG-*`, который принимает проектная модель, должен проходить и
локальную проверку готовности задачи. Для технической ошибки допустимо
`Сценарий: Не применяется`, если документ содержит требуемое объяснение.

<!-- toudocu:section actual-behavior -->
## Фактическое поведение

Ошибка получала сообщения `missing-task-result` и
`missing-behavior-change`, хотя эти разделы относятся к Feature. Техническая
ошибка дополнительно получала `missing-task-use-case`.

<!-- toudocu:section steps-to-reproduce -->
## Шаги воспроизведения

1. Построить модель из полного документа Bug без разделов Feature.
2. Вызвать для его идентификатора `task ready` или `task verify --dry-run`.
3. Получить блокирующие сообщения о разделах Feature.

<!-- toudocu:section evidence -->
## Доказательства

Изолированный Go-сценарий вернул `contract_incomplete` с
`missing-task-result,missing-behavior-change` для документа, который основной
валидатор принимает без ошибок. Подтверждений прежней правильной работы нет,
поэтому дефект не считается регрессией.

<!-- toudocu:section cause -->
## Причина

`taskReadiness` безусловно требовал `Result`, `BehaviorChange`, `Before` и
`After` у всех рабочих элементов, включая Bug. Допустимое отсутствие
пользовательского сценария тоже не сохранялось в `WorkItem`.

<!-- toudocu:section scope -->
## Область изменения

- `internal/app/task_ready.go`;
- `internal/app/knowledge.go`;
- `internal/app/types.go`;
- `internal/app/bug_test.go`;
- `docs/work/BUG-LOGIC-001.md`.

<!-- toudocu:section out-of-scope -->
## Не входит в исправление

- изменение самого контракта Bug;
- изменение статусов или команд работы с задачами;
- исправление других типов рабочих элементов.

<!-- toudocu:section plan -->
## План

1. Сохранить в `WorkItem` признак допустимого отсутствия сценария.
2. Разделить общие требования и требования, относящиеся только к Feature или
   Bug.
3. Добавить регрессионные сценарии для обычной и технической ошибки.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Регрессионные тесты подтверждают, что корректные обычная и
  техническая ошибки проходят `task ready`.
- [x] `AC-02` `task verify --dry-run` строит план проверки Bug без сообщений о
  полях Feature и не выполняет команды.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `go test ./internal/app -run 'TestBugWorkItemValidationAndPortalFilters|TestTechnicalBugMayExplainMissingUseCase'`
- `AC-02` → `go test ./internal/app -run 'TestBugWorkItemValidationAndPortalFilters'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section regression-test -->
## Регрессионный тест

Обычная и техническая ошибки проходят через публичные отчёты готовности и
`dry-run`, а не только через внутренний разборщик.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Меняется только эта историческая запись: исправление восстанавливает уже
описанный специальный контракт Bug.
