# TASK-DOCS-003: Добавить явную инициализацию skill

- Статус: Выполнено
- Тип: Documentation
- Приоритет: Высокий
- Модуль: MOD-MODEL
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Toudocu
- Последнее обновление: 2026-07-31

## Результат

Пользователь явно подключает Toudocu к проекту через `$toudocu init`;
skill создаёт минимальную документацию при необходимости и безопасно
устанавливает ограниченные правила использования в `AGENTS.md`.

## Изменение поведения

### Было

Skill не имел отдельного onboarding-вызова, а workflow безусловно предлагал
создавать `TASK-*` для каждого нового запроса.

### Станет

Только явный `$toudocu init` выполняет preflight, создаёт отсутствующий
`docs/index.md`, устанавливает управляемый блок `AGENTS.md` и запускает
структурную проверку. Обычные вызовы не меняют project instructions, а новые
`TASK-*` создаются только для существенной работы.

## Область изменения

- `skills/toudocu/`;
- `skill_templates_test.go`;
- `README.md`;
- `CHANGELOG.md`;
- `docs/guides/work-items.md`;
- `docs/work/TASK-DOCS-003.md`.

## Не входит в задачу

- новая команда Go CLI `toudocu init`;
- автоматическое изменение `AGENTS.md` при неявном срабатывании skill;
- внешний runtime или dependency для слияния Markdown;
- создание полного starter pack документации.

## Критерии приёмки

- [x] `AC-01` Skill трактует `$toudocu init` как единственный явный
  onboarding-вызов с read-only preflight, минимальным `index.md`,
  управляемым блоком `AGENTS.md` и финальным check.
- [x] `AC-02` Русский и английский блоки используют одинаковые стабильные
  маркеры, ограничивают триггеры skill и запрещают `TASK-*` для каждого prompt.
- [x] `AC-03` Task workflow создаёт новый work item только для существенной
  работы или по явному требованию пользователя либо проекта.
- [x] `AC-04` Metadata skill описывает явный init и остаётся валидной.

## План

- [x] Добавить init reference и RU/EN project-guidance assets.
- [x] Синхронизировать SKILL.md, workflow и metadata.
- [x] Зафиксировать contract тестами и пользовательской документацией.
- [x] Выполнить semantic review и полный verification cycle.

## Проверка

- `AC-01` → `go test ./... -run TestUseToudocuInitContract`
- `AC-02` → `go test ./... -run TestUseToudocuProjectGuidanceTemplates`
- `AC-03` → `go test ./... -run TestUseToudocuTaskCreationThreshold`
- `AC-04` → `go test ./... -run TestUseToudocuMetadata`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --strict --stale-days 0`
- `QUALITY` → `go test ./... -run 'TestUseToudocu'`

## Влияние на документацию

Обновлены `skills/toudocu/`, `README.md`, `CHANGELOG.md`,
`docs/guides/work-items.md` и `skill_templates_test.go`. Публичные Go API, CLI
и JSON schema не меняются; generated portals не редактируются.

## Обоснование отсутствия сценария

Изменение определяет поведение устанавливаемого AI-skill и не меняет
наблюдаемый сценарий пользователя Go CLI или статического портала.
