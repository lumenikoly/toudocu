<!-- toudocu
id: TASK-MODEL-001
status: done
taskType: maintenance
priority: high
module: MOD-MODEL
transitions: TR-SITE-004
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-10
-->

# TASK-MODEL-001: Стабилизировать встроенные разделы и маршрут FLOW

<!-- toudocu:section result -->
## Результат

Модель и портал используют один упорядоченный реестр двенадцати встроенных
разделов. Конфигурация задаёт их локализованные названия, JSON получает
добавочное поле `sectionType`, а единый каталог документов `FLOW-*` публикуется
по адресу `processes/index.html`.

<!-- toudocu:section scope -->
## Область изменения

- `internal/app/sections.go`, проектная модель, разбор конфигурации и портал;
- единый маршрут каталога FLOW без второго старого индекса;
- `$toudocu init` и `$toudocu refresh`;
- справочники конфигурации, модели, портала и CLI.

<!-- toudocu:section out-of-scope -->
## Не входит в исправление

- сборка нескольких языков в один портал;
- восстановление названия встроенного раздела из H1 старого документа.

<!-- toudocu:section behavior-change -->
## Изменение поведения

<!-- toudocu:section before -->
### Было

Навигация и классификация зависели от строковых имён каталогов, а название
раздела могло неявно браться из H1.

<!-- toudocu:section after -->
### Станет

Стабильный `SectionType` и конфигурация проекта определяют маршрут, порядок,
название и JSON-представление раздела. `flows` остаётся исходным каталогом и
частью пути отдельного документа, но список процессов существует только по
маршруту `processes`.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Двенадцать значений `SectionType` имеют стабильный порядок и
  единый поиск.
- [x] `AC-02` Конфигурация принимает локаль проекта и полную карту разделов.
- [x] `AC-03` Некорректная локаль отклоняется, а неизвестная, но правильно
  записанная локаль допустима.
- [x] `AC-04` Навигация, маршруты, HTML `lang` и отчёт используют
  `SectionType`.
- [x] `AC-05` Проверки Go и документации включены в критерии задачи.
- [x] `AC-06` Каталог FLOW существует только как `processes/index.html`, его
  подпись берётся из `project.sections.flows`, а страница FLOW активирует этот
  раздел навигации.

<!-- toudocu:section verification -->
## Проверка

- `AC-06` → `TR-SITE-004` → `TestScreenPortalAndReportV1`
- `AC-01` → `go test ./... -run TestBuiltinSectionsStableOrderAndLookups`
- `AC-02` → `go test ./... -run TestProjectLocaleConfiguration`
- `AC-03` → `go test ./... -run TestProjectLocaleConfiguration`
- `AC-04` → `go test ./... -run TestMissingProjectConfigurationUsesEnglishAndWarning`
- `AC-05` → `go vet ./... && go test ./... && go test -race ./...`
- `AC-06` → `go test ./... -run TestScreenPortalAndReportV1`
- `ALL` → `go vet ./... && go test ./... && go test -race ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `go test ./...`

<!-- toudocu:section plan -->
## План

- [x] Добавить `SectionType`, реестр и правила локали и конфигурации.
- [x] Перевести модель, JSON и навигацию на единый реестр.
- [x] Зафиксировать поведение тестами и обновить документацию.
- [x] Удалить старый каталог `flows/index.html` и пересобрать порталы.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Были обновлены справочник конфигурации, контракты модулей и CLI, README и
инструкции skill для `init` и `refresh`. Портал пересобирался только после
проверки исходного Markdown.

<!-- toudocu:section use-case-omission-reason -->
## Обоснование отсутствия сценария

Изменение стабилизирует модель и конфигурационный контракт, но не добавляет
самостоятельного пользовательского пути.
