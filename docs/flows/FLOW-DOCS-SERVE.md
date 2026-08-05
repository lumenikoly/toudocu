# FLOW-DOCS-SERVE: Локальный просмотр портала

- Идентификатор: FLOW-DOCS-SERVE
- Сценарий: UC-DOCS-03
- Модуль: MOD-SITE
- Последнее обновление: 2026-08-05

Схема визуализирует жизненный цикл команды `serve`. Сетевые ограничения,
ошибочные сценарии и постусловия определяет
[UC-DOCS-03](../use-cases/serve-portal.md).

## Процесс

```mermaid
flowchart TD
    Start["docu-docu serve"] --> Build["Выполнить первоначальную сборку"]
    Build --> Built{"Сборка успешна?"}
    Built -->|Нет| Stop["Вернуть код 1 и не запускать сервер"]
    Built -->|Да| Listen["Слушать указанный адрес"]
    Listen --> Watch["Запустить watcher workspace"]
    Watch --> Request["Получить HTTP-запрос, browser action или внешнее изменение"]
    Request --> Locale{"Locale route?"}
    Locale -->|Да| LocaleSnapshot["Отдать read-only locale snapshot"]
    LocaleSnapshot --> Request
    Locale -->|Нет| APIDocs{"API docs?"}
    APIDocs -->|Да| Swagger["Отдать vendored Swagger UI и same-origin specs"]
    Swagger --> Request
    APIDocs -->|Нет| Editor{"Editor save или create?"}
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
    Manual -->|Да| ManualRebuild["Пересобрать модель, HTML и поиск"]
    ManualRebuild --> ManualResult{"Пересборка успешна?"}
    ManualResult -->|Нет| ManualError["Показать ошибку и разрешить повтор"]
    ManualResult -->|Да| Reload["Перезагрузить текущую страницу"]
    Reload --> Request
    ManualError --> Request
    Manual -->|Нет| Navigate{"Canonical HTML-переход?"}
    Navigate -->|Нет| OtherRoute["Передать переход браузеру или отдельному route handler"]
    Navigate -->|Да| Prefetch["Запросить целевой HTML"]
    Prefetch --> StaticSoft["Отдать последний успешный snapshot"]
    StaticSoft --> Compatible{"HTML совместим и revision совпадает?"}
    Compatible -->|Да| Swap["Заменить layout и восстановить history, anchor, scroll"]
    Compatible -->|Нет| Full["Выполнить полную canonical-навигацию"]
    Swap --> Request
    Full --> Static["Отдать последний успешный snapshot"]
    Static --> Request
    Request -->|Ctrl+C| Finish["Остановить сервер и освободить порт"]
```

## Границы процесса

- Обычные маршруты раздают output; editor API ограничен workspace-файлами внутри
  docs root и не предоставляет доступ к остальному репозиторию.
- По умолчанию используется loopback; доступ через `0.0.0.0` включается явно.
- Ручная пересборка обновляет модель, HTML и поиск, но не закрывает listener и не
  меняет его адрес.
- HTTP navigation никогда не запускает rebuild. При configured translations
  watcher пересобирает только изменившийся root; locale mount остаётся read-only
  и не получает editor, changes или canonical API.
- Мягкая навигация работает только между canonical HTML-страницами текущей
  revision. Editor, changes, API, locale и external routes, а также любой сбой
  проверки используют обычную полную загрузку.
- Search index загружается при первом обращении к поиску, Mermaid — при
  приближении диаграммы к viewport; загруженные runtime сохраняются между
  мягкими переходами.
- Editor, CodeMirror, API, polling и ручная пересборка существуют только в
  `serve`; статический портал через `file://` не содержит их markup или assets.
- API docs существует только в canonical `serve`, не загружает CDN и разрешает
  Try it out только для `GET`/`HEAD`; static и locale portals его не содержат.
- Ошибка пересборки не останавливает уже запущенный сервер.

## Связанные документы

- [UC-DOCS-03: Просматривать документацию на локальном сервере](../use-cases/serve-portal.md)
- [FLOW-DOCS-BUILD: Сборка автономного портала](FLOW-DOCS-BUILD.md)
- [MOD-SITE: Статический портал](../modules/site.md)
- [CLI-контракт](../contracts/cli.md)
- [HTTP-контракт editor API](../contracts/editor-http.md)
