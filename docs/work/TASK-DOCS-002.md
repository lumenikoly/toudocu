<!-- toudocu
version: 1
id: TASK-DOCS-002
status: done
taskType: feature
priority: high
module: MOD-MODEL
useCase: UC-DOCS-02
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-10
-->

# TASK-DOCS-002: Добавить стандарты, runbooks и пользовательские разделы

<!-- toudocu:section result -->
## Результат

Toudocu поддерживает необязательные стандарты `STD-*`, эксплуатационные
инструкции `RB-*` и собственные верхнеуровневые разделы проекта. Они входят в
модель schema v1, получают отдельные каталоги в портале и могут быть явно
связаны с рабочей задачей.

<!-- toudocu:section behavior-change -->
## Изменение поведения

<!-- toudocu:section before -->
### Было

Неизвестные каталоги оставались неструктурированным Markdown. Для стандартов и
эксплуатационных инструкций не было отдельных правил, связей с задачами и
страниц портала.

<!-- toudocu:section after -->
### Станет

Появившиеся `quality/`, `runbooks/` и пользовательские разделы получают явный
`index.md` и проверяемые метаданные. При этом ни один из них не становится
обязательным для всех проектов. В контекст задачи попадают только явно
указанные `STD-*` и `RB-*`.

<!-- toudocu:section scope -->
## Область изменения

- модель, разбор Markdown и диагностические сообщения в `internal/app/`;
- создание каркасов и команды работы с задачами;
- генерация специализированных каталогов портала;
- встроенный skill, каноническая документация и `AGENTS.md`.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

- новые внешние зависимости;
- автоматическое сопоставление области задачи с шаблоном путей стандарта;
- выполнение команд непосредственно из стандарта;
- создание фиктивной эксплуатационной инструкции;
- изменение версии schema v1.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Стандарты, runbooks и пользовательские разделы проверяются с
  разделением ошибок и предупреждений.
- [x] `AC-02` `--stale-days` управляет проверкой давности; значение `0`
  отключает предупреждение только по возрасту.
- [x] `AC-03` Ссылки из задач, условный набор `QUALITY`, контекст и добавленные
  поля JSON сохраняют пустые коллекции как `[]`.
- [x] `AC-04` Русские и английские каркасы создаются атомарно и не выдумывают
  дату проверки runbook.
- [x] `AC-05` Портал сохраняет маршрут `processes` и добавляет каталоги,
  фильтры и четыре показателя для runbooks.
- [x] `AC-06` Документация Toudocu содержит только подтверждённые стандарты и
  не создаёт фиктивный runbook.

<!-- toudocu:section plan -->
## План

- [x] Добавить типы модели, диагностику, проверку давности и пользовательские
  разделы.
- [x] Расширить работу с задачами, schema v1 и каркасы.
- [x] Добавить каталоги портала и тесты.
- [x] Обновить документацию и проверить её смысл.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `go test ./... -run 'TestQualityCanonicalMetadataAndValidationBoundaries|TestTypedKnowledgeErrorsAndCustomManifest'`
- `AC-02` → `go test ./... -run TestStandardsRunbooksAndFreshness`
- `AC-03` → `go test ./... -run 'TestQualityTaskContextAndConditionalVerification|TestQualityDanglingReferencesAndAdditiveJSON'`
- `AC-04` → `go test ./... -run TestStandardAndRunbookScaffoldsAndCatalogs`
- `AC-05` → `go test ./... -run TestStandardAndRunbookScaffoldsAndCatalogs`
- `AC-06` → `go run ./cmd/toudocu check ./docs --strict --stale-days 0`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --strict --stale-days 0`
- `QUALITY` → `go test ./... -run 'TestStandardsRunbooks|TestQualityTask|TestStandardAndRunbook|TestTypedKnowledge'`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Были обновлены README, журнал изменений, главная страница, модель, сценарий
проверки, CLI-контракт, справочники и встроенный skill. Добавлены руководство
по стандартам и runbooks и раздел `docs/quality/`. Сгенерированные порталы
остаются производными от Markdown.
