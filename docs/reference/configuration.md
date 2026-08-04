# Справочник конфигурации

CLI работает без конфигурационного файла. Необязательный
`<repository-root>/.docgent/config.yml` настраивает портал и автоматически
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

Logo, favicon и hero должны быть обычными файлами внутри `.docgent/assets/`;
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
go run ./cmd/docgent check ./docs --repository-root . --strict
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

Параметры допустимы для `build` и `serve` и не меняют исходный Markdown.

## Local server

`serve` по умолчанию использует `127.0.0.1:8080`. `--host` и `--port`
принимаются только этой командой. Адрес `0.0.0.0` разрешает доступ из локальной
сети, но сервер не предоставляет TLS или авторизацию и выводит предупреждение.

## Mermaid

Mermaid не имеет пользовательских CLI-настроек. Docgent закрепляет:

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
