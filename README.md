# Docgent

Docgent — автономный генератор проектной документации на Go. Он читает структурированные Markdown-файлы, проверяет связи и бизнес-сущности и создаёт статический HTML-портал, который работает через `file://` без сервера.

## Возможности

- один бинарник, сторонние runtime и npm-пакеты не нужны;
- команды `init`, `check`, `task check`, `build`, `version`;
- проектная сводка, текущее состояние и общий прогресс из `roadmap.md`;
- модули, пользовательские сценарии, бизнес-правила и атомарные рабочие задачи;
- roadmap, риски, архитектура, контракты, ADR, руководства и справочник;
- Markdown: заголовки, абзацы, списки, чек-листы, таблицы, ссылки, изображения, цитаты и блоки кода;
- иерархическая навигация, поиск, фильтры, тёмная тема, печать и сворачиваемые разделы;
- обратные ссылки и связь сценариев с модулями;
- проверка обязательных разделов, стабильных ID, зависимостей задач, scope-путей, ссылок и выхода за пределы репозитория;
- проверяемые задачи с локальными `AC-*`, исполняемыми командами и JSON-отчётом schema v1;
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

### `task check`

Проверяет структуру выбранной задачи и выполняет все объявленные команды `AC-*`, `ALL` и `DOCS` из корня репозитория. Одинаковые команды выполняются один раз.

```bash
docgent task check TASK-AUTH-014 ./docs
docgent task check TASK-AUTH-014 ./docs --format json
docgent task check TASK-AUTH-014 ./docs \
  --report ./build/task-report.json \
  --timeout 10m
```

Команды выполняются последовательно даже после ошибки. Код завершения равен нулю только при успешной валидации и всех проверках. `--report` атомарно сохраняет тот же `TaskCheckReport`, который печатает `--format json`.

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
    --format text|json         Формат вывода `check` и `task check`
    --report <file>            JSON-отчёт `task check`
    --timeout <duration>       Timeout каждой команды, по умолчанию 10m
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
CON-<AREA>-<NAME>
DLV-<AREA>-NN
```

## Источник глобального прогресса

Roadmap остаётся источником продуктового охвата. Каждый его элемент обязан содержать стабильный ID существующего use case или контракта либо уникальный `DLV-*`.

Для `UC-*` эффективное выполнение вычисляется из статуса связанного use case: исходный checkbox сохраняется для совместимости, но не влияет на прогресс и не требует ручной синхронизации. Для `CON-*` и `DLV-*` checkbox остаётся источником состояния.

Активные задачи, блокеры и следующий незавершённый результат автоматически выводятся на dashboard и `status.html`; исходный `status.md` не перезаписывается и не может содержать собственный чек-лист требований.

## Проверяемые рабочие задачи

Каждый файл `work/TASK-*.md` содержит ровно одну задачу. Обязательны разделы `Результат`, `Область изменения`, `Не входит в задачу`, `Критерии приёмки`, `План`, `Проверка` и `Влияние на документацию`.

Допустимые статусы:

```text
Черновик
Готово к работе
В работе
Заблокировано
Выполнено
Отменено
```

Критерии задаются чекбоксами с локальными ID `AC-*`. Для каждого ID в разделе `Проверка` должна быть отдельная команда:

```md
- [ ] `AC-01` Неверный пароль возвращает `INVALID_CREDENTIALS`.

## Проверка

- `AC-01` → `go test ./internal/auth -run TestInvalidPassword`
- `ALL` → `go test ./...`
- `DOCS` → `docgent check ./docs --strict`
```

Чекбоксы вне раздела критериев запрещены. Для `Выполнено` все критерии должны быть отмечены и должны существовать проверки `ALL` и `DOCS`; `Заблокировано` требует раздел `Блокер`, а `Отменено` — `Причина отмены`.

`TaskCheckReport` содержит версию схемы, сведения о задаче, полную матрицу критериев, команды, target ID, exit codes, длительности и ограниченный хвост stdout/stderr. Общий `report.json` также имеет `schemaVersion: 1` и публикует declared/effective-состояния roadmap.

В schema v1 итоговый `status` принимает `passed`, `failed` или `blocked`, а статус команды — `passed`, `failed`, `timed_out` или `start_error`. `validationIssues` содержит блокирующие замечания выбранной задачи, `issues` — все замечания проекта, а `fullVerification` подтверждает наличие targets `ALL` и `DOCS`. Для каждого потока команды сохраняется не более 1 MiB последних данных.

## Безопасность

- HTML из Markdown всегда экранируется.
- `javascript:`, `data:` и другие опасные схемы блокируются.
- HTML, JavaScript, SVG и XML из документации не копируются как активные ресурсы.
- Локальные изображения разрешены только в безопасных растровых форматах.
- Ссылки на код могут выходить из `docs/` только внутри `--repository-root`.
- `--clean` запрещает удалять каталог документации, корень файловой системы и родитель исходной документации.
- `--report` не может указывать внутрь исходной документации, в том числе через символическую ссылку.
- Символические ссылки при сканировании и копировании игнорируются.
- Команды из work item считаются доверенным исполняемым кодом и запускаются только явным вызовом `task check`; обычные `check` и `build` никогда их не выполняют.

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

Формат постоянной документации сохранён. Рабочие задачи теперь используют более строгий проверяемый формат «одна `TASK-*` на файл» с `AC-*`, планом и командами проверки. Основная замена команды:

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
