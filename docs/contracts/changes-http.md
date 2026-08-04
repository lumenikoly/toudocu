# HTTP-контракт Documentation Changes v1

- Идентификатор: CON-CHANGES-HTTP-V1
- Статус: Готово
- Владелец: Команда Docu-docu
- Последнее обновление: 2026-07-31

Все endpoints read-only, используют `Cache-Control: no-store`, принимают только
локальные Git revisions и ограничивают доступ documentation roots.

| Метод | Endpoint | Ответ |
|---|---|---|
| `GET/HEAD` | `/_docu-docu/api/changes` | `ChangeSetReport`, ETag = digest |
| `GET` | `/_docu-docu/api/changes/file?path=...` | один `DocumentationChange` |
| `GET` | `/_docu-docu/api/changes/task?task=TASK-*` | `TaskImpactReport` |
| `GET` | `/_docu-docu/api/changes/content?side=before|after&path=...` | Git content |
| `GET` | `/_docu-docu/api/changes/render?side=before|after&path=...` | sanitized HTML |
| `GET` | `/_docu-docu/api/changes/screen-map` | screen/transition overlay v1 |

Summary принимает `base`, `target`, `type`, `status`, `module` и `task`.
Неверная revision возвращает 400; отсутствие Git — 503. Error envelope содержит
`schemaVersion: 1` и `diagnostics[]`.

`path` — canonical repository-relative POSIX path элемента change set.
Абсолютный путь, backslash, `..`, файл вне documentation roots и `.git` не
разрешаются. Ответы content ограничены по размеру, используют `nosniff` и CSP
`default-src 'none'`; SVG не получает разрешений на script, style или network.
Renderer использует существующую sanitization policy.

Summary и file detail кэшируются по comparison, workspace revision, `HEAD`,
porcelain-v2 status и resolved пользовательским refs. Изменение working tree,
index или HEAD создаёт новый cache key. UI опрашивает HEAD summary с ETag.
Изменившийся digest сохраняет открытый path и URL-фильтры и загружает новый
change set.

`file`, `content` и `render` выполняют path-scoped analysis: source patches и
specialized model строятся только для запрошенного файла. Summary не переносит
полный patch; UI загружает его лениво при открытии detail.

Для OpenAPI `semanticChanges[].field` адресует operation, parameter, response
header, security scheme или schema property. `compatibility` принимает
`breaking`, `potentially-breaking`, `non-breaking` или `informational`.
