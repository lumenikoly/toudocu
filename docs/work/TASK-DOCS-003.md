<!-- toudocu
version: 1
id: TASK-DOCS-003
status: done
taskType: documentation
priority: high
module: MOD-MODEL
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-10
-->

# TASK-DOCS-003: Добавить явную инициализацию skill

<!-- toudocu:section result -->
## Результат

Пользователь подключает Toudocu к проекту только явным вызовом
`$toudocu init`. При необходимости skill создаёт минимальную документацию и
добавляет в `AGENTS.md` ограниченный управляемый блок с правилами работы.

<!-- toudocu:section behavior-change -->
## Изменение поведения

<!-- toudocu:section before -->
### Было

У skill не было отдельного первого запуска, а прежний процесс предлагал
создавать `TASK-*` почти для любого запроса.

<!-- toudocu:section after -->
### Станет

Только `$toudocu init` сначала проверяет окружение без записи, затем создаёт
отсутствующий `docs/index.md`, устанавливает управляемый блок `AGENTS.md` и
запускает структурную проверку. Обычные вызовы не меняют инструкции проекта.
Новая `TASK-*` создаётся только для существенной работы.

<!-- toudocu:section scope -->
## Область изменения

- `skills/toudocu/`;
- тесты шаблонов skill;
- `README.md`, `CHANGELOG.md`, руководство по задачам и эта запись.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

- новая команда Go CLI `toudocu init`;
- изменение `AGENTS.md` при неявном срабатывании skill;
- внешняя среда выполнения или зависимость для слияния Markdown;
- создание полного набора документации при первом запуске.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` `$toudocu init` — единственный явный первый запуск: он проверяет
  окружение, создаёт минимальный `index.md`, устанавливает управляемый блок и
  в конце проверяет структуру.
- [x] `AC-02` Русский и английский блоки используют одинаковые стабильные
  маркеры и не требуют `TASK-*` для каждого запроса.
- [x] `AC-03` Новая задача создаётся только для существенной работы либо по
  явному требованию пользователя или проекта.
- [x] `AC-04` Метаданные skill описывают явный `init` и остаются корректными.

<!-- toudocu:section plan -->
## План

- [x] Добавить описание `init` и русские/английские шаблоны правил проекта.
- [x] Согласовать `SKILL.md`, процесс и метаданные.
- [x] Закрепить контракт тестами и пользовательской документацией.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `go test ./... -run TestUseToudocuInitContract`
- `AC-02` → `go test ./... -run TestUseToudocuProjectGuidanceTemplates`
- `AC-03` → `go test ./... -run TestUseToudocuTaskCreationThreshold`
- `AC-04` → `go test ./... -run TestUseToudocuMetadata`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --strict --stale-days 0`
- `QUALITY` → `go test ./... -run 'TestUseToudocu'`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Были обновлены встроенный skill, README, журнал изменений и руководство по
задачам. Публичные Go API, CLI и JSON schema не изменились; сгенерированные
порталы вручную не редактировались.

<!-- toudocu:section use-case-omission-reason -->
## Обоснование отсутствия сценария

Это поведение устанавливаемого AI-skill, а не команда Go CLI или экран
статического портала.
