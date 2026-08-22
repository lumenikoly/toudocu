<!-- toudocu
version: 1
id: TASK-SITE-005
status: done
taskType: feature
priority: normal
module: MOD-SITE
useCase: UC-DOCS-03
flow: FLOW-DOCS-SERVE
screens: SC-SITE-HOME
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-10
-->

# TASK-SITE-005: Показывать доступное обновление в serve

<!-- toudocu:section result -->
## Результат

Канонический `toudocu serve` необязательно проверяет последний стабильный
GitHub Release. Если он новее текущей программы, портал показывает небольшое
предложение открыть официальную страницу релиза. Ошибка проверки не мешает
работе. Статический портал, переводы и сама программа остаются автономными.

<!-- toudocu:section behavior-change -->
## Изменение поведения

<!-- toudocu:section before -->
### Было

Пользователь узнавал о новом релизе только за пределами Toudocu или вручную
открывал GitHub Releases.

<!-- toudocu:section after -->
### Станет

При первом открытии канонического портала браузер обращается к адресу проверки
версии на том же сервере. Go один раз за процесс запрашивает метаданные
стабильного релиза и возвращает типизированное состояние. Уведомление можно
скрыть для конкретной версии; `--no-update-check` полностью отключает исходящий
запрос.

<!-- toudocu:section scope -->
## Область изменения

- параметр CLI, проверка версии, HTTP-маршрут и данные запуска в Go;
- уведомление, стили, локализация и браузерные тесты в `web/`;
- связанные ADR, контракты, архитектурные документы, модуль, сценарий, процесс,
  экран и справочники.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

- самообновление, запуск установщика и замена программы из браузера;
- проверка предварительных версий, плагинов и других репозиториев;
- сетевые запросы из `build`, переводов и `serve`, запущенного из перевода;
- изменение `docs-en` в рамках исторической задачи.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` `serve --no-update-check` отключает возможность, HTTP-маршрут и
  сетевой запрос; другие команды этот параметр отклоняют.
- [x] `AC-02` `GET|HEAD /_toudocu/api/version` возвращает schema v1,
  `no-store`, `nosniff`, текущую версию и состояние `up-to-date`,
  `update-available` или `unavailable`. Другие методы получают `405`.
- [x] `AC-03` Проверка ограничивает время и размер ответа, принимает только
  стабильную версию `X.Y.Z`, строит ссылку лишь для официального репозитория и
  хранит один результат на процесс, не удерживая основную блокировку сервера.
- [x] `AC-04` Уведомление показывает текущую и новую версии, открывает
  официальный релиз, доступно с клавиатуры и на телефоне и запоминает скрытие
  для конкретной новой версии. При ошибке или актуальной версии его нет.
- [x] `AC-05` Статический портал и переводы не содержат маршрута, возможности и
  интерфейса проверки обновлений; schema v1 блока запуска сохраняется.
- [x] `AC-06` ADR, контракты и пользовательская документация согласованы с
  поведением.

<!-- toudocu:section plan -->
## План

- [x] Добавить параметр CLI, проверку версии, HTTP-маршрут и возможность в
  данных запуска.
- [x] Добавить доступное уведомление только для `serve` и запоминание скрытия.
- [x] Проверить сервер, браузер и отсутствие этой функции в статическом
  портале.
- [x] Обновить каноническую документацию.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `go test ./internal/app -run 'TestParseUpdateCheckFlag|TestVersionEndpointDisabled'`
- `AC-02` → `go test ./internal/app -run TestVersionEndpoint`
- `AC-03` → `go test ./internal/app -run TestUpdateChecker`
- `AC-04` → `npm --prefix web run typecheck && npm --prefix web run test:browser`
- `AC-05` → `go test ./internal/app ./internal/site && npm --prefix web test`
- `AC-06` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `ALL` → `go test ./... && go test -race ./... && npm --prefix web test && npm --prefix web run test:browser`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `go vet ./... && go mod verify && npm --prefix web run typecheck`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Был добавлен ADR об узком сетевом исключении с возможностью отключения.
Обновлены Editor OpenAPI и его пояснение, CLI-контракт, архитектурные границы,
MOD-SITE, UC-DOCS-03, FLOW-DOCS-SERVE, SC-SITE-HOME и справочник возможностей.
Отдельный экран не создан: уведомление является состоянием оболочки портала.
