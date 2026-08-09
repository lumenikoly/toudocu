# UC-REVIEW-01: Обсудить изменения и передать feedback агенту

- Идентификатор: UC-REVIEW-01
- Статус: Готово
- Актор: Разработчик
- Модуль: MOD-REVIEW
- Приоритет: Высокий
- Экраны: SC-CHANGES-WORKSPACE
- Начальный экран: SC-CHANGES-WORKSPACE
- Конечные экраны: SC-CHANGES-WORKSPACE
- Последнее обновление: 2026-08-09

Разработчик проводит локальное review repository-wide изменений,
обсуждает точные фрагменты и передаёт новые сообщения AI-агенту
через локальный skill workflow.

## Предусловия

- canonical portal запущен через `serve` внутри Git repository;
- для записи feedback выбран `target=working-tree`.

## Основной сценарий

1. Разработчик открывает вкладку «Изменения» и выбирает Git range.
2. Toudocu показывает секции «Изменённые» и «Связанные» без
   добавления новой верхнеуровневой вкладки.
3. Разработчик выделяет lines или exact text в diff/file viewer,
   выбирает тип и создаёт discussion.
4. Backend проверяет target, сам извлекает anchor и атомарно
   сохраняет discussion в user-state.
5. Разработчик редактирует или удаляет unsent message либо
   добавляет reply, а затем выбирает «Отправить агенту».
6. Skill получает oldest pending snapshot, вносит обоснованные
   изменения, выполняет релевантные проверки и отправляет полный response.
7. Toudocu атомарно добавляет agent message в каждый исходный
   thread; developer отдельно resolve или reopen discussion.

## Альтернативные сценарии

- Commit/index target остаётся read-only и показывает причину.
- Linked file не сохраняется в review state до первого comment.
- При смене содержимого anchor переносится однозначно либо получает
  явный `stale`/`deleted` placement.
- Невалидный или неполный agent response не меняет ни одного thread.
- Повреждённый store возвращает diagnostic и не перезаписывается.

## Постусловия

- review state остаётся локальным и вне repository;
- отправленные snapshots и ответы неизменяемы;
- ни `fixed`, ни другой agent outcome не закрывает discussion автоматически.

## Бизнес-правила

- [BR-REVIEW-001](../modules/MOD-REVIEW.md#br-review-001-feedback-writable-только-для-working-tree)
- [BR-REVIEW-002](../modules/MOD-REVIEW.md#br-review-002-передача-не-запускает-агента)
- [BR-REVIEW-003](../modules/MOD-REVIEW.md#br-review-003-отправленное-неизменяемо)

## Реализация

- [MOD-REVIEW](../modules/MOD-REVIEW.md)
- [SC-CHANGES-WORKSPACE](../screens/SC-CHANGES-WORKSPACE.md)
- [FLOW-REVIEW-FEEDBACK](../flows/FLOW-REVIEW-FEEDBACK.md)
