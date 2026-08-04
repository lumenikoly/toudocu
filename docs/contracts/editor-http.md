# CONTRACT-EDITOR-HTTP: Локальный editor API

- Тип: HTTP contract
- Статус: Готово
- Версия schema: 1
- Режим: только `docu-docu serve`
- Задача: TASK-SITE-002
- Модуль: MOD-SITE
- Сценарий: UC-DOCS-03
- Процесс: FLOW-DOCS-SERVE

Контракт определяет действующий same-origin API локального workspace. Все
маршруты имеют префикс `/_docu-docu/api/editor`, всегда возвращают
`Cache-Control: no-store` и не выдают CORS-заголовки. JSON-ответы содержат
`schemaVersion: 1`.

## Общие правила

- Максимальный JSON request body — 3 MiB, поле `content` — 2 MiB.
- JSON декодируется строго: неизвестные поля и значение после первого объекта
  возвращают `400 invalid_json`.
- Записывающий `PUT`/`POST` требует `Content-Type: application/json`, заголовок
  `X-Docu-docu-Action` со значением операции и same-origin browser context:
  совпадающий `Origin` и/или `Sec-Fetch-Site: same-origin`.
- Неизвестный метод возвращает `405 method_not_allowed` и `Allow`.
- Ошибка имеет единую форму:

```json
{
  "schemaVersion": 1,
  "error": {"code": "stale_digest", "message": "Файл изменён", "details": {}}
}
```

`details` необязателен. Для `stale_digest` он содержит актуальные `digest`,
`content` и `revision`, чтобы пользователь мог сравнить версии. API не принимает
команды и не запускает Git, shell или task verification.

Diagnostics во всех success envelopes имеют форму
`{severity, code, message, path, line, column}`; `line` и `column` начинаются с
единицы и равны нулю, когда позиция неизвестна. `rebuild` имеет форму
`{documents, pages, warnings, errors}`. Файл во всех ответах сериализуется как
`{path, language, size, digest, title?, documentURL?}`; ответы с содержимым
добавляют `content` и `diagnostics`.

Same-origin guards защищают браузер от cross-origin записи, но не аутентифицируют
произвольный HTTP-клиент. Если оператор явно слушает non-loopback адрес, он
включает доступных клиентов локальной сети в trust boundary и получает текущее
CLI-предупреждение об отсутствии TLS и авторизации.

## `GET /files`

Возвращает текущую revision, список файлов и общий реестр шаблонов:

```json
{
  "schemaVersion": 1,
  "revision": "<sha256-workspace-fingerprint>",
  "files": [{
    "path": "modules/site.md",
    "language": "markdown",
    "size": 1200,
    "digest": "<sha256>",
    "title": "MOD-SITE: Портал",
    "documentURL": "modules/site.html"
  }],
  "templates": [{
    "key": "module",
    "label": "Модуль",
    "fields": [{"name":"id","label":"Идентификатор","type":"text","required":true}],
    "languages": ["ru", "en"]
  }]
}
```

`ETag` содержит quoted revision. Совпадающий `If-None-Match` возвращает `304`
без body. Serve HTML содержит revision baseline, а frontend опрашивает этот
маршрут раз в две секунды, поэтому изменение до первого poll не теряется.

## `GET|PUT /file`

`GET /file?path=<canonical-posix-path>` возвращает объект
`{schemaVersion, revision, file}`, где `file` содержит `path`, `language`,
`size`, `content`, `digest`, optional `title`/`documentURL` и positional
`diagnostics`; даже пустые content и diagnostics сериализуются как `""` и `[]`.
Revision вычисляется из текущего workspace fingerprint, а не из последней
успешной пересборки. `GET` с `raw=1` возвращает
`text/plain; charset=utf-8`, `X-Content-Type-Options: nosniff` и read-only source.

`PUT /file` принимает:

```json
{
  "path": "modules/site.md",
  "content": "# MOD-SITE…",
  "expectedDigest": "<sha256>",
  "confirmOverwrite": false
}
```

`X-Docu-docu-Action` равен `save`. Успех возвращает
`{schemaVersion, revision, file, rebuild}` с обновлёнными content, digest и
diagnostics.
Несовпадение digest возвращает `409 stale_digest` и запоминает ожидающий
подтверждения conflict. Явное overwrite — новый запрос с актуальным digest из
conflict response и `confirmOverwrite: true`; тот же запрос без подтверждения
снова получает `409`, а повторное внешнее изменение обновляет conflict и также
возвращает `409`.

## `POST /preview`

Принимает `{path, content}` и `X-Docu-docu-Action: preview`. Для Markdown возвращает
`{schemaVersion, path, html, diagnostics}` с безопасным HTML существующего
renderer и diagnostics in-memory overlay. Ссылки
разрешаются относительно документа только к безопасным portal/repository
targets. Для остальных extensions возвращается `415 preview_not_supported`.

## `POST /validate`

Принимает `{path, content}` и `X-Docu-docu-Action: validate`. Возвращает объект:

```json
{"schemaVersion":1,"path":"index.md","diagnostics":[{"severity":"error","code":"broken-link","message":"…","path":"index.md","line":4,"column":1}]}
```

Markdown использует полную модель с in-memory overlay. JSON получает syntax
diagnostics и существующие проверки `screens/hotspots.json`. YAML не получает
выдуманную общую schema и возвращает только доступные Docu-docu diagnostics.
Diagnostics не блокируют сохранение.

## `POST /create`

Принимает `X-Docu-docu-Action: create`, `template` и типизированные поля выбранного
элемента общего реестра `task-init`, `module`, `use-case`, `flow`, `screen`,
`decision`, `standard` или `runbook`. Каждый template entry имеет `key`, `label`,
ordered `fields` и `languages`; field содержит `name`, `label`, `type` (`text`
или `select`), `required` и optional `options`. Реестр задаёт порядок, validation,
целевой путь и renderer как для browser, так и для CLI. Создание использует
атомарный `O_EXCL`; успех `201` возвращает
`{schemaVersion, revision, file, rebuild}` с content и diagnostics созданного
файла. Конфликт пути возвращает `409 file_exists`.

## Path contract

Допустим только непустой канонический относительный POSIX-путь к обычному
workspace-файлу `.md`, `.yaml`, `.yml` или `.json`. Абсолютные пути, пустые и
`.` segments, `..`, backslash, NUL, percent-encoded остатки, повторное URL
кодирование, hidden/excluded/output paths и любой symlink/reparse component
отклоняются как `400 invalid_path` или `403 path_forbidden`.

Workspace защищает от случайного traversal и уже существующих symlink/reparse
paths в доверенной локальной рабочей копии. Он повторяет component checks перед
pathname operations, но не обещает handle-relative защиту от привилегированного
локального процесса, который намеренно заменяет каталог в точном окне между
check и operation; такой процесс находится вне threat model локального `serve`.
