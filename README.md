# Docgent

Docgent — автономный генератор проектной документации на Go. Он читает структурированные Markdown-файлы, проверяет связи и бизнес-сущности и создаёт статический HTML-портал, который работает через `file://` без сервера.

## Возможности

- один бинарник, сторонние runtime и npm-пакеты не нужны;
- команды `init`, `check`, `build`, `version`;
- проектная сводка, текущее состояние и общий прогресс из `roadmap.md`;
- модули, пользовательские сценарии, бизнес-правила и атомарные рабочие задачи;
- roadmap, риски, архитектура, контракты, ADR, руководства и справочник;
- Markdown: заголовки, абзацы, списки, чек-листы, таблицы, ссылки, изображения, цитаты и блоки кода;
- иерархическая навигация, поиск, фильтры, тёмная тема, печать и сворачиваемые разделы;
- обратные ссылки и связь сценариев с модулями;
- проверка обязательных разделов, стабильных ID, зависимостей задач, ссылок и выхода за пределы репозитория;
- безопасное экранирование HTML и блокировка опасных протоколов и активных ресурсов;
- `report.json` для ИИ-агентов, CI и других инструментов;
- работа с сотнями Markdown-файлов без базы данных.

## Быстрый старт

### Готовый бинарник

```bash
docgent init ./docs
docgent check ./docs --strict
docgent build ./docs --output ./build/project-docs --clean
```

Откройте `build/project-docs/index.html`.

### Из исходного кода

Требуется Go 1.22 или новее.

```bash
go test ./...
go run ./cmd/docgent init ./docs
go run ./cmd/docgent build ./docs --output ./build/project-docs --clean
```

## Команды

### `init`

Создаёт согласованный стартовый набор документов. Существующие файлы не перезаписываются.

```bash
docgent init ./docs
docgent init ./docs --force
```

Стартовый комплект проходит `check --strict` без ошибок и предупреждений.

### `check`

Проверяет документацию без генерации сайта.

```bash
docgent check ./docs
docgent check ./docs --strict
docgent check ./docs --format json
```

Код завершения ненулевой, если найдены ошибки. При `--strict` предупреждения также приводят к ненулевому коду.

### `build`

Создаёт автономный статический портал.

```bash
docgent build ./docs \
  --output ./build/project-docs \
  --repository-root . \
  --repository-url https://github.com/owner/repository \
  --repository-ref main \
  --clean
```

Обратная совместимость сохранена: команда без подкоманды считается `build`.

```bash
docgent ./docs --output ./build/project-docs --clean
```

## Параметры

```text
-o, --output <directory>       Выходной каталог
-t, --title <name>             Название проекта
    --exclude <paths>          Исключаемые пути через запятую; можно повторять
    --stale-days <number>      Порог устаревания; 0 отключает проверку
    --repository-root <path>   Корень репозитория
    --repository-url <url>     HTTP(S) URL GitHub-репозитория
    --repository-ref <ref>     Точный git ref; по умолчанию main
    --clean                    Безопасно очистить выходной каталог
    --open                     Открыть главную страницу
    --strict                   Считать предупреждения ошибкой команды
    --format text|json         Формат вывода `check`
    --force                    Перезаписать шаблоны при `init`
```

## Рекомендуемая структура документации

```text
docs/
├── index.md
├── status.md
├── roadmap.md
├── risks.md
├── architecture/
├── contracts/
├── decisions/
├── guides/
├── modules/
├── reference/
├── use-cases/
└── work/
```

Стабильные идентификаторы:

```text
MOD-<AREA>
UC-<AREA>-NN
BR-<AREA>-NNN
TASK-<AREA>-NNN
ADR-NNN
```

## Источник глобального прогресса

Общий прогресс проекта вычисляется только по чек-листам корневого `roadmap.md`. Чек-листы в модулях, сценариях, рисках и рабочих задачах остаются локальными и не завышают проектную готовность.

## Безопасность

- HTML из Markdown всегда экранируется.
- `javascript:`, `data:` и другие опасные схемы блокируются.
- HTML, JavaScript, SVG и XML из документации не копируются как активные ресурсы.
- Локальные изображения разрешены только в безопасных растровых форматах.
- Ссылки на код могут выходить из `docs/` только внутри `--repository-root`.
- `--clean` запрещает удалять каталог документации, корень файловой системы и родитель исходной документации.
- Символические ссылки при сканировании и копировании игнорируются.

## Проверка разработки

```bash
go fmt ./...
go vet ./...
go test ./...
go test -race ./...
```

Полный цикл:

```bash
rm -rf /tmp/docgent-demo
go run ./cmd/docgent init /tmp/docgent-demo/docs
go run ./cmd/docgent check /tmp/docgent-demo/docs --strict --stale-days 0
go run ./cmd/docgent build /tmp/docgent-demo/docs --output /tmp/docgent-demo/site --clean --strict --stale-days 0
```

## Сборка релиза

```bash
make test
make build
make release
```

Ресурсы интерфейса и шаблоны встроены через `go:embed`, поэтому исполняемый файл не требует соседних каталогов `assets` или `templates`.

## Миграция с Node.js-версии

Формат документации сохранён. Основная замена команды:

```text
node project-docs.js ./docs ...
```

на:

```text
docgent build ./docs ...
```

Поддерживаются прежние ключевые параметры: `--output`, `--title`, `--exclude`, `--stale-days`, `--repository-root`, `--repository-url`, `--repository-ref`, `--clean`, `--open`, `--strict`.

## Лицензия

MIT. См. [LICENSE](LICENSE).
