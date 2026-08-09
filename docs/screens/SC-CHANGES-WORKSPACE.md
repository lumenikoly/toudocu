# SC-CHANGES-WORKSPACE: Изменения

- Идентификатор: SC-CHANGES-WORKSPACE
- Тип: Экран
- Модуль: MOD-CHANGES
- Статус: Реализован
- Маршрут: `/changes/`
- Превью: `../assets/screens/changes-workspace.png`
- Последнее обновление: 2026-08-06

Workspace сравнения выбранных Git-состояний: существующие documentation
представления дополняются repository-wide файлами и локальными discussions.
Обычный `changes` и публичный `ChangeSetReport` остаются documentation-scoped.

## Оболочка и состояния

Общий workspace header показывает project branding, переходы в портал,
Редактор и Изменения, активные Изменения через `aria-current`, а также тему
оформления и цветовую схему. Base, optional branch base, target revision и
действие сравнения находятся в отдельной контекстной панели.

Смена оформления применяется сразу и сохраняется для остальных поверхностей.
Read-only CodeMirror merge обновляет theme compartment без сброса выбранного
документа и tab. Активный Mermaid diff перерисовывается, сохраняя отчёт,
фильтры и URL state. На узком экране метрики, список и diff используют только
локальную прокрутку без горизонтального overflow страницы.

## Repository files и комментарии

Список делится на «Изменённые» и «Связанные». Picker ищет только по path/name;
linked file остаётся client-side до первого `fileRange` или `file` comment.
Документационные файлы сохраняют вкладки сводки, исходника, rendered,
семантики, связей, OpenAPI, Mermaid, assets и карты. Go, Java,
JavaScript/TypeScript получают language support, прочий UTF-8 — plain text.

Комментарий создаётся из gutter `+`, выделенного line range/exact text,
действия файла или общего действия. Composer содержит только тип
`issue|suggestion|question|praise` и сообщение; `Ctrl`/`Cmd`+`Enter` отправляет,
`Esc` отменяет и focus возвращается к точке входа. Mixed old/new selection не
принимается, а context line относится к new side.

При нуле comments правая панель скрыта. После первого comment она открывается,
а файл и действие «Обсуждения» получают число открытых threads. Единственное
unsent human message можно изменить или удалить; после feedback оно immutable,
а продолжение создаётся reply. Пока thread находится in-flight, новый reply
недоступен. Agent outcome показан текстом и не закрывает thread автоматически.

## Обновление и responsive states

Repository ETag и review ETag опрашиваются отдельно. Изменение неактивного файла
обновляет projection автоматически. Для открытого файла появляется banner;
refresh сохраняет выбранный tab, thread и scroll. Draft stale composer сохраняет
текст, но требует заново выбрать anchor.

Desktop использует collapsible discussions panel, tablet — drawer справа,
mobile — отдельные Files и Discussions drawers. Drawer сообщает dialog
semantics и `aria-modal`, закрывается `Esc`, имеет видимый focus и touch targets.
Тип, state, placement и outcome выражены текстом, а не только цветом.

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
