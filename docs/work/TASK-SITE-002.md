# TASK-SITE-002: Редактирование исходной документации в serve

- Статус: Выполнено
- Тип: Feature
- Приоритет: Высокий
- Модуль: MOD-SITE
- Сценарий: UC-DOCS-03
- Процесс: FLOW-DOCS-SERVE
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Docu-docu
- Последнее обновление: 2026-07-31

## Результат

`docu-docu serve` предоставляет локальный live workspace, в котором пользователь
безопасно редактирует и создаёт исходные документы, видит preview и diagnostics,
а портал синхронно обновляет модель, HTML и поиск. `docu-docu build` остаётся
автономным read-only порталом для `file://`.

## Изменение поведения

### Было

`serve` пересобирает статический портал при открытии HTML и по ручной кнопке,
но не предоставляет доступ к исходным файлам и не замечает внешнее изменение до
следующего просмотра или ручной пересборки.

### Станет

`serve` всегда включает защищённый same-origin editor API, отдельный Operate UI,
live rebuild после записи и watcher внешних изменений. Статическая генерация не
получает editor markup, server-only scripts или API-ссылки.

## Область изменения

- `internal/app/server.go`, `internal/app/docs_core.go`, `internal/app/screens.go` и новые Go-файлы server/editor workspace;
- `internal/app/site.go`, `internal/app/process_site.go`, `internal/app/screen_site.go` и генерация serve-варианта;
- `internal/app/scaffold.go` и общий реестр шаблонов;
- `internal/app/assets/` и `internal/app/embed.go`;
- `package.json`, `package-lock.json` и `editor-bundle.mjs` для build-only
  CodeMirror bundle;
- тесты в `internal/app/`;
- `README.md`, `THIRD_PARTY_NOTICES.md` и `CHANGELOG.md`;
- `docs/use-cases/serve-portal.md`;
- `docs/flows/FLOW-DOCS-SERVE.md`;
- `docs/modules/site.md`, `docs/modules/cli.md`, `docs/modules/model.md`;
- `docs/contracts/cli.md` и новый editor HTTP contract в `docs/contracts/`;
- `docs/architecture/overview.md`, `docs/architecture/runtime-components.md`,
  `docs/architecture/trust-boundaries.md`, `docs/architecture/system-boundary.md`
  и `docs/architecture/failure-isolation.md`;
- `docs/reference/features.md`, `docs/reference/configuration.md`;
- `project-docs/` и `example/project-docs/` только через пересборку.

## Не входит в задачу

- изменение семантики `--host`, `--port`, `--open` или auto-open;
- параметры `--no-open` и `--edit`;
- редактор или editor API в результате `build`;
- TLS, отдельная аутентификация, CORS или удалённое совместное редактирование;
- запуск Git, shell, task verification или любых команд через editor API;
- общая schema validation произвольного YAML.

## Критерии приёмки

- [x] `AC-01` `GenerateSite` всегда создаёт автономный статический портал, а
  serve-вариант отдельно добавляет edit/source actions и server-only assets.
- [x] `AC-02` Workspace перечисляет только обычные `.md`, `.yaml`, `.yml` и
  `.json` внутри docs root, включая `screens/hotspots.json`, но исключая hidden,
  excluded, output-поддерево и любые symlink paths; другие расширения и
  нерегулярные файлы не являются workspace entries.
- [x] `AC-03` API принимает только канонические относительные POSIX-пути и
  отклоняет absolute, `..`, backslash, NUL, encoded и повторно encoded traversal.
- [x] `AC-04` Чтение и запись используют SHA-256 digest; save сохраняет mode,
  синхронизирует temp-файл, повторно проверяет CAS и атомарно заменяет исходник:
  Unix использует same-directory rename и directory `Sync`, Windows —
  write-through replace. Каждый path-компонент повторно проверяется на symlink /
  reparse перед записью и заменой.
- [x] `AC-05` Stale digest возвращает `409 stale_digest`, а подтверждённое
  overwrite выполняется только вторым запросом с digest из conflict response и
  `confirmOverwrite: true`; новый внешний конфликт снова возвращает `409`.
- [x] `AC-06` Markdown diagnostics строятся по полной модели с in-memory overlay;
  JSON получает syntax и hotspots diagnostics, YAML — только доступные Docu-docu
  diagnostics; diagnostics не блокируют save.
- [x] `AC-07` Save/create синхронно обновляют модель, HTML, поиск и revision;
  watcher с интервалом 750 мс и стабилизацией 200 мс замечает внешние изменения.
- [x] `AC-08` Serve frontend опрашивает file revision через ETag раз в две
  секунды и без потери текста различает reload, clean update и dirty conflict.
- [x] `AC-09` Editor предоставляет дерево, path/dirty/save toolbar, Editor,
  Preview и Split, diagnostics navigation, `Ctrl/Cmd+S` и unsaved-leave guard.
- [x] `AC-10` На мобильном sidebar работает как drawer, а split становится одним
  представлением; все основные действия доступны с клавиатуры.
- [x] `AC-11` Markdown preview использует существующий безопасный renderer;
  остальные форматы возвращают `preview_not_supported`, raw source открывается
  read-only как `text/plain`.
- [x] `AC-12` `task init` и семь scaffold-типов используют один упорядоченный
  реестр, доступный CLI и browser create с общей валидацией, путём и renderer;
  создание остаётся атомарным `O_EXCL`.
- [x] `AC-13` Все editor JSON-ответы имеют `schemaVersion: 1`, `no-store` и единый
  error envelope; malformed, unknown fields, trailing JSON, >3 MiB body и >2 MiB
  content отклоняются.
- [x] `AC-14` Запись требует JSON content type, `X-Docu-docu-Action` и same-origin /
  `Sec-Fetch-Site`; API не выдаёт CORS headers и не может запускать команды.
  При явном non-loopback listener оператор включает клиентов локальной сети в
  trust boundary: browser guards защищают от cross-origin страниц, но не служат
  аутентификацией прямого HTTP-клиента; warning CLI остаётся обязательным.
- [x] `AC-15` Методы `/files`, `/file`, `/preview`, `/validate`, `/create`, ETag /
  `304`, payloads, statuses, revision и error envelope соответствуют
  [`CONTRACT-EDITOR-HTTP`](../contracts/editor-http.md).
- [x] `AC-16` Vendored CodeMirror IIFE bundle и лицензии/checksums встроены в Go;
  build-only lock фиксирует согласованные версии, а runtime не требует Node.js.
- [x] `AC-17` Документация фиксирует границу `build = static read-only`,
  `serve = view/edit/live rebuild`; backend, race, static-negative, cross-build,
  browser desktop/mobile QA, semantic review и strict Docu-docu checks проходят.

## План

- [x] Разделить статическую и serve-генерацию портала.
- [x] Реализовать безопасный workspace, diagnostics overlay и atomic CAS save.
- [x] Реализовать editor HTTP API, live rebuild и watcher.
- [x] Вынести общий реестр scaffold/task templates.
- [x] Собрать и встроить CodeMirror, реализовать адаптивный editor UI.
- [x] Добавить негативные, concurrency и end-to-end тесты.
- [x] Обновить связанные источники истины и пересобрать порталы.
- [x] Выполнить semantic, automated и browser verification.

## Проверка

- `AC-01` → `go test ./... -run 'TestStaticSiteExcludesEditor|TestServeSiteIncludesEditor'`
- `AC-02` → `go test ./... -run 'TestEditorWorkspaceFiles|TestEditorWorkspaceExclusions'`
- `AC-03` → `go test ./... -run 'TestEditorPathValidation'`
- `AC-04` → `go test ./... -run 'TestEditorAtomicSave|TestEditorAtomicFailure'`
- `AC-05` → `go test ./... -run 'TestEditorStaleDigest'`
- `AC-06` → `go test ./... -run 'TestEditorDiagnostics'`
- `AC-07` → `go test ./... -run 'TestEditorRebuild|TestEditorWatcher'`
- `AC-08` → `go test ./... -run 'TestEditorPollingStateMachine|TestEditorAssetsContract'`
- `AC-09` → `go test ./... -run 'TestEditorKeyboardAndDirtyGuards|TestEditorAssetsContract'`
- `AC-10` → `go test ./... -run 'TestEditorResponsiveContract|TestEditorAssetsContract'`
- `AC-11` → `go test ./... -run 'TestEditorPreviewAndRaw'`
- `AC-12` → `go test ./... -run 'TestScaffoldRegistryParity|TestEditorCreate'`
- `AC-13` → `go test ./... -run 'TestEditorJSONContract|TestEditorLimits'`
- `AC-14` → `go test ./... -run 'TestEditorWriteGuards|TestEditorCannotExecuteCommands'`
- `AC-15` → `go test ./... -run 'TestEditorAPIContract'`
- `AC-16` → `go test ./... -run 'TestEditorVendoredAssets'`
- `AC-17` → `go test ./... && go test -race ./... && go run ./cmd/docu-docu check ./docs --strict --stale-days 0 && GOOS=windows GOARCH=amd64 go test -c -o /tmp/docu-docu-editor-windows.test . && GOOS=darwin GOARCH=amd64 go build -o /tmp/docu-docu-editor-darwin ./cmd/docu-docu && GOOS=linux GOARCH=amd64 go build -o /tmp/docu-docu-editor-linux ./cmd/docu-docu && test -s build/editor-qa/report.md && test -s build/editor-qa/semantic-review.txt`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root .`
- `QUALITY` → `go vet ./... && go test ./... && go test -race ./... && go run ./cmd/docu-docu check ./docs --strict --stale-days 0`

## Влияние на документацию

Обновляются use case и flow режима serve, Site/CLI/Model contracts, runtime и
trust boundaries, README, feature/configuration references и changelog.
Добавляется отдельный editor HTTP contract; новая архитектурная страница не
нужна, потому что новые вопросы принадлежат существующим источникам истины.
