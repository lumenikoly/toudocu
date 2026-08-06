# Безопасный Markdown

- Идентификатор: MOD-MARKDOWN
- Статус: Готово
- Владелец: Команда Docu-docu
- Последнее обновление: 2026-08-06

Модуль превращает CommonMark и разрешённые GFM-конструкции в единую
нормализованную модель и безопасный HTML без исполнения встроенного содержимого.

## Назначение

Поддержать проектные документы, таблицы, списки, чек-листы, ссылки, изображения,
цитаты, код и ограниченные Mermaid fences без внешнего Markdown runtime.

## Расположение в коде

- AST, анализ и renderer: `internal/markdown/`;
- преобразование в project model: `internal/app/markdown_parse.go`;
- portal integration: `internal/app/markdown_render.go`;
- нормализация и экранирование: `internal/app/utils.go`;
- поведенческие тесты: `internal/app/markdown_test.go`.

## Границы

Goldmark AST закрыт внутри модуля и не входит в публичный Go facade или JSON.
Включены CommonMark, tables, task lists, strikethrough и literal autolinks;
attributes, front matter, footnotes, definition lists и typographer не входят в
dialect. Связи с репозиторием и копирование assets определяются проектной моделью.

## Бизнес-правила

### BR-MD-001: Пользовательский HTML является policy error

Raw block/inline HTML, в том числе внутри таблиц, создаёт
`forbidden-raw-html`. `check` и `build` завершаются неуспешно, а preview и
rendered diff показывают исходник только как escaped text.

### BR-MD-002: Опасные протоколы и активные assets блокируются

Ссылки с опасными схемами, а также HTML, JavaScript, SVG и XML из документации
не становятся активными ресурсами портала.

### BR-MD-003: Mermaid остаётся визуализацией

Разрешены только `flowchart`, `stateDiagram-v2` и `sequenceDiagram` размером до
50 000 байт. Mermaid front matter и directives запрещены. Узлы и переходы не
становятся требованиями, критериями приёмки или элементами roadmap.
Сгенерированная карта экранов получает структуру только из таблиц
`screens/SC-*.md`, а не из Mermaid source.

## Инварианты

- fenced code не анализируется как заголовки, ссылки или задачи;
- одинаковые заголовки получают уникальные anchors;
- source ranges используют 0-based byte offsets и 1-based line/column;
- metadata — только первый top-level unordered list сразу после H1;
- неизвестный или неподдерживаемый синтаксис остаётся безопасным текстом;
- локальные изображения ограничены безопасными растровыми форматами;
- `sequenceDiagram` подчиняется общим правилам связи Mermaid-документов;
- конкретные последовательности запросов описываются значимыми `FLOW-*`, а
  простые операции остаются в API-контрактах;
- документ с Mermaid связан с use case или архитектурой.

## Стабильные интерфейсы

Высокоуровневые операции document model, `check`, `build`, `serve`, editor и
changes используют одну нормализованную модель. Низкоуровневый parser/renderer
намеренно не является публичным Go API.

## Связанные сценарии

- [UC-DOCS-01: Сборка портала](../use-cases/build-portal.md)
- [UC-DOCS-02: Проверка документации](../use-cases/check-documentation.md)
