# Перенос локальных review anchors

- Тип документа: Architecture
- Архитектурный вопрос: Как review discussion сохраняет связь с меняющимся содержимым repository?

Review хранит immutable исходную цель и вычисляет её текущее placement на
backend. Browser передаёт только тип цели и 1-based Unicode scalar coordinates;
выделенный текст, context и content digest извлекает Go из проверенного файла.

## Исходный anchor

Для `diff`, `fileRange` и `file` сохраняются исходный path, сторона old/new,
range, selected text, до 2 KiB context с каждой стороны, digest содержимого,
repository revision и content-addressed snapshot. Snapshot создаётся только
для реально сохранённого комментария, ограничен 2 MiB и лежит в user-state вне
repository. `global` не имеет файлового snapshot.

## Текущее placement

После изменения repository backend применяет детерминированную цепочку:

1. одинаковый content digest сохраняет исходные координаты;
2. однозначный Git rename переносит path, а Git line mapping переносит range;
3. exact selected text ищется в окне ±20 строк от исходной позиции;
4. затем допускается единственное exact совпадение во всём файле;
5. затем допускается единственная пара context boundaries с gap до 32 KiB;
6. неоднозначный или изменённый фрагмент получает `stale`, а удалённый файл —
   `deleted`.

Placement является read-only проекцией и не изменяет immutable anchor. Оно
пересчитывается при чтении state относительно текущей repository revision.
Agent `changedPaths` служат только подсказкой для «Посмотреть исправление»;
актуальный Git diff остаётся источником истины.

## Связанные документы

- [MOD-REVIEW](../modules/MOD-REVIEW.md)
- [FLOW-REVIEW-FEEDBACK](../flows/FLOW-REVIEW-FEEDBACK.md)
- [Changes HTTP API](../contracts/changes-http.md)
