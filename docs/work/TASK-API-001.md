<!-- toudocu
version: 1
id: TASK-API-001
status: done
taskType: feature
priority: high
module: MOD-SITE
useCase: UC-DOCS-03
screens: SC-SITE-HOME, SC-SITE-API-DOCS
transitions: TR-SITE-006
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-10
-->

# TASK-API-001: OpenAPI-контракты и автономный Swagger UI

<!-- toudocu:section result -->
## Результат

Два файла OpenAPI 3.1.0 стали источниками точного HTTP-контракта Editor и
Changes API. Канонический `serve` показывает их через встроенный Swagger UI,
которому не нужен CDN. Публичная schema v1 отчётов не изменилась.

<!-- toudocu:section behavior-change -->
## Изменение поведения

<!-- toudocu:section before -->
### Было

HTTP-контракт повторялся в Markdown, OpenAPI не проверялся как отдельный тип
источника, а в локальном портале не было интерактивного справочника API.

<!-- toudocu:section after -->
### Станет

`check` и диагностика редактора проверяют OpenAPI. Реестр маршрутов в Go и
операции OpenAPI должны соответствовать друг другу в обе стороны. Ошибки
Changes API имеют единый JSON-формат, а `HEAD` разрешён только для краткого
маршрута. Канонический `serve` показывает оба контракта во встроенном Swagger
UI; статический портал и переводы этот интерфейс не получают.

<!-- toudocu:section scope -->
## Область изменения

- проверка OpenAPI, реестры маршрутов и HTTP-обработчики в `internal/app/`;
- встроенные ресурсы Swagger UI и метаданные их сборки;
- OpenAPI-контракты и связанная документация;
- тесты соответствия контрактов, изоляции портала и контрольных сумм.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

- новые параметры CLI, экспортируемые функции Go или новая версия JSON-схем;
- TLS, аутентификация, CORS и загрузка внешних `$ref`;
- Swagger UI в `build`, переводах и `serve`, запущенном из корня перевода;
- изменение успешных ответов Editor и форматов содержимого Changes;
- изменение корней переводов и сгенерированных порталов вручную.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Два файла OpenAPI 3.1.0 описывают все действующие операции,
  параметры, статусы, форматы данных, примеры и компоненты schema v1.
- [x] `AC-02` `check` и редактор распознают
  `contracts/**/*.openapi.{yaml,yml,json}` и показывают устойчивые позиции
  ошибок синтаксиса, корня, операции, `operationId`, параметра пути и
  внутреннего `$ref`, не обращаясь к сети.
- [x] `AC-03` Реестры маршрутов и OpenAPI совпадают по путям и методам в обе
  стороны.
- [x] `AC-04` Changes разрешает `HEAD` только для сводки и возвращает ошибки в
  едином формате schema v1. Успешные форматы содержимого не меняются.
- [x] `AC-05` Канонический `serve` предоставляет
  `GET|HEAD /_toudocu/api-docs/`, выбор одного из двух контрактов, ресурсы с
  того же origin и безопасные заголовки. Выполнить можно только `GET` и `HEAD`.
- [x] `AC-06` Swagger UI 5.32.12, его лицензия и контрольные суммы хранятся в
  репозитории; при работе сеть и CI-службы не нужны.
- [x] `AC-07` `build` копирует OpenAPI-файлы, но не Swagger UI. Переводы также
  не получают его ресурсы и навигацию.
- [x] `AC-08` Markdown-пояснения и связанные архитектурные документы
  согласованы, не дублируют HTTP-схему и не меняют корни переводов.
- [x] `AC-09` В задачу включены модульные, контрактные, регрессионные,
  портальные и браузерные проверки.

<!-- toudocu:section plan -->
## План

- [x] Добавить и проверять OpenAPI-источники.
- [x] Ввести реестры маршрутов и единый формат ошибок Changes.
- [x] Встроить Swagger UI и изолировать его от статического портала и
  переводов.
- [x] Обновить исходную документацию.

<!-- toudocu:section verification -->
## Проверка

- `AC-05` → `TR-SITE-006` → `TestAPIDocsUI`
- `AC-01` → `go test ./... -run 'TestOpenAPIContracts'`
- `AC-02` → `go test ./... -run 'TestOpenAPIValidation|TestEditorOpenAPIDiagnostics'`
- `AC-03` → `go test ./... -run 'TestOpenAPIContractParity'`
- `AC-04` → `go test ./... -run 'TestChangesHTTPContract'`
- `AC-05` → `go test ./... -run 'TestAPIDocsUI'`
- `AC-06` → `go test ./... -run 'TestSwaggerUIVendoredAssets'`
- `AC-07` → `go test ./... -run 'TestStaticSiteExcludesAPIDocs|TestTranslationServeExcludesAPIDocs'`
- `AC-08` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `AC-09` → `go vet ./... && go test ./... && go test -race ./... && make check`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root .`
- `QUALITY` → `go vet ./... && go test ./... && go test -race ./... && go run ./cmd/toudocu check ./docs --strict --stale-days 0 && make check`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Были добавлены два OpenAPI-контракта, ADR, экран и эта задача. Обновлены
Markdown-пояснения к HTTP-контрактам, стандарт документации, модули, сценарий,
процесс, архитектура, справочники, README и журнал изменений. Корни переводов
историческая задача не меняла.
