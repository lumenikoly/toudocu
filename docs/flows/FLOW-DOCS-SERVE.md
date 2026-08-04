# FLOW-DOCS-SERVE: Локальный просмотр портала

- Идентификатор: FLOW-DOCS-SERVE
- Сценарий: UC-DOCS-03
- Модуль: MOD-SITE
- Последнее обновление: 2026-07-31

Схема визуализирует жизненный цикл команды `serve`. Сетевые ограничения,
ошибочные сценарии и постусловия определяет
[UC-DOCS-03](../use-cases/serve-portal.md).

## Процесс

```mermaid
flowchart TD
    Start["docgent serve"] --> Build["Выполнить первоначальную сборку"]
    Build --> Built{"Сборка успешна?"}
    Built -->|Нет| Stop["Вернуть код 1 и не запускать сервер"]
    Built -->|Да| Listen["Слушать указанный адрес"]
    Listen --> Watch["Запустить watcher workspace"]
    Watch --> Request["Получить HTTP-запрос или внешнее изменение"]
    Request --> Editor{"Editor save или create?"}
    Editor -->|Да| Guard["Проверить origin, action, path и limits; для save — digest"]
    Guard --> Accepted{"Запись допустима?"}
    Accepted -->|Нет| APIError["Вернуть JSON error без изменения файла"]
    Accepted -->|Да| Atomic["Атомарно записать или создать исходник"]
    Atomic --> Rebuild["Перестроить модель, HTML, поиск и diagnostics"]
    Rebuild --> Publish["Вернуть revision и rebuild result"]
    Publish --> Request
    APIError --> Request
    Editor -->|Нет| External{"Workspace fingerprint изменился?"}
    External -->|Да| Stable["Дождаться стабильного fingerprint 200 ms"]
    Stable --> Rebuild
    External -->|Нет| Manual{"Запрошена ручная пересборка?"}
    Manual -->|Да| ManualRebuild["Пересобрать модель и HTML"]
    ManualRebuild --> ManualResult{"Пересборка успешна?"}
    ManualResult -->|Нет| ManualError["Показать ошибку и разрешить повтор"]
    ManualResult -->|Да| Reload["Перезагрузить текущую страницу"]
    Reload --> Request
    ManualError --> Request
    Manual -->|Нет| HTML{"Запрошена HTML-страница или directory route?"}
    HTML -->|Нет| Static["Отдать файл из output-каталога"]
    HTML -->|Да| HTMLRebuild["Пересобрать портал из актуального Markdown"]
    HTMLRebuild --> Rebuilt{"Пересборка успешна?"}
    Rebuilt -->|Нет| Error["Вернуть HTTP 500 для текущего запроса"]
    Rebuilt -->|Да| Static
    Static --> Request
    Error --> Request
    Request -->|Ctrl+C| Finish["Остановить сервер и освободить порт"]
```

## Границы процесса

- Обычные маршруты раздают output; editor API ограничен workspace-файлами внутри
  docs root и не предоставляет доступ к остальному репозиторию.
- По умолчанию используется loopback; доступ через `0.0.0.0` включается явно.
- Ручная пересборка обновляет модель и HTML, но не закрывает listener и не
  меняет его адрес.
- Editor, CodeMirror, API, polling и ручная пересборка существуют только в
  `serve`; статический портал через `file://` не содержит их markup или assets.
- Ошибка пересборки не останавливает уже запущенный сервер.

## Связанные документы

- [UC-DOCS-03: Просматривать документацию на локальном сервере](../use-cases/serve-portal.md)
- [FLOW-DOCS-BUILD: Сборка автономного портала](FLOW-DOCS-BUILD.md)
- [MOD-SITE: Статический портал](../modules/site.md)
- [CLI-контракт](../contracts/cli.md)
- [HTTP-контракт editor API](../contracts/editor-http.md)
