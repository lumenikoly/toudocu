<!-- toudocu
version: 1
id: TASK-SITE-002
status: done
taskType: feature
priority: high
module: MOD-SITE
useCase: UC-DOCS-03
flow: FLOW-DOCS-SERVE
transitions: TR-SITE-001, TR-SITE-002, TR-SITE-003
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-10
-->

# TASK-SITE-002: Редактирование исходной документации через serve

<!-- toudocu:section result -->
## Результат

Задача добавила в `toudocu serve` локальную рабочую область. В ней можно
открывать и создавать исходные документы, видеть предпросмотр и
диагностические сообщения, а после сохранения получать обновлённые страницы и
поиск.

<!-- toudocu:section behavior-change -->
## Изменение поведения

<!-- toudocu:section before -->
### Было

`serve` пересобирал портал при открытии HTML и по отдельной кнопке, но не давал
доступа к исходникам. Внешнее изменение становилось видно лишь при следующем
просмотре или ручной пересборке.

<!-- toudocu:section after -->
### Станет

`serve` включает защищённый API редактора с тем же origin, отдельный интерфейс,
пересборку после записи и наблюдение за внешними изменениями. Результат
`build` не получает разметку редактора, локальные скрипты сервера и ссылки на
API.

<!-- toudocu:section scope -->
## Область изменения

- сервер, модель документации и рабочая область редактора в `internal/app/`;
- генерация варианта портала для `serve`;
- общий реестр шаблонов создания документов;
- встроенные браузерные ресурсы и закреплённая сборка CodeMirror;
- тесты сервера, записи, интерфейса и поддерживаемых платформ;
- связанные пользовательские сценарии, процессы, модули, контракты,
  архитектурные документы, справочники, README и журнал изменений.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

- изменение смысла `--host`, `--port`, `--open` и автоматического открытия;
- параметры `--no-open` и `--edit`;
- редактор или API редактора в результате `build`;
- TLS, отдельная аутентификация, CORS и удалённое совместное редактирование;
- запуск Git, оболочки, `task verify` или любых других команд через API;
- общая проверка схемы произвольного YAML.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` `GenerateSite` всегда создаёт статический портал, а вариант
  `serve` отдельно добавляет действия редактирования и ресурсы сервера.
- [x] `AC-02` Рабочая область перечисляет только обычные `.md`, `.yaml`,
  `.yml` и `.json` внутри корня документации, включая
  `screens/hotspots.json`. Скрытые, исключённые и выходные каталоги, пути через
  символические ссылки и файлы других типов не показываются.
- [x] `AC-03` API принимает только канонические относительные POSIX-пути и
  отклоняет абсолютные пути, `..`, обратную косую черту, NUL и закодированные
  варианты выхода из каталога.
- [x] `AC-04` Чтение и запись используют SHA-256. При сохранении сохраняются
  права файла, временный файл синхронизируется, хеш проверяется повторно, а
  исходник заменяется атомарно средствами текущей ОС. Каждый компонент пути
  снова проверяется на символические ссылки или reparse points.
- [x] `AC-05` Устаревший хеш даёт `409 stale_digest`. Принудительная
  перезапись возможна только вторым запросом с хешем из ответа о конфликте и
  `confirmOverwrite: true`; новый конфликт снова возвращает `409`.
- [x] `AC-06` Для Markdown диагностические сообщения строятся по полной модели
  с несохранённым текстом открытого файла. JSON получает сообщения о синтаксисе
  и hotspots, YAML — только доступные проверки Toudocu. Сообщения не запрещают
  сохранение.
- [x] `AC-07` Создание и сохранение вместе обновляют модель, HTML, поиск и
  номер версии. Наблюдатель с опросом 750 мс и стабилизацией 200 мс замечает
  внешние изменения.
- [x] `AC-08` Браузер проверяет версию файлов через ETag раз в две секунды и
  без потери текста различает обычное обновление и конфликт несохранённого
  файла.
- [x] `AC-09` Редактор содержит дерево файлов, путь, признак несохранённых
  изменений, сохранение, режимы «Редактор», «Предпросмотр» и «Вместе», переходы
  по сообщениям, `Ctrl/Cmd+S` и предупреждение при уходе с несохранённым
  текстом.
- [x] `AC-10` На телефоне боковая панель открывается поверх содержимого, а
  разделённый режим превращается в одно представление. Основные действия
  доступны с клавиатуры.
- [x] `AC-11` Предпросмотр Markdown использует общий безопасный обработчик. Для
  остальных форматов возвращается `preview_not_supported`, а исходник можно
  открыть только для чтения как `text/plain`.
- [x] `AC-12` `task init` и семь видов `scaffold` используют один
  упорядоченный реестр. CLI и браузер применяют одинаковые проверки, пути и
  шаблоны; создание файла остаётся атомарным через `O_EXCL`.
- [x] `AC-13` Все JSON-ответы редактора содержат `schemaVersion: 1`,
  `no-store` и единый формат ошибки. Некорректный JSON, неизвестные поля,
  лишние данные после JSON, тело больше 3 MiB и содержимое больше 2 MiB
  отклоняются.
- [x] `AC-14` Для записи нужны JSON, `X-Toudocu-Action` и запрос с того же
  origin. CORS не включён, а команды запускать нельзя. При сервере не на
  loopback оператор явно доверяет клиентам локальной сети: браузерная защита
  не является аутентификацией прямого HTTP-клиента.
- [x] `AC-15` `/files`, `/file`, `/preview`, `/validate`, `/create`, ETag,
  `304`, данные, статусы и ошибки соответствуют
  [CONTRACT-EDITOR-HTTP](../contracts/editor-http.md).
- [x] `AC-16` Закреплённая сборка CodeMirror, лицензии и контрольные суммы
  встроены в Go. Пользователю Node.js не нужен.
- [x] `AC-17` Документация проводит границу между статическим `build` и
  интерактивным `serve`; серверные, конкурентные, отрицательные, платформенные
  и браузерные сценарии были включены в проверку задачи.

<!-- toudocu:section plan -->
## План

- [x] Разделить статическую генерацию и вариант для `serve`.
- [x] Добавить безопасную рабочую область, диагностику с несохранённым текстом
  и атомарную запись с проверкой хеша.
- [x] Реализовать HTTP API редактора, пересборку и наблюдатель.
- [x] Вынести общий реестр шаблонов.
- [x] Встроить CodeMirror и сделать интерфейс адаптивным.
- [x] Добавить отрицательные, конкурентные и сквозные тесты.
- [x] Обновить связанные источники документации и порталы.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `TR-SITE-001` → `TestDashboardFocusFallbacksAndAlwaysVisibleOverview`
- `AC-09` → `TR-SITE-002` → `TestServeSiteIncludesEditor`
- `AC-17` → `TR-SITE-003` → `TestServeSiteIncludesEditor`
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
- `AC-17` → `go test ./... && go test -race ./... && go run ./cmd/toudocu check ./docs --strict --stale-days 0 && GOOS=windows GOARCH=amd64 go test -c -o /tmp/toudocu-editor-windows.test . && GOOS=darwin GOARCH=amd64 go build -o /tmp/toudocu-editor-darwin ./cmd/toudocu && GOOS=linux GOARCH=amd64 go build -o /tmp/toudocu-editor-linux ./cmd/toudocu && test -s build/editor-qa/report.md && test -s build/editor-qa/semantic-review.txt`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root .`
- `QUALITY` → `go vet ./... && go test ./... && go test -race ./... && go run ./cmd/toudocu check ./docs --strict --stale-days 0`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Были обновлены сценарий и процесс `serve`, контракты Site/CLI/Model, границы
системы и доверия, README, справочники возможностей и конфигурации и журнал
изменений. Добавлен отдельный HTTP-контракт редактора.

## Последующее изменение

[TASK-SITE-003](TASK-SITE-003.md) заменил прежнее обещание работы статического
портала через `file://`. Текущее правило: `build` создаёт портал для обычного
HTTP(S)-размещения, а `serve` остаётся гарантированным способом локального
просмотра и редактирования. Актуальный пользовательский путь описан в
[UC-DOCS-03](../use-cases/serve-portal.md).
