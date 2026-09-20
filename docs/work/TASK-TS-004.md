<!-- toudocu
id: TASK-TS-004
status: done
taskType: maintenance
module: MOD-MODEL
parentTask: TASK-TS-001
dependsOn: TASK-TS-002, TASK-TS-003
standards: STD-DOCS-001
updated: 2026-09-19
-->

# TASK-TS-004: Перенести компилятор документации и безопасный ввод

<!-- toudocu:section result -->

## Результат

TypeScript строит семантическую модель с прежними правилами конфигурации, Markdown, OpenAPI, связей,
задач, экранов и диагностики.

Это требуемый результат этапа; статус и отмеченные критерии показывают фактическую готовность.
Основание — этап и пункты 2; 8–9; 13–18; 22–23 исходного ТЗ, преобразованного в
[дерево миграции](TASK-TS-001.md).

<!-- toudocu:section use-case-omission-reason -->

## Почему нет отдельного сценария

Миграция реализации сохраняет существующие пользовательские сценарии и публичные CLI/JSON-контракты.
Новый сценарий ради смены языка не вводится.

<!-- toudocu:section scope -->

## Область изменения

Исходные точки переноса: `internal/`, `web/`, `scripts/`, `skills/` и `docs/`. Новые пакеты
создаются в пределах репозитория согласно результату этапа.

Чистый core; загрузка через platform-node; единая PathPolicy и атомарная запись; runtime schemas
DTO; UTF-8 диапазоны.

<!-- toudocu:section out-of-scope -->

## Не входит в задачу

Изменение семантики CLI, документационного формата и модели задач, MCP, база данных, облачный
backend, Next.js, Astro и автоматический запуск агента ядром. Другие этапы выполняются по
зависимостям родительской задачи.

<!-- toudocu:section acceptance-criteria -->

## Критерии приёмки

- [x] `AC-01` Компилятор совпадает с эталоном по сущностям, статусам, связям, roadmap, задачам,
      экранам и диагностике.
- [x] `AC-02` CommonMark/GFM, аннотации и позиции кириллицы, CJK, emoji, combining, CRLF/LF
      совпадают с legacy.
- [x] `AC-03` Raw HTML, опасные URL, активные ресурсы, traversal и symlink escapes блокируются.
      Внешние OpenAPI refs не загружаются из сети; check и build остаются offline.
- [x] `AC-04` Конфигурация, Markdown и OpenAPI diagnostics сохраняют line/column и byte ranges;
      compiler не выполняет запись или сетевой запрос.

<!-- toudocu:section plan -->

## План

1. Перенести configuration, Markdown, OpenAPI, documents, tasks, relations, roadmap и diagnostics
   как чистые compiler modules.
2. Нормализовать source input как legacy Go и подключить UTF-16 to UTF-8 byte range mapper до
   построения semantic entities.
3. Перенести raw HTML, URL, Mermaid, external ref, traversal и symlink guards; оставить filesystem
   loading и atomic writes в adapters/services.
4. Сравнить compiler outputs и diagnostics с baseline, затем обновить model и markdown
   documentation.

<!-- toudocu:section verification -->

## Проверка

- `AC-01` -> `pnpm test`
- `AC-02` -> `pnpm test`
- `AC-03` -> `pnpm check`
- `AC-04` -> `pnpm exec vitest run packages/core/src/config/config.test.ts packages/core/src/openapi/openapi.test.ts packages/core/src/markdown/source-position.test.ts packages/core/src/compiler-position.test.ts packages/core/src/knowledge/compile.test.ts`
- `ALL` -> `pnpm check`
- `DOCS` -> `node apps/cli/dist/main.js check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` -> `pnpm check`

Команды новой системы являются целевыми проверками этапа. До появления соответствующих тестов их
успешный запуск не подтверждает критерии. При удалении Go документационные проверки переводятся на
новый CLI; совпадение отчётов проверяется до переключения.

### Состояние переноса

Реализованы конфигурация, Markdown, OpenAPI, модель документов, связи, модель знаний, задачи,
roadmap, экраны, диагностики и безопасное чтение/запись файлов. Файл `CHANGELOG.md` в корне
репозитория теперь отдельно загружается через platform-node и доступен в модели как
`projectChangelog`: он не попадает в обычный индекс, поиск CLI или отчёт, а `docs/changelog.md`
остаётся обычным документом. Диагностики конфигурации и OpenAPI сохраняют UTF-8 диапазоны, а позиции
Markdown проверяются также сравнением с Go через `pnpm test:markdown-parity`; отдельная проверка
модели покрывает 164 документа. Для OpenAPI добавлено чтение UTF-16LE и
UTF-16BE с BOM, включая диагностику неполных и некорректных суррогатных пар;
ограничение размера применяется к исходным байтам до декодирования.
Целевые тесты, Markdown parity и compiler parity для всех 164 документов проходят. При
заключительной независимой проверке обнаружен и исправлен единственный разрыв: JavaScript `-0` в
`ageDays` теперь нормализуется в обычный ноль, как в Go; regression test и повторный parity
проходят. Представление журнала изменений проекта, HTML и статическая визуализация относятся к
следующему этапу, а Go остаётся действующей реализацией продукта до финального переключения.

<!-- toudocu:section documentation-impact -->

## Влияние на документацию

Обновить описание соответствующей границы в модулях и руководствах вместе с работающей реализацией.
Сохранять различие между действующим Go runtime и целевым TypeScript runtime; не объявлять перенос
завершённым до выполнения критериев. Текущий план и общие ограничения находятся в
[родительской задаче](TASK-TS-001.md).
