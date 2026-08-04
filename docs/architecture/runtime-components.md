# Разделение ответственности runtime-компонентов

- Тип документа: Architecture
- Архитектурный вопрос: Как runtime-компоненты делят ответственность?

Runtime образует последовательный конвейер: CLI нормализует операцию, Markdown
слой извлекает безопасное представление, модель проверяет структуру и связи, а
выбранный потребитель возвращает отчёт, строит портал или выполняет отдельно
разрешённый task workflow.

## Область

Ответ показывает крупные runtime-границы одного Go-процесса. Локальные
инварианты и интерфейсы принадлежат соответствующим module-документам.

## Компоненты

| Граница | Ответственность | Источник подробностей |
|---|---|---|
| CLI | Разобрать команду, нормализовать пути и выбрать операцию | [MOD-CLI](../modules/cli.md) |
| Markdown | Извлечь поддерживаемую структуру и безопасно отрендерить содержимое | [MOD-MARKDOWN](../modules/markdown.md) |
| Project model | Классифицировать документы, разрешить связи и сформировать diagnostics | [MOD-MODEL](../modules/model.md) |
| Site | Создать автономный read-only портал или serve-only editor workspace с live rebuild | [MOD-SITE](../modules/site.md) |

Статический generator и serve-вариант разделены. Workspace перечисляет и
атомарно записывает разрешённые файлы; editor API применяет HTTP guards;
watcher замечает стабильный внешний fingerprint. Любая принятая запись заново
проходит Project model и Site, поэтому browser не формирует параллельную модель.

Screen graph и task workflow расширяют модель, но не обходят её validation
gate. Конкретные последовательности операций остаются в
[FLOW-DOCS-CHECK](../flows/FLOW-DOCS-CHECK.md),
[FLOW-DOCS-BUILD](../flows/FLOW-DOCS-BUILD.md) и
[FLOW-DOCS-SERVE](../flows/FLOW-DOCS-SERVE.md),
[FLOW-TASK-WORKFLOW](../flows/FLOW-TASK-WORKFLOW.md).
