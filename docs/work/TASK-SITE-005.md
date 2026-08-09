# TASK-SITE-005: Показывать доступное обновление в serve-портале

- Статус: Выполнено
- Тип: Feature
- Приоритет: Обычный
- Модуль: MOD-SITE
- Сценарий: UC-DOCS-03
- Процесс: FLOW-DOCS-SERVE
- Экраны: SC-SITE-HOME
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Toudocu
- Последнее обновление: 2026-08-08

## Результат

Canonical `toudocu serve` неблокирующе проверяет последний
стабильный GitHub Release и показывает в портале компактное предложение
открыть официальный релиз, если версия новее текущего binary. Static
build, locale portals и сам binary остаются автономными.

## Изменение поведения

### Было

Пользователь узнаёт о новом релизе только вне Toudocu или вручную
открывает GitHub Releases.

### Станет

При первом открытии canonical serve-портала browser асинхронно запрашивает
same-origin version endpoint. Go один раз на процесс сверяет стабильный
release и возвращает безопасное типизированное состояние. Баннер можно
скрыть для конкретной latest-версии; `--no-update-check` полностью
отключает outbound-запрос.

## Область изменения

- `internal/app/`, `internal/site/` и `api.go` — CLI option, checker, endpoint и bootstrap;
- `web/src/`, `web/tests/` и `internal/site/assets/generated/` — serve-only banner,
  стили, локализация, сборка и browser tests;
- `docs/` — work item, ADR, CLI/HTTP contracts, architecture, module, use case,
  flow, screen и references.

## Не входит в задачу

- self-update, запуск installer и замена binary из browser;
- проверка release candidate, плагинов или других repository;
- outbound-запросы static build, locale portals и direct translation serve;
- изменение translation root `docs-en`.

## Критерии приёмки

- [x] `AC-01` `serve --no-update-check` отключает update capability,
  endpoint и outbound-запрос; флаг отклоняется другими командами.
- [x] `AC-02` `GET|HEAD /_toudocu/api/version` отдаёт schema v1,
  `no-store`/`nosniff`, current version и статус `up-to-date`,
  `update-available` или `unavailable`; другие методы получают `405`.
- [x] `AC-03` Checker ограничивает timeout и размер ответа, принимает
  только stable `X.Y.Z`, строит ссылку только для официального repository
  и кэширует один результат на процесс без блокировки основного server mutex.
- [x] `AC-04` Serve-only баннер показывает current/latest version,
  открывает official release, доступен с клавиатуры и на mobile,
  сохраняет dismissal для latest-версии и не показывается для ошибки или
  актуальной версии.
- [x] `AC-05` Static output, locale portals и direct translation serve не
  содержат update endpoint/capability и server-only UI; bootstrap остаётся schema v1.
- [x] `AC-06` ADR, CLI/OpenAPI contracts, architecture, MOD-SITE, UC-DOCS-03,
  FLOW-DOCS-SERVE, SC-SITE-HOME и references согласованы и прошли
  независимый semantic review и structural gates.

## План

- [x] Добавить CLI option, update checker, HTTP route и bootstrap capability.
- [x] Добавить доступный serve-only banner и dismissal lifecycle.
- [x] Покрыть backend, frontend, static isolation и browser behavior.
- [x] Обновить канонические источники документации и выполнить semantic gates.
- [x] Пересобрать frontend assets и выполнить repository verification.

## Проверка

- `AC-01` → `go test ./internal/app -run 'TestParseUpdateCheckFlag|TestVersionEndpointDisabled'`
- `AC-02` → `go test ./internal/app -run TestVersionEndpoint`
- `AC-03` → `go test ./internal/app -run TestUpdateChecker`
- `AC-04` → `npm --prefix web run typecheck && npm --prefix web run test:browser`
- `AC-05` → `go test ./internal/app ./internal/site && npm --prefix web test`
- `AC-06` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `ALL` → `go test ./... && go test -race ./... && npm --prefix web test && npm --prefix web run test:browser`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `go vet ./... && go mod verify && npm --prefix web run typecheck`

## Влияние на документацию

Добавляется ADR об узком opt-out network exception. Обновляются
Editor OpenAPI/behavioral contract, CLI contract/help, architecture boundaries,
MOD-SITE, UC-DOCS-03, FLOW-DOCS-SERVE, SC-SITE-HOME и справка capabilities.
Новый экран не создаётся: banner является состоянием существующей
оболочки portal.
