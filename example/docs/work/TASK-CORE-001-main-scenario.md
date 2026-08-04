# TASK-CORE-001: Реализовать основной сценарий

- Статус: В работе
- Тип: Feature
- Приоритет: Высокий
- Модуль: MOD-CORE
- Сценарий: UC-CORE-01
- Процесс: FLOW-CORE-REQUEST
- Экраны: SC-CORE-HOME, SC-CORE-REQUEST, SC-CORE-HELP, SC-CORE-RESULT
- Переходы: TR-CORE-001, TR-CORE-002, TR-CORE-003, TR-CORE-004, TR-CORE-005
- Владелец: Команда проекта
- Последнее обновление: 2026-07-29

## Результат

Основной сценарий выполняется согласно критериям приёмки.

## Область изменения

- `docs/screens/`;
- `docs/use-cases/core.md`;
- `docs/contracts/api.md`.

## Не входит в задачу

- реализация внешнего Support Center;
- изменение публичного API за пределами `CON-CORE-API`;
- хранение реальных пользовательских данных.

## Критерии приёмки

- [ ] `AC-01` С главного экрана можно открыть новый запрос.
- [ ] `AC-02` Из запроса можно открыть подсказку.
- [ ] `AC-03` Подсказку можно закрыть с возвратом к запросу.
- [ ] `AC-04` Корректный запрос открывает результат.
- [ ] `AC-05` Некорректный запрос остаётся на текущем экране с ошибкой.

## Проверка

- `AC-01` → `TR-CORE-001` → `TestOpenRequest`
- `AC-01` → `test -f ./d[o]cs/screens/SC-CORE-HOME.md`
- `AC-02` → `TR-CORE-002` → `TestOpenHelp`
- `AC-02` → `test -f ./d[o]cs/screens/SC-CORE-HELP.md`
- `AC-03` → `TR-CORE-003` → `TestCloseHelp`
- `AC-03` → `test -f ./d[o]cs/screens/SC-CORE-HELP.md`
- `AC-04` → `TR-CORE-004` → `TestSubmitRequest`
- `AC-04` → `test -f ./d[o]cs/screens/SC-CORE-RESULT.md`
- `AC-05` → `TR-CORE-005` → `TestInvalidRequest`
- `AC-05` → `test -f ./d[o]cs/contracts/api.md`

## План

1. Реализовать переход с главной страницы к форме.
2. Добавить подсказку и возврат к форме.
3. Обработать успешную и ошибочную отправку.
4. Связать критерии с переходами и проверками.

## Влияние на документацию

Обновляются use case, экранные переходы, flowchart и API-контракт ошибок.
