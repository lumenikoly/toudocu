# Локальная работа с порталом

Для локального browser runtime используется существующая команда:

```bash
docu-docu serve ./docs
```

Она строит ту же Go project model и тот же базовый портал, затем добавляет live
rebuild, Editor, Changes и offline API docs. Server-only UI включается явными
capabilities и обращается только к same-origin endpoints текущего listener.

По умолчанию listener доступен на `http://127.0.0.1:8080`. `--host 0.0.0.0`
расширяет trust boundary на локальную сеть; встроенных TLS и authentication нет.

Отдельной команды preview нет. Для публикации выполните `docu-docu build` и
разместите output на [static HTTP hosting](deployment.md).

## Связанные документы

- [UC-DOCS-03: Локальный сервер](../use-cases/serve-portal.md)
- [Editor HTTP contract](../contracts/editor-http.md)
- [Changes HTTP contract](../contracts/changes-http.md)
