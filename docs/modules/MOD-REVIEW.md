# MOD-REVIEW: Локальное ревью изменений

- Идентификатор: MOD-REVIEW
- Статус: Готово
- Владелец: Команда Toudocu
- Последнее обновление: 2026-08-09

Модуль владеет локальными discussion threads поверх repository-wide Git
comparison и неизменяемыми feedback snapshots для установленного
AI-skill. Он не запускает агента и не вызывает LLM.

## Назначение

Дать разработчику в canonical `serve` связать комментарии с
актуальными строками Git-изменений или linked files, передать новые
сообщения агенту через локальную FIFO-очередь и показать ответ
в исходном thread.

## Расположение в коде

- `internal/app/review_*.go` — repository projection, application services,
  persistence, re-anchoring, HTTP и CLI;
- `web/src/features/changes/` и `web/src/styles/changes.css` — review UI в
  существующем Changes workspace;
- `skills/toudocu/` — agent-side FIFO feedback workflow.

## Границы

Review доступен только canonical `serve`. Static portal, locale mounts и
direct translation serve не получают review capability. Сессии и
snapshots хранятся в user-state вне repository; Git working tree, index,
refs и history модуль не изменяет.

## Бизнес-правила

### BR-REVIEW-001: Feedback writable только для working tree

Любой поддерживаемый base и target можно просматривать, но
комментарии и feedback можно изменять только при
`target=working-tree`.

### BR-REVIEW-002: Передача не запускает агента

Кнопка в UI атомарно фиксирует новые human messages открытых
discussions. Установленный skill сам забирает oldest pending snapshot
через CLI и отвечает полным schema-v1 response.

### BR-REVIEW-003: Отправленное неизменяемо

До передачи разрешено редактировать и удалять единственное
unsent human message. После передачи message и feedback snapshot
неизменяемы; продолжение обсуждения — новый reply.

## Инварианты

- Browser не сохраняет selected text и context: Go извлекает их по
  1-based Unicode scalar coordinates.
- Каждая mutation имеет CAS по revision/state digest, OS-level lock и
  атомарную замену state.
- Response принимается только целиком и содержит ровно один
  валидный result для каждого feedback item.
- `fixed` не закрывает discussion; состояние только `open|resolved`.
- Фактический Git diff, а не `changedPaths` агента, остаётся
  source of truth для изменений repository.

## Стабильные интерфейсы

- internal schema-v1 review DTO, не экспортируемые через `api.go`;
- `/_toudocu/api/changes/review/` в canonical `serve`;
- `toudocu changes feedback pending|respond`;
- [Changes HTTP contract](../contracts/changes-http.md);
- [FLOW-REVIEW-FEEDBACK](../flows/FLOW-REVIEW-FEEDBACK.md);
- [Перенос review anchors](../architecture/review-anchoring.md);
- [UC-REVIEW-01](../use-cases/UC-REVIEW-01.md).

## Связанные сценарии

- [UC-REVIEW-01: Обсудить изменения и передать feedback агенту](../use-cases/UC-REVIEW-01.md)
