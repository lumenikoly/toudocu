# TASK-CLI-002: Добавить иерархическую декомпозицию рабочих задач

- Статус: Выполнено
- Тип: Feature
- Приоритет: Высокий
- Модуль: MOD-CLI
- Сценарий: UC-TASK-01
- Процесс: FLOW-TASK-WORKFLOW
- Стандарты: STD-GO-001, STD-DOCS-001
- Последнее обновление: 2026-08-21

## Результат

Toudocu представляет большую работу как проверяемое дерево `TASK-*`, сохраняя
отдельный граф зависимостей, ограниченный контекст каждой задачи и прежнее
поведение существующих проектов без декомпозиции.

## Изменение поведения

### Было

Рабочая задача могла ссылаться только на зависимости. Общую задачу и её
самостоятельные части нельзя было связать отдельным отношением, увидеть как
дерево или проверить одним агрегированным отчётом об изменениях.

### Станет

Дочерняя `TASK-*` может объявить одного родителя через `Parent` или
`Родительская задача`. Go-модель вычисляет детей, проверяет иерархию и общий
граф завершения, применяет дополнительные lifecycle-правила и передаёт
командам и порталу ограниченные данные о декомпозиции. Отношение родителя не
задаёт порядок выполнения и не заменяет `Dependencies`.

## Область изменения

- публичные модели и фасад в `api.go`;
- parsing, validation, lifecycle, task context, task tree, task init и task
  changes в `internal/app/`;
- локализованные подписи портала в `internal/site/i18n/`;
- канонические контракты, руководства, модель, процесс и справочники в `docs/`;
- guidance для агента в `skills/toudocu/`;
- поведенческие и регрессионные тесты Go.

## Не входит в задачу

- декомпозиция `BUG-*` и отношение Parent с участием `BUG-*`;
- Epic, Sprint, Milestone, исполнители, оценки, story points и kanban;
- автоматическое смысловое разбиение запроса или изменение статусов;
- рекурсивный запуск `task verify --run` и любые новые неявные пути выполнения
  команд;
- отдельная база задач и синхронизация с внешними issue trackers.

## Критерии приёмки

- [x] `AC-01` `TASK-*` принимает необязательное единственное поле `Parent` или
  `Родительская задача` и нормализует его в `parentId`.
- [x] `AC-02` Модель вычисляет `childIds` только по Parent дочерних задач и не
  требует исходного поля Children.
- [x] `AC-03` Проверка выдаёт стабильные diagnostics для неверного,
  неизвестного и self-referencing Parent, неподдерживаемого типа и циклов
  иерархии.
- [x] `AC-04` Parent обозначает декомпозицию, а Dependencies — порядок
  завершения; ни одна связь не выводится из другой.
- [x] `AC-05` Общий completion graph обнаруживает deadlock из сочетания Parent
  и Dependencies.
- [x] `AC-06` Done parent допускается только со всеми непосредственными Done
  children; Cancelled child не считается выполненным, а Cancelled parent не
  оставляет активных детей.
- [x] `AC-07` JSON- и text-контекст содержат компактные ссылки на предков и
  непосредственных детей со статусами, blocker presence и сводкой потомков,
  но не полные документы поддерева.
- [x] `AC-08` Read-only команда `task tree` возвращает вложенное дерево в text
  и `TaskTreeReport` версии 1 в JSON, не обращается к Git и не запускает команд.
- [x] `AC-09` `task init --parent` проверяет TASK-ID и создаёт Draft с Parent,
  не перезаписывая файл и не создавая зависимости или детей.
- [x] `AC-10` `task changes --tree` доступен только для `TASK-*`, агрегирует
  всех потомков, сохраняет `declaredBy` и отделяет task artifacts; обычный
  `task changes` сохраняет прежнюю изоляцию выбранного work item.
- [x] `AC-11` `task verify` выполняет только проверки выбранной задачи и не
  запускает verification детей.
- [x] `AC-12` `ProjectReport` версии 1 аддитивно возвращает `parentId` и
  вычисленный `childIds`, включая `null` для root и пустой список для leaf.
- [x] `AC-13` Статический портал и `serve` из общей Go-модели показывают
  кликабельные parent, children и breadcrumb вложенной задачи.
- [x] `AC-14` Parent и children разрешаются через активный и архивный
  `work/**`; перенос одной задачи не переносит поддерево.
- [x] `AC-15` Репозитории без Parent и существующая семантика Dependencies,
  lifecycle, archive, restore, verify и обычного changes работают без миграции.
- [x] `AC-16` Новые правила и CLI-форматы покрыты поведенческими тестами,
  включая глубокие деревья, siblings, междеревные зависимости, lifecycle,
  архив, bounded context, Changes и оба варианта портала.
- [x] `AC-17` `task tree`, `task context`, `task ready` и `task changes --tree`
  не создают путей неявного выполнения shell-команд.
- [x] `AC-18` Встроенный skill предлагает декомпозицию по самостоятельно
  проверяемым результатам, а parent использует как координирующий контракт без
  механического разбиения на код, тесты и документацию.

## План

- [x] Добавить Parent в parsing и публичную модель, вычислить children.
- [x] Реализовать validation и lifecycle дерева и общего completion graph.
- [x] Добавить task init, task tree и ограниченную hierarchy в task context.
- [x] Добавить агрегированный task changes и сохранить обычное поведение.
- [x] Показать декомпозицию в статическом портале и `serve`.
- [x] Синхронизировать каноническую документацию и встроенный skill.
- [x] Ограничить `task changes --tree` только деревьями `TASK-*`.
- [x] Дополнить text-контекст всеми компактными hierarchy-полями.
- [x] Исправить опциональную ветку task tree в workflow и закрыть регрессии.
- [x] Выполнить полный цикл проверки.
- [x] Получить независимый semantic review задачи и итогового diff.

## Проверка

- `AC-01` → `go test ./internal/app -run 'TestTaskHierarchyBuildsComputedChildrenAndCompatibleJSON|TestTaskHierarchyDiagnostics'`
- `AC-02` → `go test ./internal/app -run TestTaskHierarchyBuildsComputedChildrenAndCompatibleJSON`
- `AC-03` → `go test ./internal/app -run TestTaskHierarchyDiagnostics`
- `AC-04` → `go test ./internal/app -run TestTaskHierarchyAllowsDependencyAcrossTrees`
- `AC-05` → `go test ./internal/app -run TestTaskHierarchyDiagnostics`
- `AC-06` → `go test ./internal/app -run TestTaskHierarchyLifecycle`
- `AC-07` → `go test ./internal/app -run 'TestTaskTreeContextAndPortalUseSharedHierarchy|TestTaskContextTextHierarchy'`
- `AC-08` → `go test ./internal/app -run TestTaskTreeContextAndPortalUseSharedHierarchy`
- `AC-09` → `go test ./internal/app -run TestTaskInitWithParent`
- `AC-10` → `go test ./internal/app -run 'TestTaskChangesTreeAggregatesDescendantsAndOwnership|TestTaskChangesTreeRejectsBugs|TestTaskChangesIgnoresUnrelatedDuplicateTaskIDs'`
- `AC-11` → `go test ./internal/app -run TestTaskVerifyDoesNotRunChildCommands`
- `AC-12` → `go test ./internal/app -run TestTaskHierarchyBuildsComputedChildrenAndCompatibleJSON`
- `AC-13` → `go test ./internal/app -run TestTaskTreeContextAndPortalUseSharedHierarchy`
- `AC-14` → `go test ./internal/app -run TestTaskHierarchyIncludesArchivedDoneChild`
- `AC-15` → `go test ./...`
- `AC-16` → `go test ./... && go test -race ./...`
- `AC-17` → `go test ./internal/app -run 'TestTaskVerifyDoesNotRunChildCommands|TestTaskTreeContextAndPortalUseSharedHierarchy'`
- `AC-18` → `go test ./skills`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

## Влияние на документацию

- `docs/contracts/cli.md` — команды, параметры и JSON-отчёты;
- `docs/flows/FLOW-TASK-WORKFLOW.md` — подготовка, просмотр и выполнение задачи;
- `docs/guides/work-items.md` — Parent, Dependencies и рекомендации по
  декомпозиции;
- `docs/modules/cli.md` — границы task-команд;
- `docs/modules/model.md` — иерархия и completion graph в Go-модели;
- `docs/reference/changes-report.md` — агрегированный impact и ownership;
- `docs/reference/document-model.md` — нормализованные поля work item;
- `docs/reference/features.md` — доступные команды;
- `docs/use-cases/task-workflow.md` — ограниченный контекст и обзор дерева.
