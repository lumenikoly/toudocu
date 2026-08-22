<!-- toudocu
id: TASK-CLI-001
status: done
taskType: feature
priority: high
module: MOD-CLI
useCase: UC-TASK-03
flow: FLOW-TASK-WORKFLOW
updated: 2026-08-10
-->

# TASK-CLI-001: Реализовать полный путь работы с задачей

<!-- toudocu:section result -->
## Результат

CLI проводит пользователя от поиска нужной документации и создания каркаса до
проверки готовности, получения контекста и явного запуска команд выбранной
задачи.

<!-- toudocu:section behavior-change -->
## Изменение поведения

<!-- toudocu:section before -->
### Было

CLI предоставлял только `task context` и выполняющую команды операцию
`task check`. Создать каркас, проверить готовность и искать по исходному тексту
было нельзя.

<!-- toudocu:section after -->
### Станет

CLI предоставляет `search`, `task init`, `scaffold`, `task ready`, расширенный
`task context` и `task verify`. Старая команда `task check` больше не
принимается.

<!-- toudocu:section scope -->
## Область изменения

- разбор CLI в `internal/app/cli.go`;
- типы отчётов и рабочей задачи;
- поиск, создание каркасов, контекст, готовность и проверка в `internal/app/`;
- документация в `docs/`;
- встроенный skill в `skills/toudocu/`.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

- понимание запроса на естественном языке самим Toudocu;
- автоматический выбор или заполнение сущностей;
- автоматическое изменение статуса задачи и отметок критериев;
- новые внешние зависимости.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Новые формы CLI разбираются однозначно, а `task check`
  отклоняется.
- [x] `AC-02` `search`, `task init` и `scaffold` соблюдают порядок результатов,
  пути на основе идентификаторов и атомарное создание.
- [x] `AC-03` `task ready` и `task context` возвращают полный локальный
  контракт, не меняя файлы и не выполняя команды.
- [x] `AC-04` `task verify` умеет показать план, запустить выбранную проверку
  или весь список и ограничивает сохранённый вывод.
- [x] `AC-05` Все публичные JSON-отчёты используют schema v1.

<!-- toudocu:section plan -->
## План

- [x] Расширить разбор аргументов, типы отчётов и контракт задачи.
- [x] Добавить поиск, создание каркасов и проверку готовности.
- [x] Расширить контекст и заменить `task check` на `task verify`.
- [x] Синхронизировать документацию, skill и тесты.
- [x] Выполнить полный цикл проверки задачи.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `go test ./... -run 'TestCLI|TestTask'`
- `AC-02` → `go test ./... -run 'TestSearch|TestInit|TestScaffold'`
- `AC-03` → `go test ./... -run 'TestTaskReady|TestTaskContext'`
- `AC-04` → `go test ./... -run 'TestTaskVerify|TestCommandProcess'`
- `AC-05` → `go test ./... -run 'TestGenerateSite|TestProjectReport'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Были обновлены `README.md`, `CHANGELOG.md`, CLI-контракт, дорожная карта,
пользовательские сценарии, `FLOW-TASK-WORKFLOW`, `ADR-002` и встроенный skill.
