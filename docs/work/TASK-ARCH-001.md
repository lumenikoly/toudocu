<!-- toudocu
id: TASK-ARCH-001
status: done
taskType: feature
priority: high
module: MOD-MODEL
useCase: UC-DOCS-02
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-10
-->

# TASK-ARCH-001: Перестроить архитектурную документацию вокруг вопросов

<!-- toudocu:section result -->
## Результат

`docs/architecture/overview.md` стал обязательной картой архитектуры. Каждый
другой Markdown-документ в `architecture/` отвечает на один конкретный вопрос
и связан с обзором прямой ссылкой.

<!-- toudocu:section behavior-change -->
## Изменение поведения

<!-- toudocu:section before -->
### Было

Каталог `architecture/` был необязательным набором документов без общей карты,
явных вопросов и строгих требований к локальным ссылкам.

<!-- toudocu:section after -->
### Станет

Обычный `check` требует корректный архитектурный обзор, непустой вопрос в
каждом подробном документе, прямые ссылки на все документы, включая вложенные,
и безопасные существующие локальные ссылки. Skill содержит отдельные русские и
английские шаблоны и применяет правила смысла `ARCH001`–`ARCH013`.

<!-- toudocu:section scope -->
## Область изменения

- разбор документов и ссылок в `internal/app/`;
- тесты архитектурного контракта и шаблонов;
- `skills/toudocu/`;
- исходная документация, README, журнал изменений и `AGENTS.md`.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

- новая Go-команда `toudocu init`;
- изменение `ProjectReport` schema v1 или `documents[].type`;
- автоматическое преобразование старой архитектуры;
- проверка вопросительных слов или архитектурного смысла самим CLI;
- создание документов о развёртывании или владении данными без подтверждённого
  архитектурного вопроса.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Обычный `check` выдаёт стабильные ошибки, если обзора нет, он
  имеет неправильный тип, вопрос отсутствует или документ не включён в прямую
  карту обзора.
- [x] `AC-02` Сломанная или запрещённая ссылка в архитектуре считается
  ошибкой. Непустой вопрос без вопросительного знака допустим.
- [x] `AC-03` JSON schema остаётся v1, а обзор сериализуется с
  `type: architecture`.
- [x] `AC-04` Русские и английские ресурсы skill имеют отдельные шаблоны обзора
  и подробного ответа. Минимальный `init` создаёт `index.md` и обзор, а при
  старой архитектуре останавливается без автоматической миграции.
- [x] `AC-05` Управляемые правила и проверка смысла одинаково задают границы
  типов, прямую карту и коды `ARCH001`–`ARCH013`.
- [x] `AC-06` Архитектура Toudocu разделена на подтверждённые ответы на вопросы,
  а портал строится из исходного Markdown.

<!-- toudocu:section plan -->
## План

- [x] Добавить варианты метаданных и структурные сообщения архитектуры.
- [x] Расширить поведенческие тесты и тесты JSON-схемы.
- [x] Обновить шаблоны, `init`, управляемые правила и проверку смысла.
- [x] Перевести документацию Toudocu на новую форму.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `go test ./... -run 'TestArchitectureContract'`
- `AC-02` → `go test ./... -run 'TestArchitectureContract'`
- `AC-03` → `go test ./... -run 'TestArchitectureSchemaContract'`
- `AC-04` → `go test ./... -run 'TestUseToudocuArchitecture|TestUseToudocuInitContract'`
- `AC-05` → `go test ./... -run 'TestUseToudocuArchitecture'`
- `AC-06` → `go run ./cmd/toudocu build ./docs --output ./project-docs --repository-root . --clean --strict --stale-days 0`
- `ALL` → `go test -count=1 ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `go test ./... -run 'TestArchitectureContract|TestArchitectureSchemaContract|TestUseToudocuArchitecture'`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Были обновлены архитектурный контракт, `init` и правила skill, документация
Toudocu, README, CLI-справка, модель, пользовательский сценарий, журнал
изменений и стандарт документации.
