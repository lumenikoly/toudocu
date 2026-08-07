# Статический портал

- Идентификатор: MOD-SITE
- Статус: Готово
- Владелец: Команда Docu-docu
- Последнее обновление: 2026-08-06

Модуль формирует backend-independent HTML-страницы, навигацию, статические
JSON-ресурсы и типизированный `report.json` из готовой проектной модели.

## Назначение

Сделать проектную документацию удобной для человека на обычном HTTP(S) static
hosting или через локальный `serve` и одновременно предоставить полную модель
CI и агентам.

## Расположение в коде

- application services и отчёт: `internal/app/site.go`, `internal/app/report_types.go`;
- типизированный bootstrap, templates, asset manifest и embed:
  `internal/site/`;
- frontend source и независимая сборка: `web/src/`, `web/build.mjs`;
- производные встроенные assets: `internal/site/assets/generated/`;
- каталоги процессов и use cases: `internal/app/process_site.go`;
- Screen Map, каталог и страницы экранов: `internal/app/screen_site.go`;
- локальная HTTP-раздача и offline API docs: `internal/app/server.go`,
  `internal/app/api_docs.go`;
- editor workspace, API и platform-specific atomic replace: `internal/app/editor_*.go`;
- общая оболочка Editor и Changes: `internal/site/workspace.go`;
- конфигурация тем и безопасного брендинга: `internal/app/site_config.go`.

## Границы

Статическая генерация не валидирует бизнес-сущности повторно и не редактирует
Markdown. Только явный режим `serve` предоставляет workspace-операции, после
которых заново строит модель модулем `MOD-MODEL`.

## Бизнес-правила

### BR-SITE-001: Очистка output не затрагивает защищённые каталоги

`--clean` запрещает системный корень, исходную документацию, её родительские
каталоги и прямые output-симлинки. Решение принимается по раскрытым путям.

### BR-SITE-002: Портал работает на static HTTP hosting

Результат `build` не требует Docu-docu backend, базы данных, Node.js, CDN или
внешнего runtime. HTML, CSS, JavaScript и JSON находятся в output, используют
относительные URL и работают как в корне HTTP(S) host, так и во вложенном
URL-пути. Прямое открытие через `file://` не является гарантированным
продуктовым контрактом.

### BR-SITE-003: Dev-сервер не раскрывает исходный репозиторий

Обычные маршруты `serve` раздают только output-каталог. Отдельный editor API
разрешает обычные `.md`, `.yaml`, `.yml` и `.json` только внутри docs root,
исключает hidden/excluded/output и symlink paths и не открывает остальной
репозиторий. По умолчанию listener использует loopback; `--host 0.0.0.0`
явно включает доступных клиентов локальной сети в trust boundary.

### BR-SITE-004: Mermaid работает автономно и в строгом режиме

Закреплённый classic bundle Mermaid Tiny копируется из `go:embed`, загружается
только при приближении диаграммы к viewport и запускается с `securityLevel: strict`.
Ошибка синтаксиса не ломает страницу: портал показывает сообщение и исходный
код диаграммы.

### BR-SITE-005: Карта экранов работает автономно

Карта, фильтры, SVG-связи, масштабирование, pan, боковая панель и пошаговый
viewer работают на локальных JavaScript и CSS без CDN и backend-запросов.

«Пользовательские сценарии» являются самостоятельным верхнеуровневым разделом
для `UC-*`, а «Процессы» — единственный каталог документов `FLOW-*` по адресу
`processes/index.html`. Каноническая страница use case объединяет
описание, карту, проигрывание и связи. Раздел «Экраны» открывает каталог
`SC-*`; общая карта доступна отдельным пунктом, когда её генерация включена.
Карточки показывают число входящих и исходящих переходов. Типы переходов
различаются формой линии; hotspots проявляются при наведении и фокусе, а
terminal screen содержит ссылки на карту и описание use case.

Основная навигация следует стабильному порядку реестра встроенных разделов;
она не зависит от порядка обхода Go map. Названия built-in разделов берутся из
`project.sections`, а `flows` выводится маршрутом `processes`.

### BR-SITE-006: Темы не расширяют доверенную поверхность

`classic`, `paper` и `terminal`, их токены, переключатель цветовой схемы,
fallback favicon и браузерные ресурсы встроены через `go:embed`. Конфигурация
выбирает только фиксированные варианты; custom CSS, fonts и theme plugins не
загружаются.

Пользовательские logo, favicon и hero читаются только как обычные файлы из
`.docu-docu/assets/`, проверяются при построении модели и копируются в
`assets/branding/`. `build`, `check` и `serve` используют одну диагностику и
остаются offline-first.

### BR-SITE-007: Build и serve имеют разные возможности

`GenerateSite` всегда создаёт backend-independent read-only результат для
static HTTP hosting без editor markup, API UI, Swagger UI, CodeMirror и
server-only rebuild code. Он
копирует найденные OpenAPI specs как обычные portal assets. `serve` отдельно
добавляет live workspace, editor/source actions, polling, API, watcher и
vendored Swagger UI для canonical contracts.

### BR-SITE-008: Запись защищена optimistic concurrency

Содержимое идентифицируется SHA-256 digest. Save проверяет digest до и после
записи same-directory temp, сохраняет mode, синхронизирует данные и атомарно
заменяет исходник. Конфликт не теряет local text и требует отдельного overwrite
с актуальным digest и явным `confirmOverwrite`; при удалении исходника dirty
buffer можно скачать. Diagnostics не блокируют сохранение.

### BR-SITE-009: Locale portals изолированы от canonical workspace

При запуске `serve` из canonical root configured `translations.<locale>`
создают независимые read-only snapshots по `/_docu-docu/locales/<locale>/`.
Переключатель получает URL только из server-computed targets: Markdown
сопоставляется по relative source path, generated page — по существующему
output path, иначе используется locale homepage. Locale mount не получает
editor, changes API, rebuild controls, source paths или canonical workspace.
`build` и `serve` непосредственно на translation root остаются
одноязычными и read-only: server не добавляет editor markup, write API или
rebuild controls.

### BR-SITE-010: Мягкая навигация ограничена canonical serve portal

Только canonical portal режима `serve` перехватывает обычные same-origin
переходы между HTML-документами. Он заранее загружает до восьми последних
страниц после pointer hover или keyboard focus, проверяет workspace revision и
заменяет документную оболочку без rebuild. Back/Forward, anchors, восстановление
scroll и фокус main сохраняют браузерную семантику. Editor, changes, API,
locale, external и специальные переходы всегда остаются полной навигацией;
ошибка сети, неподходящий HTML или новая revision также приводят к полной
загрузке.

Поисковый индекс загружается только при первом обращении к поиску и сохраняется
в памяти между мягкими переходами. Mermaid bundle загружается при приближении
первой диаграммы и повторно используется до полной загрузки страницы.

### BR-SITE-011: API docs остаётся offline и read-mostly

`/_docu-docu/api-docs/` существует только у canonical `serve`, использует
same-origin specs и закреплённый Swagger UI 5.32.12 без CDN. CSP запрещает
external network, а Try it out доступен только для `GET`/`HEAD`. Locale mounts,
direct translation serve и static build не содержат UI, assets или navigation.

### BR-SITE-012: Рабочие поверхности используют единое оформление

Canonical portal режима `serve`, Editor и Changes используют одинаковые
ключи `localStorage` для `classic`/`paper`/`terminal` и
`system`/`light`/`dark`. Общий блокирующий `appearance.js` до загрузки CSS
применяет сохранённые theme, scheme, accent, density и content width и
публикует `docu-docu:themechange` при последующих изменениях. Отложенные
surface bundles не повторяют эту инициализацию.

Editor и Changes получают общий header с project branding, навигацией
«Портал / Редактор / Изменения», активным `aria-current` и селекторами темы.
Их рабочие действия остаются в отдельной контекстной панели. CodeMirror
переключает theme compartment без пересоздания editor state, а активный
Mermaid diff перерисовывается без сброса отчёта, фильтров и URL state.

### BR-SITE-013: Go явно задаёт frontend capabilities

Каждая страница содержит безопасно сериализованный `application/json` bootstrap
со `schemaVersion`, runtime, page reference, относительными asset/data bases и
capabilities. Static runtime всегда выключает `editor`, `changes`, `rebuild` и
`taskWorkspace`. Serve-only endpoints присутствуют только в serve bootstrap и
остаются same-origin. Frontend игнорирует неизвестные поля, но явно показывает
ошибку при отсутствии bootstrap или неподдерживаемой версии схемы.

### BR-SITE-014: Roadmap изменяется только ограниченной операцией

Canonical `serve` добавляет действие только на странице `roadmap.md` и только
для нового незавершённого `DLV-*` в существующем H2-этапе. Go возвращает этапы,
проверяет ID и текст тем же правилом одного roadmap ID, выполняет digest CAS и
точечную atomic insertion с сохранением перевода строк. Frontend не разбирает
Markdown и не решает допустимость записи. `build`, locale portals и direct
translation serve остаются read-only.

## Инварианты

- исходный `index.md` отображается dashboard, а не дублирующей страницей:
  главная последовательно показывает сведения о проекте, компактный текущий
  фокус, не более пяти рекомендуемых точек входа и содержательную часть
  `index.md` без повторения H1 и структурных metadata внутри постоянно
  видимого подробного обзора;
- текущий фокус существует только при наличии roadmap, work items или рисков,
  ведёт от следующего результата к целевому документу и показывает текстом
  количество активных задач, блокеров и открытых рисков, включая нулевые
  состояния; подробные элементы остаются на статусной странице и в каталогах;
- страницы исходных Markdown-документов, включая dashboard и канонический
  use case, позволяют скопировать название и безопасный путь к исходнику;
  действия dashboard находятся внутри постоянно видимого обзора, а в `serve` там же
  доступны редактор, исходник и изменения;
- боковая навигация окрашивает значок типа по распознанному статусу документа,
  а для `TASK-*` и `BUG-*` дополнительно различает невыполненное `☐` и
  выполненное `☑`; текстовая подпись статуса остаётся доступной независимо от
  цвета;
- активная группа навигации раскрывается, остальные группы по умолчанию
  свёрнуты, а явный выбор пользователя сохраняется локально;
- dashboard не дублирует полный каталог, подробные roadmap и risk cards или
  списки активных задач; полный обзор документов обеспечивают глобальный поиск,
  боковая навигация и каталоги разделов;
- подробный обзор всегда показывает содержательную часть `index.md`, а печатная
  версия сохраняет её целиком;
- каталоги, Screen Map, traceability и health page не выдают синтетический
  контекст документа;
- в canonical `serve` общий surface navigation открывает portal, Editor и
  Changes полной навигацией, а rebuild остаётся отдельным портальным действием;
  в static output специальных маршрутов, действий и serve-only assets нет;
- compact navigation сохраняет доступные названия у 40×40 control surfaces;
  контекстные панели складываются без горизонтального overflow страницы, а
  локальная прокрутка остаётся у дерева, метрик и diff;
- save/create и стабильное внешнее изменение обновляют model, HTML, search,
  diagnostics и workspace revision синхронно;
- обычный HTTP request не запускает rebuild; watcher публикует snapshot только
  после успешной сборки, а locale rebuild не меняет canonical editor или changes state;
- мягкий переход в canonical `serve` не запускает rebuild и принимает HTML
  только с текущей workspace revision; watcher и ручная пересборка завершаются
  полной перезагрузкой, которая синхронизирует runtime и snapshot;
- обычная страница не загружает поисковый индекс или Mermaid до обращения к
  поиску либо приближения диаграммы к viewport;
- Screen Map и playable flow повторно инициализируются для нового layout; при
  замене DOM предыдущий page lifecycle отменяет listeners и observers;
- serve-only roadmap dialog повторно инициализируется после мягкого перехода,
  сохраняет поля при CAS conflict и не блокирует чтение страницы при ошибке API;
- конфликт служебного output получает отдельный безопасный путь;
- `ProjectReport` и HTML строятся из одной модели;
- сгенерированные файлы не становятся источником истины.

## Стабильные интерфейсы

- `GenerateSite`;
- `BuildReport`;
- CLI-команда `serve`;
- [Editor OpenAPI](../contracts/editor.openapi.yaml) и [Changes OpenAPI](../contracts/changes.openapi.yaml);
- [поведение Editor API](../contracts/editor-http.md) и [Changes API](../contracts/changes-http.md);
- `ProjectReport` schema v1;
- HTML entrypoint `index.html` и машинный `report.json`.

## Связанные сценарии

- [UC-DOCS-01: Сборка портала](../use-cases/build-portal.md)
- [UC-DOCS-03: Локальный сервер](../use-cases/serve-portal.md)
- [UC-DOCS-04: Карта экранов](../use-cases/screen-map.md)

## Связанные процессы

- [FLOW-DOCS-BUILD: Сборка статического HTTP-портала](../flows/FLOW-DOCS-BUILD.md)
- [FLOW-DOCS-SERVE: Локальный просмотр портала](../flows/FLOW-DOCS-SERVE.md)
