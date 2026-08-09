# TASK-SKILL-001: Добавить встроенную установку skill Toudocu

- Статус: Выполнено
- Тип: Feature
- Приоритет: Высокий
- Модуль: MOD-CLI
- Сценарий: UC-AGENT-01
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Toudocu
- Последнее обновление: 2026-08-06

## Результат

Binary версии `0.0.1` содержит канонический skill `toudocu` и предоставляет
безопасный offline lifecycle для Codex, Claude Code и Copilot в project/user
scope.

## Изменение поведения

### Было

CLI устанавливается отдельно, а пользователь вручную размещает skill в
каталоге выбранного AI host без проверяемого ownership или update lifecycle.

### Станет

Команды `toudocu skill install|status|update|uninstall` разрешают target,
классифицируют существующую копию по manifest/checksums и изменяют только
неизменённый managed package с атомарной публикацией и rollback.

## Область изменения

- `skills/`
- `internal/skillinstall/`
- `internal/app/`
- `README.md`
- `docs/`
- `project-docs/`

## Не входит в задачу

- `--force`, `--dry-run`, JSON output и новый публичный Go API;
- marketplace и загрузка skill из сети;
- изменение translation root `docs-en`;
- выполнение scripts из embedded bundle.

## Критерии приёмки

- [x] `AC-01` Binary встраивает полный текущий package `skills/toudocu` как
  skill `toudocu` версии `0.0.1` с проверкой metadata, paths, collisions и
  лимитов 2 MiB/10 MiB.
- [x] `AC-02` Registry, detection, target resolution, semver, manifest,
  checksums и planner покрывают все восемь публичных состояний.
- [x] `AC-03` Project/user install, no-op, update, status, uninstall,
  интерактивный выбор, non-TTY ambiguity и `--agent all` имеют поведенческие
  тесты text output и exit codes.
- [x] `AC-04` Unmanaged/modified/newer/unsafe targets, traversal, symlinks,
  hostile manifest, target swap и publish/restore failures не приводят к
  перезаписи пользовательских данных или запуску shell/network.
- [x] `AC-05` README, CLI contract, MOD-CLI, system/runtime/trust boundaries и
  руководство описывают реализованный lifecycle без дублирования источников.
- [x] `AC-06` Проходят gofmt, vet, обычные/race tests, module verification,
  strict canonical docs check и пять CGO-disabled cross-build targets.

## План

- [x] Встроить и валидировать канонический skill package.
- [x] Реализовать registry, planner, manifest и безопасный executor.
- [x] Подключить команды к CLI без расширения публичного фасада.
- [x] Добавить unit, lifecycle, CLI и security tests.
- [x] Обновить канонические источники документации.
- [x] Завершить semantic review и полный verification cycle.

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

## Влияние на документацию

Добавлены UC и guide; обновлены README, roadmap, CLI contract, MOD-CLI,
справочник возможностей и существующие architecture answers. После semantic и
structural gates пересобирается только каноническая часть tracked portal.
