# Каталог возможностей

Страница перечисляет реализованные возможности Docu-docu и указывает, где
зафиксирован их подробный контракт. Источником истины остаются Markdown-файлы:
JSON и результат `build` не хранят отдельную модель и не редактируют исходники;
только `serve` добавляет явные операции записи в canonical workspace.

Быстрые точки входа: [единая карта API и программных интерфейсов](api.md) и
[интерактивная Screen Map](../screens/).

## CLI

- Git-backed `changes`, `changes file` и `task changes` для working tree,
  index, revisions и branch merge-base; text, JSON и Markdown reports.
- В `serve`: unified/CodeMirror merge/rendered/semantic diff, OpenAPI,
  Mermaid, assets, screen-map overlay и task impact.

Docu-docu поставляется одним Go-бинарником без внешних runtime-зависимостей.

| Возможность | Команда | Результат |
|---|---|---|
| Проверка проекта | `docu-docu check ./docs` | diagnostics или `ProjectReport` |
| Строгая проверка | `docu-docu check ./docs --strict` | warning также даёт exit code `1` |
| Сборка портала | `docu-docu build ./docs` | автономный HTML и `report.json` |
| Локальный workspace | `docu-docu serve ./docs` | view/edit, editor API, watcher и live rebuild |
| Просмотр изменений | `docu-docu changes ./docs` | text, Markdown или `ChangeSetReport` v1 |
| Изменение одного файла | `docu-docu changes file PATH ./docs` | detail выбранного изменённого path |
| Поиск документов | `docu-docu search "query" ./docs` | `SearchReport` по свежим Markdown |
| Создание задачи | `docu-docu task init ./docs --area AREA --title TITLE --type TYPE` | новый Draft и `TaskInitReport` |
| Создание сущности | `docu-docu scaffold module|use-case|flow|screen|decision|standard|runbook ID ./docs --title TITLE` | атомарный scaffold и `ScaffoldReport` |
| Проверка готовности | `docu-docu task ready TASK-ID ./docs` | read-only `TaskReadyReport` |
| Контекст задачи | `docu-docu task context TASK-ID ./docs` | read-only `TaskContextReport` |
| Проверка задачи | `docu-docu task verify TASK-ID ./docs --dry-run|--run` | план или выполнение команд и `TaskVerifyReport` |
| Изменения задачи | `docu-docu task changes TASK-ID ./docs` | task-scoped change report и impact diagnostics |
| Архивирование задачи | `docu-docu task archive TASK-ID ./docs` | перемещение терминальной задачи в годовой архив |
| Восстановление задачи | `docu-docu task restore TASK-ID ./docs` | возврат задачи из годового архива |
| Lifecycle AI-skill | `docu-docu skill install|status|update|uninstall` | text-состояние managed offline package |
| Версия | `docu-docu version` | версия генератора |

Сборка требует явного `docu-docu build ./docs`; путь без команды отклоняется.
Отдельной верхнеуровневой команды `init` нет: минимальный проект создаётся файлами
`docs/index.md` и `docs/architecture/overview.md`; `task init` создаёт только
work item. Параметры и exit codes
определены в [CLI-контракте](../contracts/cli.md).

Skill lifecycle не входит в публичный Go-фасад и не использует JSON output.
Targets, состояния и безопасное ручное разрешение конфликтов описывает
[руководство установки skill](../guides/skill-installation.md).

Команды `changes` поддерживают фильтры `--status`, `--module`, `--type` и
`--permanent-only`. Последний оставляет только постоянную документацию и
исключает work artifacts, contracts и assets.

## Публичный Go API

Корневой пакет `docu-docu` экспортирует типизированный фасад над CLI,
документной моделью, генератором портала, поиском, task
workflow и Git-backed changes. Прямые вызовы возвращают модели и отчёты без
обязательной сериализации или запуска отдельного процесса.

Канонический удалённый module path пока не опубликован. Текущий import path
предназначен для исходного модуля или явного локального `replace`. Фактическую
публичную поверхность определяют объявления и package documentation в
корневом `api.go`; до публикации модуля отдельные гарантии совместимости для
внешних потребителей не заявлены.

## Skill workflows актуализации

Устанавливаемый `docu-docu` предоставляет изменяющие agent workflows,
которые не входят в Go CLI: `init`, `refresh`, `refresh diff` и `translate`.

- `$docu-docu refresh` сверяет весь набор исходных Markdown-документов с
  текущим кодом, тестами, публичными интерфейсами, schemas, configuration, CI,
  требованиями и решениями;
- `$docu-docu refresh diff` начинает со staged, unstaged и untracked файлов
  относительно `HEAD` и добавляет зависимые документы по ссылкам, stable ID,
  task relationships и изменённому публичному поведению;
- `$docu-docu translate <locale> --all-stale` поддерживает полный файловый
  паритет reader-facing Markdown, включая work items, notes и ideas. Locale root
  остаётся read-only и не используется task workflow или editor-записью. При
  обычной работе агент исключает все translation roots из поиска,
  инвентаризации, semantic review, task context и анализа реализации. Явный
  перевод или запрос проверить, найти, собрать, запустить либо изучить
  конкретную локаль открывает только выбранный root и минимально необходимую
  source/target-пару; проверка паритета начинается с путей, хешей и структурных
  отчётов. Локализованные metadata keys и status values допустимы только при
  сохранении нормализованной семантики: например, `Готово` (`done`) переводится
  как `Completed` или `Done`, а `Готово к работе` (`planned`) — как `Ready`.
  Перед обновлением manifest workflow сравнивает status kinds и вычисленное
  состояние roadmap в JSON-моделях обеих локалей.

Refresh обновляет только evidence-backed источники, не меняет код ради
согласования с текстом и не выполняет init. Даты меняются только вместе с
содержанием или связями; runbook review date требует фактической проверки.
Доказуемые delete, rename и stable-ID migration обновляют все ссылки вместе.
После semantic и structural gates пересобираются только tracked или явно
предписанные проектом portals.

Полные пользовательские последовательности `init`, `refresh`, `refresh diff` и
`translate` описаны в [руководстве по agent-workflows](../guides/agent-workflows.md).

## Документная модель

Единая таблица назначения, границ и правил выбора находится в
[справочнике видов документов](document-types.md).

Минимальная документация содержит `index.md` и карту
`architecture/overview.md` с типом `Architecture Overview`. Каждый другой
`architecture/**/*.md` отвечает на один непустой архитектурный вопрос и
должен быть напрямую указан в overview. По мере необходимости Docu-docu
распознаёт:

- `status.md`, `roadmap.md`, `risks.md`, `ideas.md` и `notes.md`;
- модули `MOD-*`, use cases `UC-*` и процессы `FLOW-*`;
- стандарты `STD-*` и эксплуатационные процедуры `RB-*`;
- архитектуру, контракты, решения, руководства и справочники;
- неизвестные верхнеуровневые custom-разделы с явным manifest без
  эвристик по количеству или тематике документов;
- рабочие задачи `TASK-*`, критерии `AC-*` и команды проверки;
- экраны `SC-*`, переходы `TR-*`, состояния и hotspots.

Модель проверяет обязательные поля и разделы, уникальность стабильных ID,
статусы, зависимости, локальные и repository-ссылки, anchors, устаревание,
согласованность roadmap, task scope и traceability.

Архитектурные diagnostics являются errors и используют коды
`missing-architecture-overview`, `invalid-architecture-overview-type`,
`missing-architecture-question`, `unlisted-architecture-document`,
`broken-link` и `blocked-link`. Пунктуация и смысл вопроса остаются semantic
gate, а schema v1 сохраняет `documents[].type: "architecture"`.

Полный авторский контракт новых разделов и freshness описан в руководстве
[Standards, Runbooks и Custom-разделы](../guides/quality-runbooks.md).

Глобальный прогресс вычисляется только по `roadmap.md`. Для связанного `UC-*`
источником выполнения является статус use case; локальные чек-листы других
документов не увеличивают глобальный процент.

## Markdown и диаграммы

Goldmark `v1.8.5` разбирает CommonMark и только явно включённые расширения:

- заголовки и автоматические уникальные anchors;
- абзацы, выделение, ссылки, изображения и цитаты;
- маркированные, нумерованные и task-списки;
- таблицы, inline code и fenced code blocks;
- strikethrough и literal HTTP(S), `www` и email autolinks;
- Mermaid `flowchart`, `stateDiagram-v2` и `sequenceDiagram`.

Raw HTML и ведущий завершённый front matter создают errors; safe preview и
rendered diff показывают их только как escaped source. Attributes, footnotes,
definition lists и typographer не включены. Mermaid Tiny встроена локально, работает на
static HTTP hosting, следует светлой или тёмной теме и всегда запускается с
`securityLevel: strict`. Front matter, Mermaid directives и блоки более
50 000 UTF-8 байт отклоняются.

## Автономный портал

`build` создаёт страницы документов и каталогов, главную-паспорт проекта,
health report,
поиск и `report.json`. Интерфейс предоставляет:

- иерархическую навигацию: активная группа раскрыта, остальные по умолчанию
  свёрнуты, пользовательское состояние сохраняется;
- цветовые статусы в значках документов с текстовой подписью для доступности и
  отдельными `☐`/`☑` для невыполненных и выполненных `TASK-*`/`BUG-*`;
- глобальный полнотекстовый поиск с клавиатурным вызовом `/`;
- отдельную страницу «Журнал изменений проекта» из корневого `CHANGELOG.md`,
  если это обычный читаемый файл; она участвует в portal search, но не входит в
  `report.json`, task context, semantic model или editor workspace;
- спокойную главную сводку: сведения о проекте, следующий результат, числа
  активных задач, блокеров и открытых рисков и до пяти рекомендуемых точек
  входа; подробные списки доступны через поиск, навигацию и каталоги разделов;
- содержательную часть `index.md` без повторения H1 и структурных metadata в
  постоянно видимом подробном обзоре, включая печатную версию;
- оглавление и сворачиваемые разделы документа с чистыми accessible names;
- копирование названия и repository-relative пути исходного Markdown-документа
  для передачи контекста агенту;
- копирование блоков кода с fallback на выделение;
- фильтры каталогов, задач и traceability;
- специализированные каталоги Quality и Runbooks с фильтрами и метриками
  total, recent, review-required и overdue;
- backlinks и связанные документы;
- светлую и тёмную темы, печатную версию и адаптивный sidebar;
- управление Mermaid-диаграммой: zoom, pan, fit и fullscreen.

Все внутренние URL относительны. Портал не требует Go backend, CDN, Node.js или
браузерного расширения, но публикуется через HTTP(S) и может загружать
собственные static JSON resources из output.

## Live workspace serve

`serve` добавляет к read-only portal отдельный Operate UI: дерево разрешённых
исходников, path/dirty/save toolbar, CodeMirror, вкладки Editor/Preview/Split и
positional diagnostics. Markdown preview использует существующий safe renderer;
JSON получает syntax и hotspots diagnostics, а произвольный YAML — только
доступные Docu-docu diagnostics без выдуманной общей schema. Исключение —
`contracts/**/*.openapi.{yaml,yml,json}`: эти файлы получают OpenAPI 3.0/3.1
root, operation, operationId, path-parameter и internal `$ref` validation с
line/column; external references не загружаются.

Save использует SHA-256 CAS и atomic replace. После save/create модель, HTML,
search и diagnostics перестраиваются синхронно; watcher проверяет внешние
изменения, а browser polling через ETag различает обычную страницу, clean editor
и dirty conflict без потери local text. `Ctrl`/`Cmd`+`S`, leave guard,
diagnostic navigation и mobile drawer входят в тот же UI.

Создание документа в браузере и команды `task init`/`scaffold` используют один
реестр шаблонов. Wire-контракт Editor API находится в
[OpenAPI](../contracts/editor.openapi.yaml), а гарантии записи и границы
workspace — в [поведенческом описании](../contracts/editor-http.md).

Canonical `serve` также публикует `/_docu-docu/api-docs/`: vendored Swagger UI
5.32.12 переключает Editor/Changes specs, не использует CDN и разрешает Try it
out только для `GET`/`HEAD`. Static и translation portals UI не получают.

## Процессы и пользовательские сценарии

«Пользовательские сценарии» — самостоятельный верхнеуровневый раздел и
каноническая точка входа для `UC-*`. Раздел «Процессы» перечисляет именованные
визуальные и межсистемные документы `FLOW-*`. Каталоги разделены:

- `use-cases/index.html` показывает требования и пользовательский результат;
- `processes/index.html` показывает процессы и фильтрует их по модулю и
  связанному сценарию;
- `flows/FLOW-*.html` остаются стабильными страницами отдельных процессов;
  `flows/index.html` не создаётся.

Документы `FLOW-*` являются прямыми дочерними пунктами «Процессов».
Канонические документы получают стабильные URL по ID:

- `use-cases/UC-*.html`;
- `flows/FLOW-*.html`.

Один `FLOW-*` может ссылаться на несколько `UC-*`. Обратные связи вычисляются
автоматически. Страница use case объединяет вкладки «Описание», «Карта»,
«Проиграть» и «Связи»; отдельная страница `flows/UC-*.html` не создаётся.

## Карта экранов

[Открыть собственную интерактивную Screen Map](../screens/). Она показывает
высокоуровневую продуктовую навигацию и намеренно не перечисляет каждый
generated route.

При наличии `screens/SC-*.md` генерируются:

- `screens/index.html` — интерактивная карта;
- `screens/catalog.html` — фильтруемый каталог;
- `screens/SC-*.html` — документы экранов со связями;
- `traceability.html` — связь use case, screen, transition, task, criterion и verification.

Родительский пункт «Экраны» ведёт в `screens/catalog.html`. При включённой
общей карте `screens/index.html` добавляется отдельным дочерним пунктом;
`--no-screen-map` удаляет только эту страницу и ссылку.

Карточка карты показывает preview или placeholder, ID, название, маршрут,
статус, модуль и количество входящих и исходящих переходов. Доступны режимы:

- все экраны с группировкой по модулям;
- выбранный модуль;
- выбранный use case;
- только незавершённые экраны;
- sitemap по полю `Родительский экран`.

Дополнительно работают поиск, фильтр статуса, zoom, pan, fit, reset,
fullscreen, выбор экрана или перехода и боковая панель связей. Колесо мыши
масштабирует карту без перехвата browser zoom с `Ctrl`/`Cmd`; клавиши `+`, `-`,
`0`, `Esc` и `Enter` дублируют основные действия.

Переходы различаются не только цветом:

- navigation — сплошная направленная линия;
- error — пунктир;
- redirect — штриховая линия;
- return — обратный изгиб;
- external — двойная линия.

Подробный формат и правила проверки описаны в
[руководстве по экранам](../guides/screens.md).

## Проигрываемые сценарии и hotspots

Вкладка «Проиграть» на странице `use-cases/UC-*.html` начинается с
`Начального экрана` use case и предлагает переходы этого сценария и глобальные
переходы. При выборе действия viewer:

1. добавляет текущий шаг в историю;
2. открывает целевой экран и состояние;
3. показывает код ошибки или сообщение;
4. обновляет номер шага и доступные действия.

`Назад` возвращает предыдущий шаг, `Сначала` очищает историю. На terminal screen
показываются отдельные действия «Начать заново», «Показать карту» и
«Открыть use case». Карта открывается на вкладке `#map`, а описание — на
`#overview`.

Hotspots хранятся в `screens/hotspots.json` в процентах. Скрытая зона
проявляется при наведении или клавиатурном фокусе; переключатель показывает все
зоны постоянно. Даже без изображения или валидного hotspot остаётся доступен
текстовый список действий.

## Рабочие задачи

`TASK-*` и `BUG-*` поддерживают состояния от черновика до выполнения или
отмены, общие зависимости, scope, критерии и проверки. Баги дополнительно
фиксируют серьёзность, приоритет, воспроизводимость, регрессию, симптом,
ожидаемое и фактическое поведение, доказательства и регрессионную проверку.

`task context` не выполняет команды и возвращает только относящиеся к задаче
модули, use cases, экраны, переходы, правила, зависимости и diagnostics.

`task verify --run` сначала применяет task-local validation gate, затем
последовательно запускает уникальные команды `AC-*`, `ALL` и `DOCS` из
repository root. Ошибка одной команды не скрывает результаты остальных.
Timeout завершает дерево процессов, а stdout и stderr сохраняются ограниченным
хвостом.

Полный формат приведён в
[руководстве по рабочим задачам](../guides/work-items.md).

## JSON и автоматизация

`check --format json` и `report.json` используют чистую schema v1 и содержат:

- сведения о генераторе, проекте, текущем состоянии и статистике;
- документы, разрешённые ссылки, backlinks и related documents;
- roadmap, риски, модули, use cases, business rules и work items;
- screens, transitions, playable flows, hotspots и error definitions;
- типизированные flows и двусторонние связи `UC ↔ FLOW`;
- traceability matrix и diagnostics.

`task context` и остальные task reports используют schema v1 с полем `kind`.
Контракт развивается напрямую в v1 без параллельной версии схемы.

## Безопасность и отказоустойчивость

- сканер не переходит по Markdown-симлинкам;
- опасные URL-схемы и активные HTML, SVG, XML и JavaScript assets блокируются;
- preview разрешает только локальные PNG, JPG, JPEG, WEBP, AVIF и GIF;
- repository links и task scope не могут выйти за `repository-root`;
- `--clean` проверяет раскрытые пути и защищает input, его предков, системный
  корень и output-симлинки;
- обычные маршруты `serve` раздают только output, а editor API ограничен
  canonical workspace paths внутри docs root; listener слушает loopback по
  умолчанию и не использует кеширование;
- ручная пересборка `serve` принимает только служебный `POST` с заголовком
  действия; static build кнопку и endpoint не содержит;
- ошибка отдельной Screen Map или проигрываемого сценария не лишает доступа к остальной
  документации;
- editor writes требуют JSON/action/same-origin guards, лимиты 3 MiB/2 MiB и не
  получают CORS; при non-loopback listener прямые LAN-клиенты считаются
  доверенными;
- обычные `check`, `build`, `serve`, editor API и `task context` никогда не выполняют
  команды из Markdown.

## Ограничения

Docu-docu не является сетевой CMS, collaborative editor или средой выполнения
продукта. Live workspace существует только внутри процесса `serve`, не хранит
серверную базу, не выполняет API-запросы пошагового viewer и не импортирует
интерфейсы из Figma или frontend-кода.
