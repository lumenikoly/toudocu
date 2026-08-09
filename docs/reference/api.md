# Карта API и программных интерфейсов

Страница помогает разработчику или интегратору выбрать действующий интерфейс
Docu-docu. Wire-level Editor и Changes contracts определены OpenAPI 3.1.0;
Markdown-ссылки ведут к behavioral companions.

| Интерфейс | Доступность | Назначение | Граница чтения и записи | Результат | Контракт |
|---|---|---|---|---|---|
| CLI | Установленный бинарник или `go run ./cmd/docu-docu` в исходном репозитории | Проверка, сборка, `serve`, поиск, task workflow и Git-backed changes | Большинство команд читает документацию; `build` пишет output, `task init`, scaffold, task archive/restore меняют явно выбранные файлы, а `task verify --run` отдельно исполняет разрешённые команды | Текст, exit code или JSON schema v1; для `build` — HTML-портал и `report.json` | [CLI-контракт](../contracts/cli.md) |
| Go API | Корневой Go-пакет; опубликованного удалённого module path пока нет | Встраивание модели, генератора, task workflow и changes без отдельного процесса | Эффекты определяются вызванной операцией; чтение, запись и исполнение не скрываются за единым неявным entrypoint; Markdown AST/parser/renderer внутренние | Go-типы моделей, отчётов и ошибок; JSON только при явной сериализации | [Обзор возможностей](features.md#публичный-go-api) |
| JSON reports | `--format json`, `--report` и generated `report.json` у поддерживающих операций | CI, агенты и интеграции читают ту же типизированную модель, что использует портал | Отчёты не меняют Markdown; CLI может записать явно указанный report или output | Versioned JSON schema v1: `ProjectReport`, task/search/scaffold reports и change reports | [CLI-контракт и схемы отчётов](../contracts/cli.md#результаты-json) |
| Editor HTTP API | Только canonical portal, запущенный через `docu-docu serve` | Список, чтение, preview, validation, создание, roadmap add и CAS-сохранение workspace-файлов | Читает разрешённые `.md`, `.yaml`, `.yml`, `.json`; только явные guarded create, save и roadmap-add записывают внутри documentation root | JSON schema v1; raw source для отдельного read-only запроса | [OpenAPI](../contracts/editor.openapi.yaml), [поведение](../contracts/editor-http.md) |
| Version status HTTP API | Canonical `docu-docu serve`, если не задан `--no-update-check` | Сравнить текущую версию с latest stable release | Browser обращается same-origin; Go выполняет один ограниченный read-only запрос к фиксированному GitHub endpoint | JSON schema v1 со status `up-to-date`, `update-available` или `unavailable` | [OpenAPI](../contracts/editor.openapi.yaml), [поведение](../contracts/editor-http.md#проверка-версии) |
| Changes HTTP API | `docu-docu serve`, включая прямой read-only serve translation root; configured locale mounts API не получают | Read-only сравнение Git-состояний, файлов, rendered content, screen overlay и task impact | Читает локальные Git revisions и выбранный documentation root; не изменяет Git или Markdown | `ChangeSetReport` и связанные JSON schema v1, raw content либо sanitized HTML | [OpenAPI](../contracts/changes.openapi.yaml), [поведение](../contracts/changes-http.md) |
| Offline API docs | `/_docu-docu/api-docs/` только в canonical `serve` | Selector обоих OpenAPI contracts, просмотр operations и безопасный Try it out | Same-origin; Try it out ограничен `GET`/`HEAD`; CDN отсутствует | Vendored Swagger UI 5.32.12 | [SC-SITE-API-DOCS](../screens/SC-SITE-API-DOCS.md) |
| Ручная пересборка | Только canonical portal в режиме `serve` | По явному запросу заново построить модель, HTML и поиск | Читает canonical documentation root и пишет generated output; Markdown не изменяет | Success JSON `{documents, pages, warnings, errors}` без `schemaVersion`; ошибки — plain text | [Editor OpenAPI](../contracts/editor.openapi.yaml), [поведение](../contracts/editor-http.md) |

Editor API и API docs отсутствуют в любом translation portal. Configured locale
mount также не получает Changes API; при прямом `serve` translation root
Changes API остаётся доступным только для чтения. Ни один HTTP-интерфейс не
запускает Git-команды записи, shell-команды или task verification.
