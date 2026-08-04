# MOD-CHANGES: Изменения документации

- Идентификатор: MOD-CHANGES
- Статус: Готово
- Владелец: Команда Docgent
- Последнее обновление: 2026-08-03

Модуль превращает явно выбранные Git-состояния исходной документации в
детерминированный отчёт для CLI, CI и локального портала.

## Назначение

Получать read-only Git snapshots, точно показывать текстовые изменения и
дополнять их сравнением нормализованной проектной модели без LLM.

## Расположение в коде

- `internal/app/changes_*.go` — comparison, Git adapter, отчёты и специализированные diff;
- `internal/app/server.go` — read-only changes API и live invalidation;
- `internal/app/assets/changes.*` — serve-only интерфейс просмотра.

## Границы

Модуль не изменяет working tree, index, refs или Git history. Статический
`build` не получает историю и не включает changes API. Рендеринг Markdown
остаётся ответственностью `MOD-MARKDOWN`, а оболочка портала — `MOD-SITE`.

## Бизнес-правила

### BR-CHANGES-001: Git является единственным источником версий

Старая сторона читается из object database или index, новая — из явно
выбранного revision, index или working tree. Docgent не сохраняет собственную
историю документации.

### BR-CHANGES-002: Исходный diff имеет приоритет

Ошибка semantic, rendered, Mermaid или OpenAPI анализа не скрывает доступный
Git patch и статистику файла.

### BR-CHANGES-003: Диапазон всегда явный

Отчёт и UI показывают requested и resolved base/target, branch, HEAD и dirty
state. Неоднозначная базовая ветка требует выбора пользователя.

### BR-CHANGES-004: Анализ ограничен документационными roots

Публичные пути каноничны, относительны repository root и не дают прочитать
`.git` либо файлы вне разрешённых roots.

## Инварианты

- Git вызывается напрямую без shell, external diff, textconv и fetch;
- semantic diff детерминирован и не использует LLM;
- task-файл не входит в сводку постоянной документации;
- full source и rendered payload загружаются лениво;
- существующие `check` и статический `build` сохраняют прежний результат.

## Стабильные интерфейсы

- `ChangeSetReport` schema v1;
- CLI `changes` и `task changes`;
- read-only `/_docgent/api/changes/`;
- diagnostic codes и comparison enums.

## Связанные сценарии

- [UC-DOCS-05: Просматривать изменения документации](../use-cases/UC-DOCS-05.md)
