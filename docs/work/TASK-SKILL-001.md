<!-- toudocu
id: TASK-SKILL-001
status: done
taskType: feature
priority: high
module: MOD-CLI
useCase: UC-AGENT-01
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-10
-->

# TASK-SKILL-001: Добавить встроенную установку skill Toudocu

<!-- toudocu:section result -->
## Результат

Исполняемый файл версии `0.0.1` содержит канонический skill `toudocu`. CLI
может установить, проверить, обновить и удалить его для Codex, Claude Code и
Copilot в каталоге проекта или пользователя. Сеть для этих операций не нужна.

<!-- toudocu:section behavior-change -->
## Изменение поведения

<!-- toudocu:section before -->
### Было

CLI и skill устанавливались отдельно. Пользователь вручную копировал файлы в
каталог выбранного AI-инструмента, а Toudocu не мог определить владельца копии
или безопасно её обновить.

<!-- toudocu:section after -->
### Станет

`toudocu skill install|status|update|uninstall` определяет целевой каталог,
сравнивает установленную копию с манифестом и контрольными суммами и изменяет
только неизменённый пакет, которым управляет Toudocu. Публикация выполняется
атомарно; при ошибке прежняя копия восстанавливается.

<!-- toudocu:section scope -->
## Область изменения

- `skills/`;
- `internal/skillinstall/`;
- `internal/app/`;
- README и каноническая документация.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

- `--force`, `--dry-run`, JSON-вывод и новый публичный Go API;
- каталоги расширений и загрузка skill из сети;
- изменение английского перевода `docs-en` в рамках исторической задачи;
- выполнение скриптов из встроенного пакета.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Исполняемый файл содержит полный пакет `skills/toudocu` версии
  `0.0.1` и проверяет метаданные, пути, конфликты имён и пределы 2 MiB/10 MiB.
- [x] `AC-02` Реестр, определение состояния, выбор цели, semver, манифест,
  контрольные суммы и планировщик покрывают восемь публичных состояний.
- [x] `AC-03` Установка для проекта или пользователя, отсутствие изменений,
  обновление, статус, удаление, интерактивный выбор, неоднозначность без TTY и
  `--agent all` имеют поведенческие тесты текста и кодов завершения.
- [x] `AC-04` Неуправляемая, изменённая, более новая или опасная цель, выход из
  каталога, символическая ссылка, враждебный манифест, подмена цели и ошибка
  публикации не приводят к потере пользовательских данных и не запускают сеть
  или оболочку.
- [x] `AC-05` README, CLI-контракт, MOD-CLI, архитектурные границы и руководство
  описывают один реализованный жизненный цикл без дублирования источников.
- [x] `AC-06` В задачу включены форматирование, vet, обычные и race-тесты,
  проверка модулей, строгая проверка документации и сборки без CGO.

<!-- toudocu:section plan -->
## План

- [x] Встроить и проверить канонический пакет skill.
- [x] Реализовать реестр, план, манифест и безопасное применение.
- [x] Подключить команды к CLI без расширения публичного фасада.
- [x] Добавить тесты жизненного цикла, CLI и безопасности.
- [x] Обновить каноническую документацию.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `go test ./skills`
- `AC-02` → `go test ./internal/skillinstall`
- `AC-03` → `go test ./internal/app -run TestSkillCLI`
- `AC-04` → `go test ./internal/skillinstall -run 'Test(Unsafe|Boundary|Modified|Symlink|Mode|Publish|Atomic|InstallDoesNotExecute|StageRejectsTraversal)'`
- `AC-05` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `AC-06` → `make check && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build ./cmd/toudocu && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build ./cmd/toudocu && CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build ./cmd/toudocu && CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build ./cmd/toudocu && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build ./cmd/toudocu && CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go test -c -o /tmp/toudocu-skillinstall-darwin.test ./internal/skillinstall && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go test -c -o /tmp/toudocu-skillinstall-windows.test.exe ./internal/skillinstall`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Были добавлены пользовательский сценарий и руководство; обновлены README,
дорожная карта, CLI-контракт, MOD-CLI, справочник возможностей и существующие
архитектурные ответы.
