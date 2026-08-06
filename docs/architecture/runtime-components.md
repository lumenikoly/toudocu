# Разделение ответственности runtime-компонентов

- Тип документа: Architecture
- Архитектурный вопрос: Как runtime-компоненты делят ответственность?

Runtime образует последовательный конвейер: CLI либо прямой вызов Go API задаёт
операцию, document/OpenAPI слой извлекает безопасное представление, модель
проверяет структуру и связи, а выбранный потребитель возвращает отчёт, строит
портал или выполняет отдельно разрешённый task workflow.

## Область

Ответ показывает крупные runtime-границы одного Go-процесса. Локальные
инварианты и интерфейсы принадлежат соответствующим module-документам.

## Компоненты

`internal/markdown` выполняет один цикл `Parse → Analysis → Render`: Goldmark
AST остаётся закрытым, а project model получает только нормализованные значения
и source ranges. Все структурные потребители используют этот анализ.

`GitChangeSource` разрешает commits/index/working tree и читает status, patches
и blobs. `ChangeSetBuilder` объединяет Git metadata с parser/knowledge model;
source, rendered, semantic, OpenAPI и task engines деградируют независимо.
`ChangesHTTPHandler` отдаёт read-only views, а UI опрашивает digest и сохраняет
URL state при invalidation. Компоненты активны для `changes` и `serve`;
статический `build` от Git не зависит.

| Граница | Ответственность | Источник подробностей |
|---|---|---|
| CLI | Разобрать команду, нормализовать пути и выбрать операцию | [MOD-CLI](../modules/cli.md) |
| Go API | Предоставить типизированный фасад без доступа к `internal/app` | [Обзор публичного Go API](../reference/features.md#публичный-go-api) |
| Markdown | Разобрать CommonMark/GFM в закрытый AST, нормализовать структуру и безопасно отрендерить содержимое | [MOD-MARKDOWN](../modules/markdown.md), [ADR-005](../decisions/ADR-005.md) |
| Project model | Классифицировать документы, проверить OpenAPI, разрешить связи и сформировать diagnostics | [MOD-MODEL](../modules/model.md) |
| Site | Создать backend-independent static HTTP portal или canonical serve workspace с editor, changes и offline API docs | [MOD-SITE](../modules/site.md) |

Статический generator и serve-вариант разделены. Serve хранит отдельные
runtime snapshots canonical и configured translation roots: HTTP читает только
последний успешный snapshot, а watcher перестраивает изменившийся root.
Workspace перечисляет и атомарно записывает разрешённые canonical файлы;
editor API применяет HTTP guards. Любая принятая запись заново
проходит Project model и Site, поэтому browser не формирует параллельную модель.
Декларативные Editor/Changes route registries проверяются против OpenAPI
operations; Swagger UI читает те же specs как same-origin assets.

Screen graph и task workflow расширяют модель, но не обходят её validation
gate. Конкретные последовательности операций остаются в
[FLOW-DOCS-CHECK](../flows/FLOW-DOCS-CHECK.md),
[FLOW-DOCS-BUILD](../flows/FLOW-DOCS-BUILD.md) и
[FLOW-DOCS-SERVE](../flows/FLOW-DOCS-SERVE.md),
[FLOW-TASK-WORKFLOW](../flows/FLOW-TASK-WORKFLOW.md).
