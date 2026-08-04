# TASK-ARCH-001: Внедрить вопросно-ориентированную архитектурную документацию

- Статус: Выполнено
- Тип: Feature
- Приоритет: Высокий
- Модуль: MOD-MODEL
- Сценарий: UC-DOCS-02
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Docgent
- Последнее обновление: 2026-07-31

## Результат

`docs/architecture/overview.md` является обязательной картой архитектуры, а
каждый другой Markdown-документ в `architecture/` отвечает на один явный
архитектурный вопрос и напрямую перечислен в overview.

## Изменение поведения

### Было

Каталог `architecture/` был необязательным набором специализированных
Markdown-документов без обязательной карты, явного вопроса и повышенной
строгости локальных ссылок.

### Станет

Обычный `check` требует корректный architecture overview, один непустой вопрос
для каждого подробного документа, прямую рекурсивную карту документов и
безопасные существующие локальные ссылки. Skill предоставляет раздельные
RU/EN-шаблоны, безопасный init и semantic gate `ARCH001`–`ARCH013`.

## Область изменения

- `docs_core.go`;
- `documentation_links.go`;
- `markdown_parse.go`;
- `integration_test.go`;
- `screens_test.go`;
- `skill_templates_test.go`;
- `skills/use-docgent/`;
- `docs/`;
- `example/docs/`;
- `project-docs/`;
- `example/project-docs/`;
- `README.md`;
- `CHANGELOG.md`;
- `AGENTS.md`.

## Не входит в задачу

- новая Go-команда `docgent init`;
- изменение `ProjectReport` schema v1 или типа `documents[].type`;
- автоматическая миграция legacy-архитектуры;
- проверка пунктуации, вопросительных слов или архитектурного смысла в CLI;
- документы Docgent о deployment или владении данными без подтверждённого
  архитектурного вопроса.

## Критерии приёмки

- [x] `AC-01` Обычный check выдаёт стабильные errors для отсутствующего или
  неверно типизированного overview, отсутствующего вопроса и документа вне
  прямой рекурсивной карты overview.
- [x] `AC-02` Архитектурные broken/blocked links являются errors, а
  непунктуационный непустой вопрос допустим.
- [x] `AC-03` JSON schema остаётся v1, и overview сериализуется с
  `type: architecture`.
- [x] `AC-04` RU/EN skill assets содержат раздельные overview/detail templates,
  минимальный init создаёт `index.md` и overview, а legacy-архитектура
  останавливает init без автоматической миграции.
- [x] `AC-05` Managed guidance и semantic gate синхронно задают границы типов,
  прямую карту overview и коды `ARCH001`–`ARCH013`.
- [x] `AC-06` Архитектура Docgent и Service Desk разделена на подтверждённые
  вопросно-ориентированные документы, а оба портала пересобраны только из
  исходного Markdown после независимого review.

## План

- [x] Добавить metadata aliases и структурные architecture diagnostics.
- [x] Расширить behavioral и schema contract tests.
- [x] Обновить templates, init workflow, managed guidance и semantic gate.
- [x] Мигрировать документацию Docgent и демонстрационного Service Desk.
- [x] Выполнить независимый semantic review и устранить замечания.
- [x] Пройти полный Go/Docgent verification и пересобрать portals.

## Проверка

- `AC-01` → `go test ./... -run 'TestArchitectureContract'`
- `AC-02` → `go test ./... -run 'TestArchitectureContract'`
- `AC-03` → `go test ./... -run 'TestArchitectureSchemaContract'`
- `AC-04` → `go test ./... -run 'TestUseDocgentArchitecture|TestUseDocgentInitContract'`
- `AC-05` → `go test ./... -run 'TestUseDocgentArchitecture'`
- `AC-06` → `go run ./cmd/docgent build ./docs --output ./project-docs --repository-root . --clean --strict --stale-days 0 && go run ./cmd/docgent build ./example/docs --output ./example/project-docs --repository-root ./example --clean --strict --stale-days 0`
- `ALL` → `go test -count=1 ./...`
- `DOCS` → `go run ./cmd/docgent check ./docs --repository-root . --strict --stale-days 0 && go run ./cmd/docgent check ./example/docs --repository-root ./example --strict --stale-days 0`
- `QUALITY` → `go test ./... -run 'TestArchitectureContract|TestArchitectureSchemaContract|TestUseDocgentArchitecture'`

## Влияние на документацию

Обновляются публичный архитектурный контракт, skill init и guidance,
самодокументация Docgent, демонстрационный Service Desk, README, CLI/reference,
модель, use case, changelog, стандарт документации и отслеживаемые portals.
