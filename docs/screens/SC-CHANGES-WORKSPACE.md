# SC-CHANGES-WORKSPACE: Изменения

- Идентификатор: SC-CHANGES-WORKSPACE
- Тип: Экран
- Модуль: MOD-CHANGES
- Статус: Реализован
- Маршрут: `/changes/`
- Превью: `../assets/screens/changes-workspace.png`
- Последнее обновление: 2026-08-09

Workspace сравнения выбранных Git-состояний: существующие documentation
представления дополняются repository-wide файлами и локальными discussions.
Обычный `changes` и публичный `ChangeSetReport` остаются documentation-scoped.

## Оболочка и состояния

Общий workspace header показывает project branding, переходы в портал,
Редактор и Изменения, активные Изменения через `aria-current`, а также тему
оформления и цветовую схему. Следующая компактная строка объединяет заголовок,
Git range, файловую сводку и действие «Обсуждения». Base, optional branch base,
target revision, resolved state, branch/dirty state и действие применения
находятся в нативном disclosure. Он закрывается после применения, по `Esc` и
клику снаружи, возвращая focus на summary.

Смена оформления применяется сразу и сохраняется для остальных поверхностей.
Read-only CodeMirror merge обновляет theme compartment без сброса выбранного
документа и tab. Активный Mermaid diff перерисовывается, сохраняя отчёт,
поиск, статус и URL state. Устаревшие параметры вторичных фильтров и группировки
игнорируются.

## Repository files и комментарии

Список всегда сортируется по path и делится на «Изменённые» и «Связанные».
Поиск и статус находятся в самой панели файлов; строки не повторяют filename в
path. Picker ищет только по path/name; linked file остаётся client-side до
первого `fileRange` или `file` comment.

Первый подходящий файл автоматически открывается на вкладке «Исходник». Явный
`path/tab` и выбранный файл при watcher refresh имеют приоритет; фильтр выбирает
первый оставшийся файл или показывает компактное empty state. Старый
`tab=summary` открывает source. Отдельной вкладки «Сводка» нет. Статус, path и
line stats остаются в header, а diagnostics появляются только при наличии;
severity `error` раскрывает их автоматически. Документационные файлы сохраняют
только применимые rendered, semantic, relations, OpenAPI, Mermaid, assets и map
вкладки. JSON, YAML, Markdown, Go, Java и JavaScript/TypeScript получают
language support, прочий UTF-8 — plain text.
Unified и Side-by-side образуют один переключатель, а copy diff остаётся
tertiary action.

Комментарий создаётся из gutter `+`, выделенного line range/exact text,
действия файла или общего действия в header discussions. Composer содержит
только сообщение; `Ctrl`/`Cmd`+`Enter` отправляет,
`Esc` отменяет и focus возвращается к точке входа. Mixed old/new selection не
принимается, а context line относится к new side.

При нуле comments правая панель скрыта. После первого comment она открывается,
а файл и действие «Обсуждения» получают число открытых threads. Единственное
unsent human message можно изменить или удалить; после feedback оно immutable,
а продолжение создаётся reply. Пока thread находится in-flight, новый reply
недоступен. Agent outcome показан текстом и не закрывает thread автоматически.

## Обновление и responsive states

Repository ETag и review ETag опрашиваются отдельно. При изменении repository
для выбранного файла появляется banner, а без выбранного файла projection
обновляется автоматически. Refresh сохраняет выбранный tab, thread и scroll.
Draft stale composer сохраняет текст, но требует заново выбрать anchor.

Desktop использует полноэкранный split с внутренней прокруткой: около 300 px для
файлов, остальное для diff и третья колонка только при открытом discussions.
Tablet использует discussions drawer справа, mobile — отдельные Files и
Discussions drawers без горизонтального page overflow. Drawer сообщает dialog
semantics и `aria-modal`, закрывается `Esc`, имеет видимый focus и touch targets.
State, placement и outcome выражены текстом, а не только цветом.

## Capability

Review controls и API доступны только canonical `serve`. Commit, index и
произвольный commit target можно просматривать, но mutations разрешены только
для working tree. Static build, locale mounts и direct translation serve не
получают capability `review`.

## Связанные документы

- [UC-REVIEW-01](../use-cases/UC-REVIEW-01.md)
- [MOD-REVIEW](../modules/MOD-REVIEW.md)
- [FLOW-REVIEW-FEEDBACK](../flows/FLOW-REVIEW-FEEDBACK.md)
- [Changes HTTP API](../contracts/changes-http.md)
- [TASK-CHANGES-002](../work/TASK-CHANGES-002.md)
