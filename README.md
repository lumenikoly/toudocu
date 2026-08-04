# Docu-docu

Docu-docu — dependency-free Go CLI, который проверяет Markdown-документацию и
собирает из неё автономный HTML-портал. Портал открывается через `file://`, не
требует базы данных, npm, CDN или отдельного runtime.

## Быстрый старт

Требуется Go 1.22 или новее. Из корня репозитория:

```bash
go run ./cmd/docu-docu check ./example/docs
go run ./cmd/docu-docu build ./example/docs \
  --output ./example/site \
  --clean \
  --open
```

`check` только проверяет источники. `build` явно создаёт read-only портал.
Docu-docu не интерпретирует путь как неявную команду: используйте
`docu-docu build ./docs`, а не `docu-docu ./docs`.

Для установки локального бинарника:

```bash
go build -o docu-docu ./cmd/docu-docu
```

## Минимальный проект

Создайте `docs/index.md` и обязательную архитектурную карту:

```text
docs/
├── index.md
└── architecture/
    └── overview.md
```

Минимальный `architecture/overview.md`:

```md
# Архитектура проекта

- Тип документа: Architecture Overview

Краткое описание границы системы и взаимодействующих сторон.

## Карта архитектурных вопросов
```

Каждый другой Markdown-файл под `architecture/` отвечает на один явный
архитектурный вопрос и добавляется в overview прямой ссылкой. Остальные
разделы создаются только по необходимости.

## Основные сценарии

Проверить документацию без записи файлов:

```bash
docu-docu check ./docs
docu-docu check ./docs --strict
docu-docu check ./docs --format json
```

Собрать автономный портал:

```bash
docu-docu build ./docs --output ./build/project-docs --clean
```

Запустить локальный портал с редактором, watcher и live rebuild:

```bash
docu-docu serve ./docs --output ./build/project-docs
```

По умолчанию `serve` слушает `127.0.0.1:8080`. У него нет TLS и авторизации;
`--host 0.0.0.0` используйте только в доверенной локальной сети. Редактор и
пересборка существуют только в `serve`; результат `build` остаётся статическим
и read-only.

Найти исходный документ:

```bash
docu-docu search "task workflow" ./docs --format json
```

Посмотреть Git-backed изменения документации:

```bash
docu-docu changes ./docs --base main --target working-tree --format markdown
docu-docu changes file docs/modules/MOD-AUTH.md ./docs --format json
docu-docu task changes TASK-AUTH-015 ./docs --format json
```

`task changes` — единственный task-scoped синтаксис. Команды read-only: они не
выполняют fetch, add, commit, checkout и не меняют Git state.

Создать нейтральный Draft или типизированный scaffold:

```bash
docu-docu task init ./docs --area CLI --title "Новая команда" --type Feature
docu-docu scaffold module MOD-CLI ./docs --title "CLI"
```

Без `--lang` команды используют поддерживаемый `project.locale` из
`.docu-docu/config.yml`; для отсутствующего или неподдерживаемого locale fallback
равен `en`. Явный `--lang en|ru` имеет приоритет.

## CLI и skill-workflow

Go CLI отвечает за детерминированные операции над известными входами:

- `check` проверяет;
- `build` создаёт статический портал;
- `serve` добавляет локальный editor workspace;
- `changes`, `search`, `scaffold` и `task ...` решают отдельные read-only или
  явно изменяющие задачи.

Агентские workflow не являются командами Go CLI:

- `$use-docu-docu init` инициализирует минимальную документацию и managed
  guidance только по явному запросу;
- `$use-docu-docu refresh` сверяет всю исходную документацию с repository
  evidence;
- `$use-docu-docu refresh diff` начинает с staged, unstaged и untracked изменений
  относительно `HEAD` и расширяет review на зависимые документы;
- `$use-docu-docu translate` обновляет отдельное locale tree, сохраняя canonical
  `docs/` источником project model и task context.

Docu-docu намеренно не добавляет CLI-команды `init`, `refresh`, `translate` или
отдельный `workspace`.

## Справка и контракты

Root help показывает карту команд, а контекстный help — только применимые
параметры, пример и побочные эффекты:

```bash
docu-docu --help
docu-docu build --help
docu-docu changes file --help
docu-docu task --help
docu-docu task verify --help
docu-docu scaffold --help
```

Полный публичный CLI-контракт и exit codes находятся в
[docs/contracts/cli.md](docs/contracts/cli.md). Work item статусы, обязательные
разделы, критерии, проверки и архив описаны только в
[docs/guides/work-items.md](docs/guides/work-items.md).

Конфигурация тем, branding, locale и translations:
[docs/reference/configuration.md](docs/reference/configuration.md). Возможности
портала и документной модели: [docs/reference/features.md](docs/reference/features.md).

## Разработка

Обязательный цикл проверки:

```bash
gofmt -w .
go vet ./...
go test ./...
go test -race ./...
go run ./cmd/docu-docu check ./docs --strict --stale-days 0
```

Подробности находятся в [CONTRIBUTING.md](CONTRIBUTING.md) и
[docs/guides/testing.md](docs/guides/testing.md). Лицензия —
[LICENSE](LICENSE); сведения о встроенных third-party assets —
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
