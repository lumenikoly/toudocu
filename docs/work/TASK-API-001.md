# TASK-API-001: OpenAPI-контракты и offline Swagger UI

- Статус: Выполнено
- Тип: Feature
- Приоритет: Высокий
- Модуль: MOD-SITE
- Сценарий: UC-DOCS-03
- Экраны: SC-SITE-HOME, SC-SITE-API-DOCS
- Переходы: TR-SITE-006
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Toudocu
- Последнее обновление: 2026-08-05

## Результат

Два OpenAPI 3.1.0 контракта являются источниками истины для wire-level Editor
и Changes API, а canonical `serve` предоставляет их через полностью offline
Swagger UI без изменения публичной schema v1 отчётов.

## Изменение поведения

### Было

Wire-контракты дублируются в Markdown, OpenAPI-файлы не проверяются как
отдельный тип источника, а локальный портал не предоставляет интерактивный
каталог API.

### Станет

`check` и editor diagnostics проверяют OpenAPI, route registries двусторонне
соответствуют operations, Changes API имеет единый JSON error envelope и
ограничивает HEAD summary-маршрутом, а canonical `serve` показывает оба
контракта в vendored Swagger UI. Static и translation portals UI не получают.

## Область изменения

- OpenAPI validation, Editor/Changes route registries и HTTP handlers в `internal/app/`;
- vendored Swagger UI assets и dev-only asset build metadata;
- canonical contracts, ADR, standard, modules, use case, flow, screens,
  architecture/reference/README/changelog documentation;
- tests wire parity, validation, portal isolation and vendored checksums.

## Не входит в задачу

- новые CLI flags, Go exports или schemaVersion публичных JSON reports;
- TLS, authentication, CORS или внешняя загрузка `$ref`;
- Swagger UI в static build, locale mounts или при прямом serve translation root;
- изменение успешных Editor payloads и media types raw/rendered Changes content;
- изменение translation roots и generated example portals.

## Критерии приёмки

- [x] `AC-01` Два OpenAPI 3.1.0 файла полностью описывают действующие Editor и Changes operations, параметры, статусы, media types, examples и schema v1 components.
- [x] `AC-02` `check` и editor diagnostics распознают `contracts/**/*.openapi.{yaml,yml,json}` и выдают устойчивые positional diagnostics для syntax/root/operation/operationId/path-parameter/internal-ref ошибок без network resolution.
- [x] `AC-03` Декларативные route registries двусторонне соответствуют OpenAPI paths и methods.
- [x] `AC-04` Changes разрешает HEAD только summary и возвращает schema-v1 diagnostic envelope для всех API errors; успешные content/render media types сохраняются.
- [x] `AC-05` Canonical `serve` предоставляет `GET|HEAD /_toudocu/api-docs/`, selector двух specs, same-origin assets, CSP/no-store/nosniff и Try it out только для GET/HEAD.
- [x] `AC-06` Swagger UI 5.32.12, license и checksums vendored; runtime/CI и external network dependencies отсутствуют.
- [x] `AC-07` Static build копирует OpenAPI specs, но не Swagger UI assets/navigation; translation portals и direct translation serve не содержат UI.
- [x] `AC-08` Markdown-компаньоны и связанные ADR/standard/module/use-case/flow/screen/architecture/reference/README/changelog источники согласованы без изменения translation roots.
- [x] `AC-09` Unit, contract, regression, portal, race, strict documentation и repository checks проходят; browser QA подтверждает selector и safe GET.

## План

- [x] Добавить и валидировать OpenAPI sources.
- [x] Ввести route registries и нормализовать Changes errors/methods.
- [x] Встроить offline Swagger UI и изолировать static/translation portals.
- [x] Обновить source documentation и пройти semantic gates.
- [x] Выполнить automated и browser verification.

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

## Влияние на документацию

Добавляются два OpenAPI contracts, ADR, screen и этот work item. Обновляются
Markdown HTTP companions, `STD-DOCS-001`, API/CLI references, Site/Changes
modules, architecture answers, `UC-DOCS-03`, `FLOW-DOCS-SERVE`, README и
CHANGELOG. Translation roots и generated portals не изменяются.
