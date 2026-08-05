# Карта API и программных интерфейсов

Страница помогает разработчику или интегратору выбрать действующий интерфейс
Docu-docu и перейти к его полному контракту. Это навигационный обзор, а не
OpenAPI-схема: форматы, endpoints и правила совместимости остаются в связанных
контрактах.

| Интерфейс | Доступность | Назначение | Граница чтения и записи | Результат | Контракт |
|---|---|---|---|---|---|
| CLI | Установленный бинарник или `go run ./cmd/docu-docu` в исходном репозитории | Проверка, сборка, `serve`, поиск, task workflow и Git-backed changes | Большинство команд читает документацию; `build` пишет output, `task init`, scaffold, task archive/restore меняют явно выбранные файлы, а `task verify --run` отдельно исполняет разрешённые команды | Текст, exit code или JSON schema v1; для `build` — HTML-портал и `report.json` | [CLI-контракт](../contracts/cli.md) |
| Go API | Корневой Go-пакет; опубликованного удалённого module path пока нет | Встраивание модели, renderer, генератора, task workflow и changes без отдельного процесса | Эффекты определяются вызванной операцией; чтение, запись и исполнение не скрываются за единым неявным entrypoint | Go-типы моделей, отчётов и ошибок; JSON только при явной сериализации | [Go API-контракт](../contracts/go-api.md) |
| JSON reports | `--format json`, `--report` и generated `report.json` у поддерживающих операций | CI, агенты и интеграции читают ту же типизированную модель, что использует портал | Отчёты не меняют Markdown; CLI может записать явно указанный report или output | Versioned JSON schema v1: `ProjectReport`, task/search/scaffold reports и change reports | [CLI-контракт и схемы отчётов](../contracts/cli.md#projectreport-schema-v1) |
| Editor HTTP API | Только canonical portal, запущенный через `docu-docu serve` | Список, чтение, preview, validation, создание и CAS-сохранение workspace-файлов | Читает разрешённые `.md`, `.yaml`, `.yml`, `.json`; только явные guarded create/save записывают внутри documentation root | JSON schema v1; raw source для отдельного read-only запроса | [Editor HTTP contract](../contracts/editor-http.md) |
| Changes HTTP API | Только `docu-docu serve`, same-origin UI или HTTP-клиент | Read-only сравнение Git-состояний, файлов, rendered content, screen overlay и task impact | Читает локальные Git revisions и documentation roots; не изменяет Git или Markdown | `ChangeSetReport` и связанные JSON schema v1, plain content либо sanitized HTML | [Changes HTTP contract](../contracts/changes-http.md) |
| Ручная пересборка | Только canonical portal в режиме `serve` | По явному запросу заново построить модель, HTML и поиск | Читает canonical documentation root и пишет generated output; Markdown не изменяет | Success JSON `{documents, pages, warnings, errors}` без `schemaVersion`; ошибки — plain text | [Editor HTTP contract: ручная пересборка](../contracts/editor-http.md#ручная-пересборка-портала) |

Editor API и ручная пересборка отсутствуют в translation portal. Changes API
остаётся read-only. Ни один HTTP-интерфейс не запускает Git-команды записи,
shell-команды или task verification.
