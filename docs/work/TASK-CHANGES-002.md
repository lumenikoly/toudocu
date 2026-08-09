# TASK-CHANGES-002: Упростить workspace изменений

- Статус: Выполнено
- Тип: Feature
- Приоритет: Обычный
- Модуль: MOD-CHANGES
- Сценарий: UC-REVIEW-01
- Экраны: SC-CHANGES-WORKSPACE
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Toudocu
- Последнее обновление: 2026-08-09

## Результат

Экран «Изменения» сразу открывает первый source diff и оставляет постоянно
видимыми только список файлов, поиск, статус и обсуждения. Параметры Git и
диагностика раскрываются по запросу.

## Изменение поведения

### Было

До выбора файла экран занимают Git-поля, метрики и вторичные фильтры, а diff
скрыт за вкладкой «Сводка».

### Станет

Первый подходящий файл и его исходный diff открываются автоматически. Git range
и диагностика используют компактные disclosures, а desktop и mobile сохраняют
локальную прокрутку без overflow страницы.

## Область изменения

- `internal/site/` — HTML workspace и template tests;
- `web/src/` и `web/tests/` — review-first runtime, responsive layout и browser tests;
- `internal/site/assets/generated/` — результат сборки только из `web/`;
- `docs/screens/SC-CHANGES-WORKSPACE.md`, `docs/work/TASK-CHANGES-002.md` и `CHANGELOG.md` — каноническое описание поведения.

## Не входит в задачу

- Go facade, `ChangeSetReport`, review DTO, HTTP API и feedback workflow;
- глобальный redesign Toudocu и изменение `DESIGN.md`;
- static и translation capabilities, а также translation roots.

## Критерии приёмки

- [x] `AC-01` Header объединяет название, Git disclosure, файловую сводку и discussions; range закрывается после применения, по `Esc` и клику снаружи с возвратом focus.
- [x] `AC-02` Панель файлов содержит только поиск и статус, сортирует по path и делит файлы на «Изменённые» и «Связанные» без повторения filename.
- [x] `AC-03` Первый подходящий файл автоматически открывается во вкладке «Исходник»; URL `path/tab`, watcher refresh и фильтрация сохраняют описанные приоритеты, а `tab=summary` переводится на `source`.
- [x] `AC-04` Вкладка «Сводка» удалена; diagnostics видны только при наличии и error автоматически раскрывает disclosure.
- [x] `AC-05` Документационные вкладки, source mode toggle, diff copy, file/range comments, discussions и feedback сохраняют поведение.
- [x] `AC-06` Desktop использует полноэкранный split, а tablet и mobile drawers не создают горизонтальный page overflow и поддерживают focus/`Esc`.
- [x] `AC-07` Каноническая документация, generated web assets и проверки репозитория согласованы.

## План

- [x] Упростить шаблон и удалить вторичные frontend state/filter branches.
- [x] Реализовать автоматический выбор, disclosures и responsive split.
- [x] Обновить unit/browser regression coverage.
- [x] Обновить документацию, пересобрать frontend и выполнить gates.

## Проверка

- `AC-01` → `go test ./internal/site && npm --prefix web run test:browser`
- `AC-02` → `go test ./internal/site && npm --prefix web run typecheck`
- `AC-03` → `npm --prefix web run test:browser`
- `AC-04` → `npm --prefix web run test:browser`
- `AC-05` → `npm --prefix web run test:browser`
- `AC-06` → `npm --prefix web run test:browser`
- `AC-07` → `npm --prefix web test && go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `ALL` → `go test ./... && npm --prefix web test && make browser-test`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `go vet ./... && go mod verify && npm --prefix web run typecheck`

## Влияние на документацию

Обновляются экран `SC-CHANGES-WORKSPACE`, эта задача и корневой `CHANGELOG.md`.
Другие контракты, архитектурные документы и translation roots не меняются.

## Последующее изменение

Отдельным follow-up после завершения этой задачи удалён неиспользуемый тип
комментария. Это последующее решение не входит в критерии `TASK-CHANGES-002` и
отдельно изменяет review DTO, [HTTP schema](../contracts/changes.openapi.yaml),
миграцию local state и feedback workflow. Translation roots не затрагиваются.
