<!-- toudocu
id: TASK-REVIEW-002
status: done
taskType: feature
priority: high
module: MOD-AGENT-FEEDBACK
useCase: UC-AGENT-FEEDBACK-01
screens: SC-CHANGES-WORKSPACE
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-13
-->

# TASK-REVIEW-002: Обсуждения любых изменённых файлов

<!-- toudocu:section result -->
## Результат

Разработчик может начать обсуждение любого обычного файла из текущего рабочего
Git diff. Для доступного текста обсуждение сохраняет точный диапазон, а для
двоичных, больших и удалённых файлов — цель всего файла.

<!-- toudocu:section behavior-change -->
## Изменение поведения

<!-- toudocu:section before -->
### Было

Changes разрешал создавать обсуждения только для Markdown канонической
документации.

<!-- toudocu:section after -->
### Станет

Changes разрешает обсуждения всех обычных файлов рабочего дерева. Сравнения с
индексом и ревизией остаются только для чтения. Портал продолжает использовать
цель `document`.

<!-- toudocu:section scope -->
## Область изменения

- очередь, HTTP API и проверки безопасных путей в `internal/app/`;
- экран Changes и исходные браузерные ресурсы в `web/`;
- OpenAPI, встроенный навык и каноническая документация;
- Go-, TypeScript- и браузерные тесты.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

- произвольные неизменённые файлы и глобальные комментарии;
- каталоги, символические ссылки, `.git` и пути вне репозитория;
- обсуждения в статическом портале и корнях переводов;
- новая версия JSON или хранилища.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Цель `file` принимается только для обычного файла рабочего diff;
  удалённый файл сохраняет состояние `deleted`, а существующая ветка допускает
  продолжение после исчезновения файла.
- [x] `AC-02` Диапазон разрешён только для доступного UTF-8 текста до 2 МиБ;
  двоичные и большие файлы обсуждаются целиком.
- [x] `AC-03` Вопрос не разрешает изменения; `change_request` для `file`
  принимает связанные безопасные пути репозитория, а `document` — только
  каноническую документацию.
- [x] `AC-04` Changes показывает файловую кнопку независимо от загрузки текста,
  сохраняет диапазон новой стороны и цитату старой стороны, не создаёт цель из
  смешанного выделения и отключает обсуждения вне рабочего дерева.
- [x] `AC-05` OpenAPI, встроенный навык и документация описывают фактические
  границы цели `file` без изменения версии 1.

<!-- toudocu:section plan -->
## План

- [x] Расширить модель и проверки очереди.
- [x] Обновить Changes и браузерные сценарии.
- [x] Обновить контракт, навык и документацию.
- [x] Выполнить проверки и завершить задачу.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `go test ./internal/app -run 'TestAgentFeedback(FileTargets|DeletedFile)'`
- `AC-02` → `go test ./internal/app -run 'TestAgentFeedbackFileTargets'`
- `AC-03` → `go test ./internal/app -run 'TestAgentFeedback(Lifecycle|FileTargets)'`
- `AC-04` → `npm --prefix web run test:browser -- --grep 'Portal and Changes share documentation discussions'`
- `AC-05` → `go test ./internal/app -run 'TestOpenAPIContractParity|TestToudocuAgentFeedbackContract'`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Обновляются архитектура доставки, модуль, сценарий, экран Changes, OpenAPI,
справочники API и возможностей, README и `CHANGELOG.md`. Корни переводов не
читаются и не меняются.
