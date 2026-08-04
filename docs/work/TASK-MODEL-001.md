# TASK-MODEL-001: Стабилизировать встроенные разделы и маршрут FLOW

- Статус: Выполнено
- Тип: Maintenance
- Приоритет: Высокий
- Модуль: MOD-MODEL
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Docgent
- Последнее обновление: 2026-08-03

## Результат

Модель и портал используют упорядоченный реестр встроенных разделов,
локализованные project-названия, аддитивный JSON `sectionType` и единственный
каталог `FLOW-*` по маршруту `processes/index.html`.

## Область изменения

- `internal/app/sections.go`, модель, config parser и портал;
- canonical route каталога FLOW без legacy index в source directory;
- `$use-docgent` init/refresh workflow;
- configuration, model, portal и CLI documentation.

## Не входит в исправление

- многолокальная сборка одного портала;
- миграционный fallback от H1 для built-in разделов.

## Изменение поведения

### Было

Навигация и классификация built-in разделов зависели от строк каталогов, а
название раздела могло неявно происходить из H1.

### Станет

Стабильный SectionType и project configuration определяют маршрут, порядок,
название и JSON-представление built-in раздела; `flows` остаётся source
directory и маршрутом отдельных документов, а его каталогом становится только
`processes`.

## Критерии приёмки

- [x] `AC-01` Двенадцать SectionType имеют стабильный порядок и derived lookup.
- [x] `AC-02` Config принимает project-only locale и полный sections map.
- [x] `AC-03` Некорректные locale отклоняются, а неизвестные корректные locale допустимы.
- [x] `AC-04` Навигация, routes, HTML lang и report используют SectionType.
- [x] `AC-05` Полный Go и строгий documentation verification проходят.
- [x] `AC-06` Каталог FLOW существует только как `processes/index.html`, его
  label берётся из `project.sections.flows`, а FLOW-страница активирует этот
  раздел навигации.
- [x] `AC-07` Демо-проект задаёт полные локализованные `project.locale` и
  `project.sections` и проходит строгую документационную проверку без warning.

## Проверка

- `AC-01` → `go test ./... -run TestBuiltinSectionsStableOrderAndLookups`
- `AC-02` → `go test ./... -run TestProjectLocaleConfiguration`
- `AC-03` → `go test ./... -run TestProjectLocaleConfiguration`
- `AC-04` → `go test ./... -run TestMissingProjectConfigurationUsesEnglishAndWarning`
- `AC-05` → `go vet ./... && go test ./... && go test -race ./...`
- `AC-06` → `go test ./... -run TestScreenPortalAndReportV1`
- `AC-07` → `go run ./cmd/docgent check ./example/docs --repository-root ./example --strict --stale-days 0`
- `ALL` → `go vet ./... && go test ./... && go test -race ./...`
- `DOCS` → `go run ./cmd/docgent check ./docs --repository-root . --strict --stale-days 0 && go run ./cmd/docgent check ./example/docs --repository-root ./example --strict --stale-days 0`
- `QUALITY` → `go test ./...`

## План

- [x] Добавить SectionType, реестр и locale/config contracts.
- [x] Перевести модель, JSON и навигацию на registry.
- [x] Зафиксировать поведение тестами и обновить документацию.
- [x] Удалить legacy-каталог `flows/index.html` и пересобрать порталы.
- [x] Добавить полную project-конфигурацию демонстрационного портала.

## Влияние на документацию

Обновлены reference configuration, module contracts, CLI contract, README и
init/refresh instructions skill. Generated portal пересобирается только после
успешной строгой structural проверки.

## Обоснование отсутствия сценария

Изменение стабилизирует внутреннюю модель и конфигурационный контракт; оно не
добавляет самостоятельного пользовательского сценария Docgent.
