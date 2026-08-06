# TASK-SITE-003: Разделить Go-ядро и frontend-слой портала

- Статус: Выполнено
- Тип: Feature
- Приоритет: Высокий
- Модуль: MOD-SITE
- Сценарий: UC-DOCS-01
- Процесс: FLOW-DOCS-BUILD
- Экраны: SC-SITE-HOME, SC-SITE-DOCUMENT, SC-SITE-USE-CASE, SC-SITE-SCREEN-MAP, SC-SITE-EDITOR, SC-CHANGES-WORKSPACE
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Docu-docu
- Последнее обновление: 2026-08-06

## Результат

Пользователь получает один автономный Go-бинарник Docu-docu: `build` создаёт
read-only multi-page портал для обычного HTTP(S) static hosting без работающего
backend, а существующий `serve` добавляет локальный editor/changes/rebuild
runtime. Go остаётся единственным источником проектной модели и доверенной
границей файловой системы, Git и task verification; TypeScript/CSS образуют
отдельно собираемый presentation-слой и встраиваются в бинарник как готовые
assets.

## Изменение поведения

### Было

HTML shell и крупные фрагменты отдельных workspace-страниц собираются рядом с
application logic строками в `internal/app`; CSS и browser JavaScript лежат в
`internal/app/assets`, имеют несколько несвязанных entrypoints и частично
полагаются на глобальные переменные и DOM markers. Статический портал обещает
полную работу через `file://`, поэтому search data выдаётся как исполняемый JS,
а frontend ограничен этим контрактом. Существующая Node-сборка обслуживает
отдельные vendored bundles, но не образует самостоятельный frontend workspace.

### Станет

Go строит Project Model, page view models, безопасный HTML shell, bootstrap JSON,
static data и serve-only API DTO, а независимый `web/` на TypeScript strict и
обычном CSS реализует presentation и browser behavior. Собранные deterministic
assets сохраняются в репозитории и встраиваются через `go:embed`; Node.js нужен
только разработчику frontend. `build` не содержит editor/API/rebuild code и
работает без backend на root или nested HTTP(S) path. `serve` использует тот же
renderer и базовый frontend, явно добавляя capability-gated server bundles и
same-origin endpoints. `file://` удаляется из поддерживаемого и проверяемого
продуктового контракта, а локальная работа документируется через
`docu-docu serve`.

Не требуется сохранять текущую внутреннюю раскладку пакетов, Go-функций,
HTML-фрагментов, DOM hooks, глобальных browser API и имён прежних assets.
Сохраняются явно заданные продуктовые границы: команды `build` и `serve`, их
пользовательские flags и exit codes, stable ID-based routes и существующие JSON
schemas. Новая команда `preview` не появляется.

## Область изменения

- новый frontend workspace web/ с TypeScript/CSS source, lockfile, esbuild,
  typecheck, unit и browser tests;
- новый изолированный site-слой в internal/site/ и необходимые изменения в
  `internal/app/` для переноса renderer, view models, static data, routes,
  bootstrap, serve runtime и удаления старой UI-генерации;
- `api.go`, `cmd/docu-docu/` и другие существующие Go integration points только
  в объёме подключения нового site-слоя без переноса project logic в browser;
- `internal/site/assets/generated/`, manifest и `go:embed`; прежние
  frontend assets, root package files,
  `editor-bundle.mjs` и `swagger-ui-vendor.mjs` мигрируются или удаляются после
  полного cutover;
- `Makefile`, `.github/workflows/` и при необходимости release scripts для
  канонических frontend build/check, committed-assets gate и обычной Go-сборки
  без Node.js;
- Go, frontend contract, unit, security и browser smoke tests;
- `README.md`, `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md`;
- `docs/architecture/overview.md` и новый
  `docs/architecture/frontend-runtime-boundary.md`;
- `docs/modules/site.md`, `docs/use-cases/build-portal.md`,
  `docs/use-cases/serve-portal.md`, `docs/flows/FLOW-DOCS-BUILD.md` и
  `docs/flows/FLOW-DOCS-SERVE.md`;
- `docs/contracts/cli.md`, а `docs/contracts/editor-http.md`,
  `docs/contracts/changes-http.md` и соответствующие OpenAPI sources — только
  если меняется их wire contract или runtime availability;
- `docs/reference/features.md`, `docs/reference/api.md` и
  `docs/reference/configuration.md` только при появлении конфигурации;
- `docs/guides/testing.md`, новый `docs/guides/deployment.md`, новый
  `docs/guides/local-workflow.md` и новый
  `docs/guides/frontend-development.md`;
- отслеживаемые generated portals только через пересборку после semantic и
  structural gates.

## Не входит в задачу

- перенос Markdown parsing, document classification, validation, relationship
  resolution, readiness, semantic diff, path normalization, permission checks,
  Git comparison или verification mapping в TypeScript;
- вторая TypeScript-модель документации, SPA, client-side router или обязательная
  клиентская маршрутизация;
- React, Vue, Svelte или другой application framework без отдельного ADR;
- Node.js, npm, frontend dev server, CDN, database или внешний backend как
  runtime-зависимость пользователя или release archive;
- новая команда `preview`, отдельный static-server command или обязательный
  `baseURL` parameter;
- editor API, rebuild API client, server URL, write action или task execution в
  static output;
- изменение правил editor workspace, path/symlink/CAS/size guards, Git read-only
  semantics или разделения `task verify --run` и неисполняющих команд;
- custom CSS, web fonts, theme plugins, пользовательский JavaScript plugin API,
  cloud backend, authentication и remote collaboration;
- полный визуальный редизайн страниц: задача вводит архитектурную границу,
  tokens и базовые reusable components, а не новую визуальную концепцию;
- поддержка и CI-проверка прямого открытия generated `index.html` через
  `file://`; случайное отображение базового HTML не блокируется намеренно;
- сохранение текущей внутренней package/DOM/asset реализации после завершения
  миграции.

## Критерии приёмки

- [x] `AC-01` Go остаётся единственным источником Project Model, diagnostics,
  document relationships, task readiness и semantic diff; frontend принимает
  только подготовленные view values, static data, bootstrap и API DTO и не
  содержит запрещённых project/security правил.
- [x] `AC-02` Централизованный Go renderer использует `html/template`,
  типизированные page view models и partials вместо крупных HTML-конкатенаций в
  HTTP handlers; основной Markdown content присутствует в исходном HTML и
  остаётся читаемым при ошибке JavaScript.
- [x] `AC-03` Каждая интерактивная страница получает безопасно сериализованный
  bootstrap contract со `schemaVersion`, `runtime`, relative asset/data bases,
  locale/appearance и explicit capabilities; absolute filesystem paths не
  сериализуются, неизвестные поля игнорируются, optional fields не обязательны.
- [x] `AC-04` `web/` использует TypeScript strict, standard DOM API, обычный CSS,
  CSS custom properties, esbuild и `tsc --noEmit`; команды `npm run typecheck`,
  `npm run test`, `npm run build`, `npm run watch`, `make web` и
  `make web-check` являются каноническими и воспроизводимыми.
- [x] `AC-05` Frontend build детерминированно создаёт manifest, `portal.css`,
  `portal.js`, `serve.js`, `editor.js`, `changes.js` и необходимые content-based
  chunks в `internal/site/assets/generated/`; assets закоммичены, не содержат
  timestamps/random values и доступны Go renderer только через manifest.
- [x] `AC-06` `go build ./...` после clone не требует Node.js и включает только
  готовые browser assets через `go:embed`; TypeScript source и `node_modules` не
  входят в бинарник, а CI завершается ошибкой при расхождении generated assets
  и frontend source.
- [x] `AC-07` `docu-docu build` создаёт backend-independent read-only MPA со
  всеми HTML, CSS, JavaScript, JSON и локальными assets; output не содержит
  editor/rebuild clients, server-only markup, API URLs, localhost, внешние
  runtime-запросы, write actions или task-command execution.
- [x] `AC-08` Static output работает через обычный HTTP(S) как в корне, так и во
  вложенных путях; document links, manifest assets, dynamic chunks и static JSON
  разрешаются относительно переданных Go base paths без жёстких `/assets/` или
  `/data/` и без обязательного `baseURL`.
- [x] `AC-09` Search index и дополнительные navigation/relations/screens/use-case
  JSON создаются из той же Go Project Model как производные данные, загружаются
  относительным `fetch` и не содержат secrets, environment, absolute paths,
  editor digests или repository context вне разрешённой documentation model.
- [x] `AC-10` `docu-docu serve` использует тот же renderer и `portal.js`, но
  Go явно включает `serve`, `editor`, `changes`, `rebuild` и `taskWorkspace`
  capabilities и только нужные bundles; endpoints приходят из Go bootstrap,
  остаются same-origin и не вычисляются frontend из URL или filesystem paths.
- [x] `AC-11` Portal, serve, editor и changes bundles изолированы технически:
  static runtime не может обратиться к server API, тяжёлые features загружаются
  лениво только при наличии capability/страницы, а ошибка Mermaid, editor preview
  или specialized diff не скрывает Markdown content и доступный source diff.
- [x] `AC-12` Общие tokens и компоненты Button, IconButton, Badge, Tabs,
  Disclosure, Dialog, Tooltip, CommandMenu, Tree, DataTable, EmptyState,
  Diagnostic и DiffBlock не знают о canonical Project Model; theme,
  colorScheme, accent, density и contentWidth сохраняют семантику, а keyboard,
  focus, Escape, arrow keys, reduced motion и non-color states покрыты тестами.
- [x] `AC-13` Frontend определяет document/page kind только по стабильным
  идентификаторам `document`, `architecture`, `module`, `use-case`, `flow`,
  `screen`, `standard`, `runbook` и `task`, не классифицирует страницу по H1 и
  получает пользовательские подписи из централизованного locale catalog без
  ветвления business logic компонентов по языку.
- [x] `AC-14` Bootstrap, static data и serve features имеют изолированные
  состояния bootstrap unavailable, unsupported schema, static JSON unavailable,
  diagram render failed, API unavailable, rebuild failed, save conflict, file
  unavailable, diff payload unavailable, empty collection и capability
  unavailable; сбой одного компонента не скрывает основной Markdown content.
- [x] `AC-15` Security regression покрывает Markdown/script injection, опасные
  URL, HTML termination в bootstrap JSON, отсутствие server API и absolute
  paths в static output, oversized/stale editor writes и невозможность запуска
  work item command через UI; существующие Go path, symlink, CAS, size и command
  guards не ослаблены.
- [x] `AC-16` Публичные команды `build` и `serve`, существующие flags/exit codes,
  stable ID-based routes, `ProjectReport`, `ChangeSetReport` и
  `TaskVerifyReport` schemas сохраняются; `preview` отсутствует. Совместимость
  внутренних Go/UI implementation details не проверяется.
- [x] `AC-17` Browser smoke запускает static output через обычный HTTP server и
  проверяет home, nested document, CSS/JS, search, appearance, use-case tabs,
  Mermaid success/fallback и повторяет сценарий под nested URL path; `file://`
  в тестах отсутствует.
- [x] `AC-18` Browser smoke `serve` проверяет rebuild, editor open/save/CAS
  conflict, changes source/semantic/rendered diff degradation и недоступность
  server-only функций без capability.
- [x] `AC-19` README, build/local-workflow/deployment/frontend guides, module,
  use cases, flows, architecture question map, release/migration notes и
  применимые contracts/references описывают `serve` для локальной работы и
  `build + static HTTP hosting` для публикации и больше не обещают `file://`;
  regression test проверяет canonical public sources и исключает исторические
  work items и release records из запрета.
- [x] `AC-20` После cutover в repository нет старых inline scripts, мёртвых CSS
  selectors, дублирующей browser logic или параллельных старого и нового UI;
  лицензии/уведомления новых frontend dependencies актуальны, а полный Go,
  frontend, browser, security и documentation regression проходит.

## План

- [x] Зафиксировать inventory текущих assets, HTML string generation, DOM/URL
  hooks и static/serve-only behavior; добавить browser smoke baseline до смены
  контракта.
- [x] Выделить Go application/site boundary, page view models,
  `html/template` renderer, partials и versioned bootstrap contract; сохранить
  Project Model источником всех представлений.
- [x] Создать `web/`, strict TypeScript/CSS structure, component primitives,
  esbuild manifest и deterministic generation в embedded assets; перенести
  базовый portal behavior без визуального redesign.
- [x] Добавить static JSON resources и единое relative asset/data resolution,
  перевести browser tests на HTTP и nested path, удалить `file://` из product
  contract без добавления новой CLI-команды.
- [x] Разрезать entries и capabilities на `portal`, `serve`, `editor`, `changes`
  и lazy feature chunks; доказать отрицательными тестами отсутствие server-only
  кода и URL в static output.
- [x] Перенести editor, changes, task workspace, diagrams и screen/use-case
  interaction на новый frontend contract, не меняя Go security и model
  responsibilities.
- [x] Ввести design tokens, общие accessible components и унифицированные
  loading/empty/error states при сохранении существующих appearance settings;
  вынести подписи в locale catalog и использовать stable page-kind IDs вместо
  анализа H1 или локализованного DOM.
- [x] Настроить `make`/CI regeneration gate, Go-only clone build, frontend unit
  и browser suites, static/serve/security regression и reproducibility check.
- [x] Выполнить единый cutover: удалить legacy UI generation/assets и исключить
  временную дублирующую реализацию из итоговой ветки.
- [x] Обновить все перечисленные источники истины, добавить отдельный
  architecture question document и прямую ссылку из overview, обновить release
  и migration notes, затем пройти semantic и structural gates.

## Проверка

- `AC-01` → `go test ./...`
- `AC-02` → `go test ./...`
- `AC-03` → `go test ./... && make web-check`
- `AC-04` → `make web-check`
- `AC-05` → `make web && git diff --exit-code -- internal/site/assets/generated`
- `AC-06` → `go build ./... && make web-check`
- `AC-07` → `go test ./...`
- `AC-08` → `make browser-test`
- `AC-09` → `go test ./... && make browser-test`
- `AC-10` → `go test ./... && make browser-test`
- `AC-11` → `make test && make browser-test`
- `AC-12` → `make web-check && make browser-test`
- `AC-13` → `make web-check && make browser-test`
- `AC-14` → `make web-check && make browser-test`
- `AC-15` → `go test ./... && make browser-test`
- `AC-16` → `go test ./...`
- `AC-17` → `make browser-test`
- `AC-18` → `make browser-test`
- `AC-19` → `go test ./... -run 'TestFileProtocolPublicContract|TestStaticHTTPDocumentationContract' && go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `AC-20` → `make check && make web-check && make browser-test && go run ./cmd/docu-docu build ./docs --repository-root . --clean`
- `ALL` → `make check && make web-check && make browser-test && make build`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `go vet ./... && go test ./... && go test -race ./... && go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`

## Влияние на документацию

Изменяется продуктовый контракт портала: автономность означает отсутствие
backend после `build`, но публикация и интерактивные static data требуют
обычного HTTP(S). Обновляются архитектурная карта и отдельный ответ о границе
Go/frontend, `MOD-SITE`, build/serve use cases и flows, README, CLI/features/API
references, testing/deployment/frontend development guides, root
`CHANGELOG.md` и notices. Editor/Changes Markdown/OpenAPI contracts и
configuration reference меняются только при фактическом изменении wire
contract, runtime availability или параметров. Translation roots не входят в
implementation и documentation context этой задачи и обновляются только
отдельным явным locale workflow.
