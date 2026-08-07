# TASK-SITE-004: Добавление результата roadmap через serve

- Статус: Выполнено
- Тип: Feature
- Приоритет: Обычный
- Модуль: MOD-SITE
- Сценарий: UC-DOCS-03
- Процесс: FLOW-DOCS-SERVE
- Экраны: SC-SITE-DOCUMENT
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Docu-docu
- Последнее обновление: 2026-08-06

## Результат

На странице `roadmap.md` в canonical `docu-docu serve` пользователь добавляет
новый незавершённый `DLV-*` в существующий этап через доступный диалог, не
редактируя Markdown вручную. Static build и translation portals остаются
read-only.

## Изменение поведения

### Было

Roadmap отображает вычисленный прогресс, но новый deliverable можно добавить
только через общий редактор или внешнее изменение Markdown.

### Станет

Serve-only действие получает актуальные этапы, digest и предложенный
`DLV-ROADMAP-NNN`, проверяет однострочный deliverable на сервере, атомарно
вставляет checklist item в выбранный H2-этап и синхронно перестраивает портал.
CAS-конфликт не перезаписывает файл и сохраняет введённые значения формы.

## Область изменения

- `internal/app/` — roadmap Editor API, safe insertion, CAS и renderer control;
- `web/src/` и `web/tests/` — serve-only диалог, lifecycle, стили и browser QA;
- `internal/site/assets/generated/` — производные serve assets;
- `docs/contracts/`, `docs/flows/`, `docs/guides/`, `docs/modules/`,
  `docs/screens/`, `docs/use-cases/`, `docs/roadmap.md` и этот work item.

## Не входит в задачу

- создание этапов, `UC-*` и `CON-*`, автоматическое создание `TASK-*`;
- редактирование, завершение или удаление существующих roadmap items;
- изменение `ProjectReport`, bootstrap schema или публичного Go API;
- write-возможности static build, translation portals и direct translation serve.

## Критерии приёмки

- [x] `AC-01` GET возвращает revision, путь, digest, предложенный следующий
  `DLV-ROADMAP-NNN` и существующие этапы с anchor, названием, статусом и числом
  элементов; отсутствующий roadmap имеет стабильную ошибку.
- [x] `AC-02` POST принимает только same-origin JSON с action
  `roadmap-add`, нормализует корректный уникальный `DLV-*`, отклоняет
  неизвестные поля, пустой/многострочный текст, второй roadmap ID, duplicate,
  отсутствующий этап и stale digest стабильными ошибками.
- [x] `AC-03` Успешная запись сохраняет перевод строк и окружающий Markdown,
  вставляет результат после последнего checklist item либо перед следующим H2
  пустого этапа, использует atomic replace и синхронно перестраивает портал.
- [x] `AC-04` Диалог поддерживает keyboard/Escape/focus, серверные этапы,
  редактируемый предложенный ID, loading/error/success и мобильную ширину; при
  конфликте форма сохраняется, а этапы, digest и подсказка обновляются.
- [x] `AC-05` Static build и locale portals не содержат кнопку, endpoint или
  serve-only код; generic Editor и публичные schemas сохраняются.
- [x] `AC-06` Editor OpenAPI, behavioral contract, local serve guide,
  FLOW-DOCS-SERVE, MOD-SITE, UC-DOCS-03, SC-SITE-DOCUMENT и roadmap согласованы,
  прошли semantic review и обычную/strict структурную проверку.

## План

- [x] Добавить серверное состояние roadmap, валидацию, guarded POST и atomic CAS insertion.
- [x] Добавить serve-only диалог и повторную инициализацию после мягкой навигации.
- [x] Покрыть backend, frontend и browser behavior, включая conflict и mobile.
- [x] Обновить канонические источники документации и выполнить semantic gates.
- [x] Выполнить полный repository verification и завершить roadmap item.

## Проверка

- `AC-01` → `go test ./internal/app -run TestEditorRoadmap`
- `AC-02` → `go test ./internal/app -run TestEditorRoadmap`
- `AC-03` → `go test ./internal/app -run TestEditorRoadmap`
- `AC-04` → `npm --prefix web run typecheck && npm --prefix web run test:browser`
- `AC-05` → `go test ./internal/app -run 'TestRoadmapAddControlIsServeOnly|TestDocumentationServerLocalePortalsAreReadOnlyAndMatched' && npm --prefix web test`
- `AC-06` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `ALL` → `make check && make browser-test`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

## Влияние на документацию

Обновляются Editor OpenAPI и behavioral contract, FLOW-DOCS-SERVE,
local-workflow guide, MOD-SITE, UC-DOCS-03, SC-SITE-DOCUMENT и roadmap. Новый
экран или переход не создаётся: диалог является состоянием страницы roadmap.
