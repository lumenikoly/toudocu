<!-- toudocu
architectureQuestion: Как компоненты программы делят ответственность?
-->

# Ответственность компонентов

Toudocu разделяет чистую модель, прикладные сценарии, внешние адаптеры,
HTTP-сервер, CLI и React-представление. Зависимости направлены внутрь: UI и
адаптеры используют application/core, но core не знает о React, HTTP и Node.js.

## Компоненты

| Часть | Ответственность |
|---|---|
| `packages/core` | Markdown, модель проекта, связи, готовность задач и правила безопасности без I/O |
| `packages/application` | Сценарии CLI, задач, сборки, изменений и Agent Console через явные порты |
| `packages/contracts` | Версионируемые DTO, runtime-схемы и реестр маршрутов |
| `packages/portal` | Преобразование доменной модели в `PortalSnapshotV1` и `PageViewV1` |
| `packages/platform-node` | Файловая система, Git, процессы, PTY, skill и provider-адаптеры |
| `packages/server` | Loopback HTTP/WebSocket API, watcher и жизненный цикл runtime |
| `apps/web` | Общие React-страницы статического портала и локального workspace |
| `apps/web/renderer` | Предварительный рендер HTML рядом с общими React-страницами |
| `apps/cli` | Публичная командная строка и коды завершения |

CLI загружает проект через Node-адаптеры и вызывает application-сценарий.
`build` передаёт готовую модель renderer и атомарно публикует результат.
`serve` хранит последний успешный снимок, а React Router показывает его и
локальные рабочие поверхности. Браузер не вычисляет доменные правила.

Git diff, semantic diff, OpenAPI и данные задач анализируются независимо:
ошибка дополнительного представления не скрывает исходный патч. Обсуждения,
Agent Session и Project Terminal существуют только в основном loopback
`serve`; статическая сборка их не включает.

## Связанные документы

- [MOD-CLI](../modules/cli.md)
- [MOD-MODEL](../modules/model.md)
- [MOD-MARKDOWN](../modules/markdown.md)
- [MOD-SITE](../modules/site.md)
- [MOD-CHANGES](../modules/MOD-CHANGES.md)
- [Граница runtime и браузера](frontend-runtime-boundary.md)
