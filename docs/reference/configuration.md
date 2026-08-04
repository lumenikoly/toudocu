# Справочник конфигурации

CLI работает без конфигурационного файла. Необязательный
`<repository-root>/.docu-docu/config.yml` настраивает портал и автоматически
читается командами `build`, `check` и `serve`.

## Значения по умолчанию

| Параметр | Значение |
|---|---|
| input | `./docs` |
| output | соседний каталог `project-docs` |
| repository root | родитель input |
| repository ref | `main` |
| stale days | `90` |
| format | `text` |
| task timeout | `10m` |
| serve host | `127.0.0.1` |
| serve port | `8080` |
| screen map | включена при наличии `screens/SC-*.md` |
| site theme | `classic` |
| color scheme | `system` |
| accent | `indigo` |
| density | `comfortable` |
| content width | `standard` (920 px) |
| hero | включён |

## Темы и брендинг портала

```yaml
site:
  title: My Project
  logo: assets/logo.svg
  favicon: assets/favicon.svg
  theme: classic
  colorScheme: system
  accent: indigo
  density: comfortable
  contentWidth: standard
  footer:
    text: My Project documentation
    url: https://example.com
  hero:
    enabled: true
    image: assets/hero.webp
```

Допустимы темы `classic`, `paper`, `terminal`; схемы `light`, `dark`, `system`;
акценты `indigo`, `blue`, `teal`, `green`, `amber`, `rose`, `violet`; плотность
`compact` или `comfortable`; ширина `narrow` (760 px), `standard` (920 px) или
`wide` (1120 px).

`--title` имеет приоритет над `site.title`, затем используются заголовок
`index.md` и имя каталога. Footer принимает только экранированный текст и
необязательный HTTPS URL.

В шапке портала есть выпадающие списки темы (`classic`, `paper`, `terminal`) и
цветовой схемы (`system`, `light`, `dark`). Выбор сохраняется локально в
браузере; значения конфигурации остаются начальными для нового посетителя.

Logo, favicon и hero должны быть обычными файлами внутри `.docu-docu/assets/`;
абсолютные пути, traversal, symlinks и отсутствующие файлы отклоняются. SVG
подключается как файл и не встраивается в HTML.

Парсер реализует фиксированный YAML-поднабор: карты, строки, boolean и
комментарии. Списки, anchors, aliases, multiline, неизвестные и повторные ключи
не поддерживаются. Custom CSS, web fonts и theme plugins отсутствуют.

## Repository root

`--repository-root` определяет:

- границу разрешённых ссылок из документации в код;
- корень выполнения команд `task verify --run`;
- базу проверки scope-путей work item.

Путь должен указывать на фактический корень репозитория. Для текущего проекта:

```bash
go run ./cmd/docu-docu check ./docs --repository-root . --strict
```

## Repository URL и ref

Если заданы `--repository-url` и точный `--repository-ref`, ссылки на файлы вне
`docs/`, но внутри repository root, преобразуются в HTTP(S) ссылки вида GitHub
`blob` или `tree`.

Для воспроизводимого портала рекомендуется commit SHA вместо плавающей ветки.

## Excludes

`--exclude` принимает список через запятую и может повторяться. По умолчанию
исключаются VCS-каталоги, `node_modules`, `vendor`, `dist`, `build` и coverage.
Скрытые файлы и символические ссылки не сканируются.

## Stale threshold

Дата документа берётся из `Последнее обновление`, затем из `Дата`, затем из
mtime файла. `--stale-days 0` отключает warning об устаревании и удобен для
воспроизводимых локальных проверок.

## Strict mode

Без `--strict` ненулевой exit code дают errors. В strict mode любой warning
также завершает команду с кодом `1`.

## Screen Map

`--screen-map` явно включает страницу карты, а `--no-screen-map` отключает
только её. Каталог экранов, страницы документов, рабочие пространства use case,
traceability и коллекции `report.json` продолжают генерироваться.

Родительский пункт «Экраны» всегда ведёт в каталог. При включённой карте она
добавляется отдельным дочерним пунктом; при отключённой ссылка на неё не
генерируется. Параметры допустимы для `build` и `serve` и не меняют исходный
Markdown.

## Documentation Changes

```yaml
changes:
  defaultBaseRef: main
  renameSimilarity: 60
  includeTaskArtifacts: true
  includeAssets: true
  semanticDiff: true
  renderedDiff: true
  maxSourceDiffBytes: 2097152
  maxRenderedFileBytes: 1048576
  exclude:
    - docs/generated/**
    - docs/cache/**
```

Секция необязательна; стандартный режим остаётся `HEAD → working-tree`.
`defaultBaseRef` используется только без явного base и не загружается с
remote. Лимит отключает тяжёлое представление одного файла, не весь change set.

## Local server и editor workspace

`serve` по умолчанию использует `127.0.0.1:8080`. `--host` и `--port`
принимаются только этой командой. Адрес `0.0.0.0` разрешает доступ из локальной
сети, но сервер не предоставляет TLS или авторизацию и выводит предупреждение.

При просмотре через `serve` отдельная workspace-панель показывает editor и
ручную пересборку модели, HTML и поиска. Editor API всегда работает на том же
listener и не получает отдельного CLI-флага.
`--host`, `--port` и `--open` сохраняют прежнюю семантику; `--no-open` и `--edit`
не существуют. Через `file://` или другой статический HTTP-сервер editor markup,
API URL, CodeMirror и server-only scripts отсутствуют.

Workspace включает обычные `.md`, `.yaml`, `.yml` и `.json` внутри docs root и
исключает hidden, configured excludes, output subtree и symlink paths. JSON body
ограничен 3 MiB, content — 2 MiB. При `--host 0.0.0.0` same-origin browser
guards не заменяют аутентификацию прямого LAN-клиента; используйте только
доверенную локальную сеть.

## Локаль и встроенные разделы

`.docu-docu/config.yml` может содержать только `project`; `site` и `changes`
остаются независимыми необязательными разделами. `project.locale` принимает
нормализуемый BCP-47-style тег (например, `ru`, `en-GB`, `pt-BR`, `sr-Latn`).
`project.sections` задаёт названия всех встроенных разделов и является
источником истины для основной навигации: H1 входного документа сверяется с
явным названием, но не используется как fallback.

```yaml
project:
  locale: ru
  sections:
    architecture: Архитектура
    modules: Модули
    use-cases: Пользовательские сценарии
    flows: Процессы
    screens: Экраны
    decisions: Архитектурные решения
    contracts: Контракты
    quality: Стандарты качества
    runbooks: Runbooks
    reference: Справочник
    work: Рабочие задачи
    guides: Руководства
```

Без locale или полного списка build/check сохраняют английские fallback-названия
и выдают warning; в `--strict` это gate. Отсутствующая locale в HTML даёт
`lang="en"`. Для неизвестного, но синтаксически корректного locale допустим
явный однократно сохранённый список названий.

`task init` и `scaffold` без явного `--lang` используют основной язык
`project.locale`, когда это `ru` или `en` (включая теги наподобие `ru-RU` и
`en-GB`). Для другого или отсутствующего locale scaffold fallback равен `en`;
явный `--lang` всегда имеет приоритет.

## Отдельные roots переводов

`translations` описывает независимые порталы для workflow
`$docu-docu translate`; это не новая Go CLI-команда. Канонический `docs/`
остаётся единственным источником `task context` и `ProjectModel`.

```yaml
translations:
  en:
    root: docs-en
    sections:
      architecture: Architecture
      modules: Modules
      use-cases: Use Cases
      flows: Processes
      screens: Screens
      decisions: Architecture Decisions
      contracts: Contracts
      quality: Quality Standards
      runbooks: Runbooks
      reference: Reference
      work: Work Items
      guides: Guides
```

Root задаётся относительно repository root, находится внутри него и не может
быть самим repository root, symlink, traversal или пересечением с другим
translation root либо каноническим docs root. При `check`, `build` или `serve`
ровно на translation root профиль временно заменяет `project.locale` и
`project.sections`. Обычная работа с canonical root не читает translation tree
и не получает diagnostics незавершённого другого profile.

## Mermaid

Mermaid не имеет пользовательских CLI-настроек. Docu-docu закрепляет:

- типы `flowchart`, `stateDiagram-v2`, `sequenceDiagram`;
- максимум 50 000 UTF-8 байт на блок;
- `securityLevel: strict`;
- запрет Mermaid front matter и directives;
- вычисленные цвета поверхности, текста, границ и акцента текущей темы.

Эти параметры нельзя переопределить из документации.

## Безопасная очистка

`--clean` разрешён только для отдельного output directory. Нельзя очистить:

- системный корень;
- input documentation;
- каталог-предок input;
- прямой output-симлинк.

Перед удалением сравниваются раскрытые пути.

## Task report и timeout

`--report <file.json>` атомарно сохраняет `TaskVerifyReport` вне исходного
каталога документации. `--timeout` задаёт лимит каждой уникальной команды, а не
всего task verify.
