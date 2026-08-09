# UC-DOCS-05: Просматривать изменения документации

- Идентификатор: UC-DOCS-05
- Статус: Готово
- Актор: Разработчик
- Модуль: MOD-CHANGES
- Приоритет: Высокий
- Экраны: SC-SITE-HOME, SC-CHANGES-WORKSPACE
- Начальный экран: SC-SITE-HOME
- Конечные экраны: SC-CHANGES-WORKSPACE
- Последнее обновление: 2026-08-09

Разработчик рассматривает изменения исходной документации в терминах Git,
отрендерированных страниц и проектных сущностей перед завершением задачи.

## Входные данные

- documentation root;
- явные base и target либо режим по умолчанию `HEAD → working-tree`;
- необязательные фильтры, включение assets или полного translation input и
  связанная задача.

## Предусловия

- Git установлен, а documentation root находится внутри локального репозитория;
- выбранные revisions уже доступны локально.

## Основной сценарий

1. Разработчик открывает `/changes` или запускает `docu-docu changes`.
2. Docu-docu разрешает и показывает base/target без изменения Git.
3. Пользователь получает сводку permanent и work artifacts.
4. Пользователь фильтрует документы и открывает source, rendered, semantic или
   специализированный diff.
5. Для задачи пользователь сопоставляет declared documentation impact с
   фактическими изменениями.

## Альтернативные сценарии

- Без Git портал продолжает работать, а раздел изменений объясняет ограничение.
- Ошибка parsing одной стороны оставляет source diff доступным.
- Большой или binary файл показывает metadata и diagnostic без падения отчёта.
- При изменении working tree текущий change set становится stale и заменяется
  новым с сохранением применимых фильтров.

## Постусловия

- Git repository не изменён;
- человек и CI получают один и тот же versioned change report;
- предупреждения task impact остаются наблюдением, а не автоматическим решением.

## Бизнес-правила

- [BR-CHANGES-001](../modules/MOD-CHANGES.md#br-changes-001-git-является-единственным-источником-версий)
- [BR-CHANGES-002](../modules/MOD-CHANGES.md#br-changes-002-исходный-diff-имеет-приоритет)
- [BR-CHANGES-003](../modules/MOD-CHANGES.md#br-changes-003-диапазон-всегда-явный)
- [BR-CHANGES-004](../modules/MOD-CHANGES.md#br-changes-004-анализ-ограничен-документационными-roots)

## Реализация

- [Изменения документации](../modules/MOD-CHANGES.md)
- [FLOW-DOCS-CHANGES](../flows/FLOW-DOCS-CHANGES.md)
