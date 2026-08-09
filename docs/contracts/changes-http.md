# Changes HTTP API: поведение и границы

- Идентификатор: CON-CHANGES-HTTP-V1
- Статус: Готово
- Владелец: Команда Toudocu
- Последнее обновление: 2026-08-05

[OpenAPI 3.1.0](changes.openapi.yaml) содержит маршруты, параметры, коды ответа
и схемы данных. В canonical `serve` на этой странице также появляется кнопка
для открытия спецификации в Swagger UI.

Этот документ отвечает на другой вопрос: откуда API берёт изменения и какие
ограничения сохраняет при чтении Git и файлов.

## Доступность

Documentation Changes API работает только в `serve` и ничего не записывает.
При прямом запуске translation root он читает выбранный root; locale-разделы
canonical portal отдельного API не получают.
Go включает changes UI только при capability `changes` и передаёт same-origin
API base в versioned page bootstrap; static frontend endpoint не содержит.

Repository Review API существует в том же OpenAPI только для canonical
`serve`. Static, locale mounts и direct translation serve не получают
capability или routes. Просмотр поддерживает любой обычный base/target;
discussion, feedback и cleanup mutations разрешены только для working tree.

## Сравнение версий

API сравнивает локальные commits, index и working tree без `fetch`, `checkout`
и изменения Git-состояния. Параметр `branchBase` вычисляет merge base с `HEAD`.
Если вместе с ним указан `base`, обе ссылки должны разрешаться локально.

ETag вычисляется из отфильтрованного набора изменений. Кэш учитывает comparison,
текущую revision документации, `HEAD`, Git status и разрешённые revisions,
поэтому изменение index или working tree не возвращает устаревший отчёт.

Summary не содержит полный patch. Детальный отчёт, исходное содержимое и
HTML-представление строятся только для запрошенного файла.

## Безопасность чтения

Путь должен быть относительным POSIX-путём внутри разрешённого documentation
root. Абсолютные пути, `..`, обратная косая черта, `.git`, symlink-выход и путь
за пределами root отклоняются.

Исходное содержимое возвращается с определённым сервером media type,
`X-Content-Type-Options: nosniff` и запретительной CSP. Markdown перед выдачей
как `text/html` проходит безопасный renderer. SVG не получает права выполнять
скрипты, загружать сеть или применять встроенные стили.

Ошибка анализа отдельного представления — semantic diff, Mermaid, OpenAPI,
экрана или asset — остаётся локальной диагностикой и не скрывает доступный
исходный diff.

## Repository review и local state

`/_toudocu/api/changes/review/` строит отдельную repository-wide проекцию
tracked и untracked non-ignored files. Она переиспользует read-only Git adapter,
но не меняет `ChangeSetReport`, обычный CLI `changes` или публичный Go-фасад.
Полные before/current bytes и patch загружаются лениво. UTF-8/NUL, binary,
2 MiB limit и path safety проверяет Go; documentation files дополнительно
получают существующее enrichment.

Discussion state находится в platform user-state вне repository. Каждая
mutation требует JSON, точный `X-Toudocu-Action`, same-origin browser context,
expected revision и state digest. Межпроцессный lock и CAS дают `409`, busy
store — отдельный `REVIEW_STATE_BUSY`, oversized input — `413`, binary — `415`,
unsafe path/symlink — `403`, неизвестный ID — `404`, недоступный Git — `503`,
а corrupted store — `500` без автоматической перезаписи.

Review ETag объединяет persisted state digest с текущей repository revision,
поэтому изменение Git projection инвалидирует вычисленные placements даже без
review mutation. Он опрашивается независимо от ETag repository report.

Feedback snapshot включает все unsent messages открытых discussions. Pending
выдаётся FIFO по одному и повторяет oldest snapshot до полного response. Agent
response принимается только для oldest pending batch и атомарно содержит ровно
один result на item с outcome, message и
безопасными repository-relative `changedPaths`; `fixed` не меняет
`Discussion.state`. Полные schemas, limits, examples и statuses принадлежат
[OpenAPI](changes.openapi.yaml).

## Связанные документы

- [Почему wire-контракт отделён от поведения](../decisions/ADR-004.md)
- [Модуль Documentation Changes](../modules/MOD-CHANGES.md)
- [Модуль Local Review](../modules/MOD-REVIEW.md)
- [Перенос review anchors](../architecture/review-anchoring.md)
- [Как устроено сравнение документации](../architecture/documentation-changes.md)
- [Поля ChangeSetReport](../reference/changes-report.md)
