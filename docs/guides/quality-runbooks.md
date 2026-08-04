# Standards, Runbooks и Custom-разделы

Руководство описывает авторский контракт опциональных разделов. Глобально
обязателен только `index.md`; отсутствие manifest у появившегося
`quality/`, `runbooks/` или custom-раздела является warning и становится gate
только с `--strict`.

## Стандарты

Каждый `quality/*.md`, кроме `quality/index.md`, объявляет один уникальный
`STD-*`.

Обязательная для полезного документа структура:

- `Идентификатор` / `Identifier`: корректный `STD-*`; ошибка при неверном или
  повторном ID;
- `Владелец` / `Owner`, `Область` / `Scope`, ISO-дата
  `Последнее обновление` / `Last updated`: warning при отсутствии или ошибке;
- статус `Черновик` / `Draft`, `Действует` / `Active` или `Effective`,
  `Устарел` / `Obsolete` или `Deprecated`, `Заменён` / `Superseded`;
- непустые `Правила` / `Rules` и `Автоматические проверки` /
  `Automated checks`: warning при отсутствии;
- заменённый стандарт указывает `Заменён` / `Superseded by: STD-*`; неверная,
  неизвестная или self-ссылка является error.

Команды из стандарта не исполняются. Work item с непустым `Стандарты` объявляет
собственную mapping `QUALITY`.

## Runbooks

Каждый `runbooks/*.md`, кроме `runbooks/index.md`, объявляет один уникальный
`RB-*`. Неверный или повторный ID и недоступная либо небезопасная Markdown-ссылка
являются errors.

Поля `Владелец` / `Owner`, `Среда` / `Environment`, `Риск` / `Risk`, статус и
ISO-дата `Последняя проверка` / `Last verified` проверяются warnings. Статусы:
`Черновик` / `Draft`, `Действует` / `Active`, `Требует проверки` /
`Requires review`, `Устарел` / `Obsolete` или `Deprecated`. Риск:
`Низкий` / `Low`, `Средний` / `Medium`, `Высокий` / `High`,
`Критический` / `Critical`.

Непустыми должны быть:

- `Предварительные условия` / `Prerequisites`;
- `Процедура` / `Procedure` с нумерованными шагами;
- `Проверка` / `Verification`;
- `Откат` / `Rollback`.

Для высокого и критического риска дополнительно нужны
`Условия остановки` / `Stop conditions`.

Для действующего runbook валидная дата в пределах `--stale-days` означает
`recent`, более старая — `overdue`. Значение `--stale-days 0` отключает только
age-based overdue. Отсутствующая, неверная или будущая дата, а также статус
`Requires review`, означают `review-required`. Draft и obsolete с валидной
датой имеют freshness `not-applicable`.

## Custom-разделы

Неизвестный верхнеуровневый каталог с Markdown не классифицируется по имени,
числу файлов или содержанию. Его `index.md` содержит:

- `Тип: Custom` / `Type: Custom`;
- владельца;
- непустое описание;
- H1, который становится названием раздела в навигации.

Отсутствие или неполнота manifest являются warnings. Остальные документы
раздела остаются обычным Markdown.

## Task context и JSON

Поля `Стандарты` / `Standards` и `Затронутые runbooks` /
`Affected runbooks` принимают только существующие ID. Task context включает
явно связанные записи в typed collections, `documents` и `requiredReads`.
Автоматического сопоставления task scope с `Scope` стандарта нет.

ProjectReport schema v1 аддитивно содержит `knowledge.standards`,
`knowledge.runbooks`, task ID collections и четыре runbook-метрики. Пустые
коллекции сериализуются как `[]`; версия schema и генератора не меняется.
