# TASK-CHANGES-001: Просмотр изменений документации

- Статус: Выполнено
- Тип: Feature
- Приоритет: Высокий
- Модуль: MOD-CHANGES
- Сценарий: UC-DOCS-05
- Процесс: FLOW-DOCS-CHANGES
- Переходы: TR-SITE-005
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Docu-docu
- Последнее обновление: 2026-08-05

## Результат

`docu-docu changes` и раздел `/changes` показывают Git-изменения исходной
документации как source, rendered и deterministic semantic diff, сопоставляют
их с task impact и экспортируют `ChangeSetReport` schema v1.

## Изменение поведения

### Было

Портал показывает только текущее состояние, а review использует внешний
`git diff` без проектной семантики и task impact.

### Станет

`serve` предоставляет read-only Changes workspace с явным диапазоном,
ленивыми специализированными представлениями и live invalidation. CLI и CI
получают тот же отчёт без изменения Git.

## Область изменения

- публичный фасад `api.go` и `internal/app/cli.go`, `internal/app/types.go`, `internal/app/site_config.go`;
- `internal/app/server.go`, `internal/app/site.go`, `internal/app/screen_site.go`;
- `internal/app/assets/`, `package.json`, `package-lock.json`;
- `go.mod`, `go.sum`, `THIRD_PARTY_NOTICES.md`;
- тесты в `internal/app/`;
- `docs/`, `README.md`, `CHANGELOG.md`;
- `project-docs/`, `example/project-docs/` только через пересборку.

## Не входит в задачу

- изменение Git index, history, refs или working tree;
- fetch, checkout, commit, merge, rebase и GitHub PR API;
- inline review comments, approvals и conflict editor;
- AI-generated summaries и исправление документации;
- pixel diff Mermaid или изображений;
- Git diff исходного кода вне documentation roots.

## Критерии приёмки

- [x] `AC-01` Git adapter поддерживает commit, index и working-tree snapshots,
  staged/unstaged/untracked, rename/copy/type change и Unicode paths без shell,
  external diff, textconv, hooks или fetch.
- [x] `AC-02` `ChangeSetReport` schema v1 содержит явный resolved comparison,
  digest, file/entity summaries, changes, task impact и diagnostics.
- [x] `AC-03` Unified diff точно получен от Git, side-by-side выводится из hunks,
  а большие или binary файлы не блокируют change set.
- [x] `AC-04` Deterministic semantic diff поддерживает UC, FLOW, SC/TR, MOD,
  ADR, TASK, Architecture и relations, игнорируя незначащее форматирование.
- [x] `AC-05` OpenAPI YAML/JSON diff сравнивает operations, requests, responses,
  schemas и security и классифицирует compatibility.
- [x] `AC-06` Rendered Markdown, Mermaid, Screen Map и image assets доступны до
  и после с изоляцией ошибки одной стороны.
- [x] `AC-07` Task impact отделяет task contract от permanent documentation и
  выдаёт declared/actual/scope diagnostics.
- [x] `AC-08` CLI поддерживает summary, file и task reports, filters,
  text/JSON/Markdown/output и exit codes 0–4.
- [x] `AC-09` Read-only HTTP API проверяет revisions/paths/limits, поддерживает
  lazy detail, ETag и live digest update.
- [x] `AC-10` Changes UI поддерживает comparison selector, filters/search,
  unified/merge/rendered/semantic/specialized tabs, deep links и accessibility.
- [x] `AC-11` `serve` сохраняет filters/open file при invalidation, а отсутствие
  Git показывает diagnostic и не ломает остальной портал.
- [x] `AC-12` Static `build`, существующий `check`, ProjectReport schema v1 и
  editor workflows сохраняют совместимость и проходят regression tests.

## План

- [x] Реализовать Git snapshots, comparison model и ChangeSetReport.
- [x] Добавить source, semantic, OpenAPI, task и specialized diff engines.
- [x] Добавить CLI reports и exit-code mapping.
- [x] Реализовать changes service, HTTP API, cache и invalidation.
- [x] Реализовать Changes UI и интеграцию с document/task/screen pages.
- [x] Обновить документацию, generated portals и выполнить все gates.

## Проверка

- `AC-10` → `TR-SITE-005` → `TestServeSiteIncludesEditor`
- `AC-01` → `go test ./... -run 'TestGitChange|TestChangeComparison'`
- `AC-02` → `go test ./... -run 'TestChangeSetReport|TestChangeSetDigest'`
- `AC-03` → `go test ./... -run 'TestSourceDiff|TestSideBySideDiff|TestLargeChange'`
- `AC-04` → `go test ./... -run 'TestSemanticDiff'`
- `AC-05` → `go test ./... -run 'TestOpenAPIDiff'`
- `AC-06` → `go test ./... -run 'TestRenderedChange|TestMermaidChange|TestAssetChange|TestScreenMapChange'`
- `AC-07` → `go test ./... -run 'TestTaskImpact'`
- `AC-08` → `go test ./... -run 'TestChangesCLI'`
- `AC-09` → `go test ./... -run 'TestChangesHTTP'`
- `AC-10` → `go test ./... -run 'TestChangesAssetsContract'`
- `AC-11` → `go test ./... -run 'TestChangesInvalidation|TestChangesWithoutGit'`
- `AC-12` → `go test ./... -run 'TestStaticSiteExcludesChanges|TestProjectReport'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root .`
- `QUALITY` → `go vet ./... && go test ./... && go test -race ./... && go run ./cmd/docu-docu check ./docs --strict --stale-days 0`

## Влияние на документацию

Добавляются module/use case/flow, architecture answer, YAML ADR, changes guide,
HTTP/JSON contracts и diagnostics reference. Обновляются CLI, serve, task,
OpenAPI, Screen Map, configuration, security, README и changelog.

- `docs/modules/MOD-CHANGES.md`;
- `docs/use-cases/UC-DOCS-05.md`;
- `docs/flows/FLOW-DOCS-CHANGES.md`;
- `docs/architecture/documentation-changes.md`;
- `docs/architecture/overview.md`;
- `docs/architecture/runtime-components.md`;
- `docs/architecture/trust-boundaries.md`;
- `docs/decisions/ADR-003.md`;
- `docs/decisions/001-dependency-free.md`;
- `docs/contracts/cli.md`;
- `docs/contracts/changes-http.md`;
- `docs/guides/documentation-changes.md`;
- `docs/guides/work-items.md`;
- `docs/guides/screens.md`;
- `docs/reference/changes-report.md`;
- `docs/reference/configuration.md`;
- `docs/reference/features.md`;
- `README.md`;
- `CHANGELOG.md`.
