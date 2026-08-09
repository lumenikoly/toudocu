# TASK-REVIEW-001: Локальное ревью и feedback для AI-агента

- Статус: Выполнено
- Тип: Feature
- Приоритет: Высокий
- Модуль: MOD-REVIEW
- Сценарий: UC-REVIEW-01
- Экраны: SC-CHANGES-WORKSPACE
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Toudocu
- Последнее обновление: 2026-08-09

## Результат

Canonical Changes workspace показывает repository-wide diff, позволяет
вести персистентные discussion threads и атомарно передавать новые
comments установленному AI-skill через schema-v1 CLI без запуска
агента или изменения Git.

## Изменение поведения

### Было

«Изменения» показывают только documentation roots и не хранят
комментарии. Связь между local review и AI-агентом отсутствует.

### Станет

Существующий экран получает repository review, anchors, обсуждения,
FIFO feedback handoff и agent responses; обычные `changes`, публичный
Go-фасад, static и translation runtimes сохраняют прежнюю
семантику.

## Область изменения

- `internal/app/`, `internal/site/`, `cmd/` и `api.go`;
- `web/` и generated frontend assets в `internal/site/assets/generated/`;
- `skills/toudocu/`;
- `docs/`, `README.md`, `CHANGELOG.md` и `THIRD_PARTY_NOTICES.md`;
- Go, frontend и browser tests.

## Не входит в задачу

- новые top-level Review, Feedback, Code и Files tabs;
- запуск агента, LLM/API или автоматическое исправление;
- Git write operations, remote review service и repository review files;
- изменение `ChangeSetReport` schema v1 и public `api.go`;
- review capability в static и translation runtimes;
- чтение или обновление translation roots.

## Критерии приёмки

- [x] `AC-01` Repository projection показывает tracked и untracked
  non-ignored files для arbitrary base/target, а write gate разрешает
  mutations только для working tree.
- [x] `AC-02` Schema-v1 store переживает restart/HEAD change,
  применяет interprocess lock, CAS, atomic replace, permissions и не
  перезаписывает corrupted state.
- [x] `AC-03` Diff, fileRange, file и global targets валидируют
  safe path и Unicode coordinates; Go извлекает selected text/context и
  сохраняет только commented snapshots до 2 MiB.
- [x] `AC-04` Discussions поддерживают create, reply, unsent
  edit/delete, resolve/reopen, cleanup и immutable sent messages.
- [x] `AC-05` Feedback batches неизменяемы, FIFO и pending повторяет
  oldest snapshot до полного atomic response с ровно одним result
  для каждого item.
- [x] `AC-06` Review HTTP API совпадает с OpenAPI, требует JSON,
  exact action и expected revision/digest и возвращает стабильные
  diagnostics/statuses.
- [x] `AC-07` CLI `changes feedback pending|respond` определяет
  repository от cwd или флага, возвращает schema-v1 empty envelope
  с exit 0 и валидирует response до mutation.
- [x] `AC-08` Anchors re-anchor по заданному детерминированному
  порядку или получают explicit stale/deleted placement.
- [x] `AC-09` Экран «Изменения» сохраняет прежние tabs,
  добавляет changed/linked files, доступные comment entry points,
  responsive discussions panel/drawers, watcher banner и focus flow.
- [x] `AC-10` Bundled skill обрабатывает `$toudocu feedback`,
  проверяет targets, изменяет только обоснованные места,
  запускает релевантные checks и отправляет full response.
- [x] `AC-11` Regression tests доказывают неизменность
  `ChangeSetReport`, ordinary `changes`, public Go facade, static manifest и
  translation behavior.

## План

- [x] Реализовать repository projection и review state services.
- [x] Добавить discussions, feedback/response, cleanup и re-anchoring.
- [x] Подключить CLI, canonical HTTP capability и OpenAPI.
- [x] Расширить Changes UI и CodeMirror languages из `web/`.
- [x] Обновить skill и canonical documentation без translation roots.
- [x] Выполнить semantic, structural, Go, browser и cross-build gates.

## Проверка

- `AC-01` → `go test ./internal/app -run 'TestRepositoryReview'`
- `AC-02` → `go test ./internal/app -run 'TestReview(Store|CAS|Conflict|Cleanup)'`
- `AC-03` → `go test ./internal/app -run 'TestReview(Unsafe|StoreDiscussion)'`
- `AC-04` → `go test ./internal/app -run 'TestReview(StoreDiscussion|Cleanup)'`
- `AC-05` → `go test ./internal/app -run 'TestReviewStoreDiscussionFeedbackResponseAndReanchor'`
- `AC-06` → `go test ./internal/app -run 'TestReviewHTTPAndCLI|TestOpenAPIContract'`
- `AC-07` → `go test ./internal/app -run 'TestReviewHTTPAndCLI'`
- `AC-08` → `go test ./internal/app -run 'TestReviewStoreDiscussionFeedbackResponseAndReanchor'`
- `AC-09` → `npm --prefix web test && make browser-test`
- `AC-10` → `go test ./internal/app -run 'TestToudocuFeedbackContract'`
- `AC-11` → `go test ./internal/app -run 'TestStaticSiteExcludesChanges|TestTranslation|TestChangesCLI'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

## Влияние на документацию

Добавляются MOD-REVIEW, UC-REVIEW-01, FLOW-REVIEW-FEEDBACK,
architecture/review-anchoring.md, ADR-007 и review OpenAPI contract.
Обновляются `SC-CHANGES-WORKSPACE`, architecture overview/boundaries,
Changes/CLI contracts, API/features references, agent/frontend guides,
roadmap, root changelog и third-party notices. Generated frontend assets получаются
только из `web/`; translation roots не читаются и не меняются.
