<!-- toudocu
id: MOD-SITE
status: done
updated: 2026-09-20
-->

# Статический портал и локальный workspace

Модуль превращает проверенную модель проекта в HTML, навигацию, поиск,
browser assets и `report.json`. `build` создаёт read-only портал, а `serve`
использует те же React-страницы и добавляет локальные инструменты.

<!-- toudocu:section code-location -->
## Расположение в коде

- `packages/portal/` — snapshot, page views и route registry;
- `apps/web/renderer/` — server-side render общих React-страниц;
- `apps/web/` — React Router, страницы и локальные рабочие поверхности;
- `packages/server/` — HTTP/WebSocket, watcher и runtime capabilities;
- `packages/platform-node/` — безопасная запись, Git, reviews, providers и PTY.

<!-- toudocu:section boundaries -->
## Границы

Presentation не читает Markdown и не повторяет правила модели. React получает
готовые view models и capabilities, но не решает, можно ли записать файл,
запустить процесс или изменить задачу. Статический портал никогда не содержит
editor, Changes API, Discussions, Agent Console или Project Terminal.

<!-- toudocu:section business-rules -->
## Бизнес-правила

### BR-SITE-001: Очистка выходного каталога не затрагивает защищённые пути

`build --clean` отклоняет корень файловой системы, source root, его родителя и
небезопасные symlink-пути. Готовый staging публикуется атомарно.

### BR-SITE-002: Портал работает на обычном статическом HTTP-хостинге

Статический портал использует относительные URL, работает в корне и под префиксом,
читаем без JavaScript и не требует запущенный Toudocu.

### BR-SITE-003: Локальный сервер открывает файлы только через явные интерфейсы

`serve` раздаёт только известные маршруты и assets; файловые операции проходят через
PathPolicy, revision/digest и atomic replace.

### BR-SITE-004: Mermaid работает автономно и в строгом режиме

Mermaid использует локальный runtime; небезопасные directives и HTML не попадают в страницу.

### BR-SITE-005: Карта экранов работает автономно

Карта экранов и проигрывание сценариев не требуют сети и внешних runtime-ресурсов.

### BR-SITE-006: Темы не расширяют доверенную поверхность

Визуальные настройки не добавляют произвольный код или внешние ресурсы.

### BR-SITE-007: build и serve имеют разные возможности

`build` остаётся read-only; Editor, Changes, Discussions, Agent Console и Project Terminal
доступны только в каноническом loopback `serve`.

### BR-SITE-008: Запись защищена проверкой версии файла

Изменяющие операции проверяют revision или digest перед атомарной заменой.

### BR-SITE-009: Локали являются равноправными рабочими областями

Выбранный translation root строится как отдельный read-only snapshot.

### BR-SITE-010: Мягкая навигация доступна только в каноническом serve

React Router переключает маршруты `serve`; статический портал остаётся обычными HTML-страницами.

### BR-SITE-014: Дорожная карта изменяется только ограниченной операцией

Roadmap изменяется только операцией `roadmap-add` с CAS.

### BR-SITE-015: Проверка версии не влияет на доступность портала

Проверка версии необязательна, ограничена основным `serve` и не влияет на доступность
портала.

### BR-SITE-018: Work items получают специализированное рабочее представление

Task Workspace получает вычисленные work state, hierarchy и actions с сервера; `start-work`
повторно проверяет digest, статус и зависимости.

### BR-SITE-023: Agent Console скрывает протокол провайдера

Agent Console доступна только в основном loopback `serve`. Browser не получает executable,
argv, cwd, environment или provider protocol.

### BR-SITE-024: Project Terminal запускается только после явного открытия

Project Terminal имеет отдельный lifecycle и лениво загружает xterm.

<!-- toudocu:section invariants -->
## Инварианты

- `index.md` становится главной страницей без дублирования H1 и метаданных.
- Маршруты статического и server режима происходят из одного registry.
- Main content и обычные ссылки доступны до hydration.
- React Router управляет навигацией, но не доменной моделью и безопасностью.
- Agent Console находится выше route outlet и сохраняется при навигации.
- Provider, PTY, watcher и WebSocket закрываются вместе с сервером.
- Переводной портал остаётся отдельным read-only snapshot.
- `file://` не является поддерживаемым режимом просмотра.

<!-- toudocu:section stable-interfaces -->
## Стабильные интерфейсы

- `PortalSnapshotV1`, `PageViewV1` и `RuntimeCapabilitiesV1`;
- статические маршруты и `report.json`;
- Editor, Changes, Agent Feedback и Agent Console OpenAPI/HTTP contracts;
- semantic HTML и доступная клавиатурная навигация.

<!-- toudocu:section related-use-cases -->
## Связанные сценарии

- [Сборка портала](../use-cases/build-portal.md)
- [Локальный сервер](../use-cases/serve-portal.md)
- [Просмотр изменений](../use-cases/UC-DOCS-05.md)
- [Работа с задачей](../use-cases/task-workflow.md)
