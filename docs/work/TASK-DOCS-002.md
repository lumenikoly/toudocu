# TASK-DOCS-002: Добавить расширяемые Quality, Runbooks и Custom-разделы

- Статус: Выполнено
- Тип: Feature
- Приоритет: Высокий
- Модуль: MOD-MODEL
- Сценарий: UC-DOCS-02
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Docu-docu
- Последнее обновление: 2026-07-31

## Результат

Docu-docu поддерживает опциональные стандарты `STD-*`, эксплуатационные
процедуры `RB-*`, пользовательские верхнеуровневые разделы, их task-связи,
schema-v1 коллекции, scaffolds и автономные каталоги портала.

## Изменение поведения

### Было

Неизвестные каталоги оставались полностью free-form, а Quality и Runbooks не
имели типизированных контрактов, task-связей и специализированного портала.

### Станет

Появившиеся `quality/`, `runbooks/` и custom-разделы получают явные manifest и
typed validation без новых глобально обязательных файлов; task workflow
переносит только явно связанные `STD-*` и `RB-*`.

## Область изменения

- `internal/app/docs_core.go`;
- `quality.go`;
- `internal/app/knowledge.go`;
- `internal/app/types.go`;
- `report_types.go`;
- `internal/app/markdown_parse.go`;
- `internal/app/scaffold.go`;
- `internal/app/task_context.go`;
- `internal/app/task_ready.go`;
- `internal/app/task_verify.go`;
- `internal/app/site.go`;
- `quality_test.go`;
- `skills/docu-docu/`;
- `docs/`;
- `AGENTS.md`.

## Не входит в задачу

- внешние зависимости;
- автоматическое сопоставление task scope с glob-областью стандарта;
- выполнение команд напрямую из стандарта;
- создание собственного runbook без реальной эксплуатационной процедуры;
- изменение версии schema v1 или генератора.

## Критерии приёмки

- [x] `AC-01` Standards, runbooks и custom manifests валидируются с разделением errors и warnings.
- [x] `AC-02` Freshness учитывает границы `--stale-days`, включая отключение age-based overdue значением `0`.
- [x] `AC-03` Task references, conditional `QUALITY`, context и additive JSON сохраняют пустые коллекции как `[]`.
- [x] `AC-04` RU/EN scaffolds создаются атомарно и не изобретают владельца или дату проверки runbook.
- [x] `AC-05` Автономный портал сохраняет `processes` и добавляет каталоги, фильтры и четыре runbook-метрики.
- [x] `AC-06` Self-documentation содержит только подтверждённые стандарты и не создаёт фиктивный runbook.

## План

- [x] Добавить typed model, diagnostics, freshness и custom manifests.
- [x] Расширить task workflow, schema v1 и scaffolds.
- [x] Добавить специализированные каталоги и тесты портала.
- [x] Обновить self-documentation и пройти semantic review.
- [x] Выполнить полный Go-цикл, strict-check и безопасную пересборку портала.

## Проверка

- `AC-01` → `go test ./... -run 'TestQualityMetadataStatusAliasesAndValidationBoundaries|TestTypedKnowledgeErrorsAndCustomManifest'`
- `AC-02` → `go test ./... -run TestStandardsRunbooksAndFreshness`
- `AC-03` → `go test ./... -run 'TestQualityTaskContextAndConditionalVerification|TestQualityDanglingReferencesAndAdditiveJSON'`
- `AC-04` → `go test ./... -run TestStandardAndRunbookScaffoldsAndCatalogs`
- `AC-05` → `go test ./... -run TestStandardAndRunbookScaffoldsAndCatalogs`
- `AC-06` → `go run ./cmd/docu-docu check ./docs --strict --stale-days 0`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --strict --stale-days 0`
- `QUALITY` → `go test ./... -run 'TestStandardsRunbooks|TestQualityTask|TestStandardAndRunbook|TestTypedKnowledge'`

## Влияние на документацию

Обновлены `README.md`, `CHANGELOG.md`, `docs/index.md`, `docs/modules/model.md`,
`docs/use-cases/check-documentation.md`, `docs/contracts/cli.md`,
`docs/reference/features.md`, `docs/guides/work-items.md` и
`skills/docu-docu/SKILL.md`; добавлены руководство
`docs/guides/quality-runbooks.md`, исходный раздел `docs/quality/`, обновлённая
reference-модель skill и восемь RU/EN skill-шаблонов standards, runbooks и их
manifest. Сгенерированные порталы остаются производными от Markdown.
