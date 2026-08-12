# Журнал изменений / Changelog

## 0.0.1

### Русский

#### Документация и портал

- Добавлены проверка Markdown, поиск, построение статического портала и
  локальный `serve` с редактором и автоматической пересборкой.
- Документная модель поддерживает архитектурные вопросы, модули, правила,
  пользовательские сценарии, процессы Mermaid, экраны, переходы, стандарты,
  эксплуатационные инструкции и рабочие задачи.
- Портал содержит отдельные каталоги известных сущностей, поиск, связи, карту
  экранов, темы и локализацию.
- Завершённость `UC-*` требует статуса группы `done`, хотя бы одного критерия
  приёмки и отметки всех критериев. Дорожная карта, статистика и диагностика
  используют этот единый расчёт, а `ProjectReport` сохраняет
  `completionSource: "use-case-status"` в схеме версии 1.
- `build` создаёт портал только для чтения, которому после сборки не нужен
  запущенный Toudocu. Публикация поддерживается по HTTP(S), в том числе во
  вложенном URL-пути.
- Прямое открытие `index.html` через `file://` больше не входит в
  поддерживаемый контракт. Для локального просмотра предназначен
  `toudocu serve`.
- Браузерная часть вынесена в `web/`. Готовые TypeScript/CSS-ресурсы
  фиксируются в репозитории и встраиваются в Go-бинарник; Node.js не нужен
  пользователю.
- Статический и локальный режимы разделены: Editor, Changes, CodeMirror,
  Swagger UI и локальные API присутствуют только в `serve`.
- Editor и Changes API описаны двумя OpenAPI 3.1.0-контрактами. Канонический
  `serve` показывает их через встроенный Swagger UI 5.32.12 без CDN.
- Toudocu использует Goldmark 1.8.5 и единый CommonMark/GFM-разбор. Включены
  таблицы, task-списки, зачёркивание и буквальные автоматические ссылки.
- Сырой HTML и front matter в начале файла между одинаковыми строками
  `---` или `+++` считаются ошибками. Безопасный предпросмотр всё
  равно показывает такой исходный текст в экранированном виде.
- Иконка вкладки лендинга совпадает с иконкой портала документации.

#### Changes и локальные обсуждения

- `changes`, `changes file` и `task changes` показывают
  Git-изменения документации в текстовом, JSON- и Markdown-формате, не изменяя
  рабочее дерево, индекс, ссылки и историю.
- Рабочая область `/changes/` охватывает весь локальный репозиторий,
  автоматически открывает первый подходящий файл и показывает точный Git diff.
- Добавлены просмотр полного UTF-8-файла и фильтр: все файлы, документация или
  остальные файлы. Основная вкладка называется «Diff».
- Git-диапазон и диагностические сообщения перенесены в раскрываемые панели.
  На узких экранах список файлов и обсуждения открываются отдельными панелями
  без горизонтальной прокрутки всей страницы.
- Панель «Изменения» открывается справа поверх рабочей области с теми же
  размерами, затемнением, управлением фокусом и мобильным режимом, что и панель
  обсуждений Портала.
- В Портале и Changes можно выделить содержимое Markdown, включая заголовок,
  скопировать текст или контекст и создать вопрос либо запрос на изменение.
- Единый diff сохраняет выделение и предлагает скопировать текст или контекст
  либо привязать вопрос. Новые строки получают точный диапазон, а старые строки
  изменённого документа — видимую цитату без нового вида привязки. Знак «+»
  становится видимым при наведении или фокусе на строке, к которой можно
  привязать вопрос, и остаётся видимым на сенсорных устройствах.
- Обсуждения и привязки хранятся локально вне репозитория. Toudocu переносит
  привязку после однозначного изменения документа либо помечает её как
  устаревшую или удалённую.
- Сохранение вопроса сразу создаёт ожидающую запись очереди. Пока агент не
  получил сообщение, его можно изменить или удалить; отмена закрывает пустую
  форму без ошибки обязательного поля.
- Привязка обсуждения распознаёт браузерные переносы пробелов и выбранное
  вхождение повторяющегося текста.
- Общая кнопка обсуждений находится в заголовке всех страниц основного
  `serve`. Панель показывает все ветки проекта, но разрешает создать новую
  только для текущего канонического документа.
- «Скопировать промт» копирует явную просьбу обработать очередь и не имитирует
  запуск агента.
- Установленный навык получает старейшую запись через `toudocu agent next --json` и
  возвращает структурированный ответ через `toudocu agent respond`. Вопрос не
  разрешает менять документацию; запрос на изменение сначала требует проверки
  фактов.
- Для Go, Java, JavaScript и TypeScript в полном файле доступна подсветка
  синтаксиса. Остальные корректные UTF-8-файлы показываются как обычный текст.

#### Команды, задачи и встроенный навык

- CLI поддерживает `check`, `build`, `serve`, `search`,
  `changes`, `scaffold` и полный жизненный цикл рабочих задач.
- `task verify` без `--run` не выполняет команды. Запуск происходит
  только после явного `task verify --run`.
- Публичные JSON-отчёты используют `schemaVersion: 1` и стабильные коды
  завершения.
- Встроенный навык можно установить, проверить, обновить и удалить для Codex,
  Claude Code и Copilot. Управляемая копия не перезаписывается поверх локальных
  изменений.
- `$toudocu init`, `$toudocu refresh` и `$toudocu translate` реализованы как
  процессы встроенного навыка, а очередь документационных запросов имеет независимый
  интерфейс командной строки `toudocu agent next|respond`, не зависящий от
  поставщика агента.
- `$toudocu refresh diff` начинает со staged, unstaged и untracked
  изменений относительно `HEAD` и добавляет зависимые документы.
- `$toudocu translate diff` последовательно обновляет все настроенные
  языковые зеркала. Переводы остаются изолированными каталогами только для
  чтения.
- Параметры `--include-assets` и `--translation-input` позволяют
  явно включить бинарные ресурсы и полный вход для перевода.
- `make update-local` собирает текущий исходный код и обновляет локальный
  бинарник в `$(INSTALL_DIR)`.

#### Поставка

- Релизный комплект содержит сборки для Linux, macOS и Windows на AMD64 и
  ARM64, включая Windows ARM64.
- Процесс выпуска различает стабильный канал и кандидаты
  `X.Y.Z-rc.N`. Кандидат публикуется как предварительный релиз только
  после явного запуска процесса выпуска.
- POSIX- и PowerShell-установщики выбирают нужный бинарник, сверяют SHA-256 и
  версию и только затем заменяют файл в каталоге пользователя.
- Путь `releases/latest` устанавливает последний стабильный выпуск.
- Корневой пакет Go предоставляет типизированный фасад для локального
  встраивания из исходного дерева. Основным публичным интерфейсом остаётся CLI.

### English

#### Documentation and portal

- Added Markdown validation, search, static portal generation, and local
  `serve` with an editor and automatic rebuilds.
- The document model covers architecture questions, modules, rules, use cases,
  Mermaid processes, screens, transitions, standards, runbooks, and work items.
- The portal provides dedicated catalogs for known entities, search,
  relationships, a screen map, themes, and localization.
- A `UC-*` is complete only when its status group is `done`, it has at least
  one acceptance criterion, and every criterion is checked. The roadmap,
  statistics, and diagnostics use this single calculation, while
  `ProjectReport` retains schema version 1 and
  `completionSource: "use-case-status"`.
- `build` creates a read-only portal that needs no running Toudocu process
  after generation. It can be published over HTTP(S), including below a nested
  URL path.
- Opening `index.html` directly through `file://` is not supported. Use
  `toudocu serve` for local viewing.
- Browser code lives in `web/`. Built TypeScript and CSS assets are committed
  and embedded in the Go binary, so users do not need Node.js.
- Static and local modes are separate: Editor, Changes, CodeMirror, Swagger UI,
  and local APIs are available only under `serve`.
- Two OpenAPI 3.1.0 contracts describe the Editor and Changes APIs. Canonical
  `serve` displays them with the bundled Swagger UI 5.32.12 without a CDN.
- Toudocu uses Goldmark 1.8.5 and one CommonMark/GFM parser with tables, task
  lists, strikethrough, and literal autolinks enabled.
- Raw HTML and leading front matter enclosed by matching `---` or `+++` lines
  are errors. The safe preview still renders that source as escaped text.
- The landing page and documentation portal use the same favicon.

#### Changes and local discussions

- `changes`, `changes file`, and `task changes` report documentation changes
  in text, JSON, and Markdown without modifying the working tree, index, refs,
  or history.
- The `/changes/` workspace covers the local repository, opens the first
  matching file automatically, and shows the exact Git diff.
- The workspace can display a complete UTF-8 file and filter all files,
  documentation, or other files. Its primary tab is named “Diff”.
- Git range details and diagnostics live in disclosure panels. On narrow
  screens, the file list and discussions open as overlays without making the
  page scroll horizontally.
- The Changes panel opens over the workspace from the right and shares the
  Portal discussion panel's dimensions, scrim, focus handling, and mobile
  behavior.
- In Portal and Changes, users can select Markdown content, including a
  heading, copy its text or context, and create a question or change request.
- The unified diff preserves the browser selection and lets users copy the
  text or context or attach a question. New lines receive an exact range;
  removed lines from a modified document are quoted without introducing a new
  anchor type. The “+” control appears when an eligible line is hovered or
  focused and remains visible on touch devices.
- Discussions and anchors are stored locally outside the repository. Toudocu
  reanchors an unambiguous passage after an edit or marks it as stale or
  deleted.
- Saving a question immediately creates a pending queue record. Until the agent
  receives it, the message can be edited or deleted; cancelling an empty form
  does not trigger required-field validation.
- Discussion anchors account for browser whitespace normalization and the
  selected occurrence of repeated text.
- A shared discussion button appears in the header of every page served from
  the canonical root. Its panel lists all project threads but permits a new
  thread only for the current canonical document.
- “Copy prompt” copies an explicit request to process the queue and never
  pretends that an agent has started.
- The installed skill receives the oldest record through
  `toudocu agent next --json` and returns a structured response through
  `toudocu agent respond`. A question does not authorize documentation edits;
  a change request first requires fact verification.
- Complete-file views highlight Go, Java, JavaScript, and TypeScript. Other
  valid UTF-8 files remain available as plain text.

#### Commands, work items, and embedded skill

- The CLI provides `check`, `build`, `serve`, `search`, `changes`, `scaffold`,
  and the complete work-item lifecycle.
- `task verify` does not execute commands unless `--run` is explicitly present.
- Public JSON reports use `schemaVersion: 1` and stable exit codes.
- The embedded skill can be installed, checked, updated, and removed for Codex,
  Claude Code, and Copilot. Toudocu does not overwrite local changes in its
  managed copy.
- `$toudocu init`, `$toudocu refresh`, and `$toudocu translate` are embedded
  skill workflows. Documentation requests use the separate provider-neutral
  CLI transport `toudocu agent next|respond`.
- `$toudocu refresh diff` starts from staged, unstaged, and untracked changes
  relative to `HEAD`, then includes dependent documents.
- `$toudocu translate diff` updates every configured language mirror in order.
  Translation roots remain isolated and read-only.
- `--include-assets` and `--translation-input` explicitly include binary assets
  and complete translation input.
- `make update-local` builds the current source and updates the local binary in
  `$(INSTALL_DIR)`.

#### Distribution

- The release bundle contains AMD64 and ARM64 binaries for Linux, macOS, and
  Windows, including Windows ARM64.
- The release workflow distinguishes stable releases from `X.Y.Z-rc.N`
  candidates. An RC is published as a prerelease only after an explicit
  workflow dispatch.
- POSIX and PowerShell installers select the correct binary, verify its SHA-256
  and reported version, and only then replace the user's executable.
- `releases/latest` installs the newest stable release.
- The root Go package provides a typed facade for embedding Toudocu from the
  source tree. The CLI remains the primary public interface.
