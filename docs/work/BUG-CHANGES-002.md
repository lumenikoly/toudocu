<!-- toudocu
version: 1
id: BUG-CHANGES-002
status: done
taskType: bug
severity: medium
priority: high
reproducibility: always
regression: false
module: MOD-CHANGES
useCase: UC-DOCS-05
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-11
-->

# BUG-CHANGES-002: Разрешать относительные ссылки в описании влияния задачи

<!-- toudocu:section symptom -->
## Симптом

`task changes` не распознавал документы из раздела «Влияние на документацию»,
если ссылки были записаны относительно файла рабочей задачи.

<!-- toudocu:section expected-behavior -->
## Ожидаемое поведение

Обычная Markdown-ссылка разрешается от каталога, в котором лежит задача. Затем
полученный путь сопоставляется с путём относительно репозитория в выбранном
снимке Git.

<!-- toudocu:section actual-behavior -->
## Фактическое поведение

Ссылки `../modules/site.md` и `../reference/features.md` не попадали в список
`declared`. Если связанный документ менялся, отчёт ошибочно добавлял
`undeclared-document-change`.

<!-- toudocu:section steps-to-reproduce -->
## Шаги воспроизведения

1. Указать в разделе «Влияние на документацию» ссылку
   `../modules/site.md`.
2. Изменить связанный документ.
3. Вызвать `task changes` и сравнить заявленное и фактическое влияние.

<!-- toudocu:section evidence -->
## Доказательства

Для `task changes TASK-SITE-001 HEAD → HEAD` две существующие относительные
ссылки дали `declared: []`. Доказательств, что этот случай раньше работал,
нет, поэтому ошибка не считается регрессией.

<!-- toudocu:section cause -->
## Причина

Код извлекал путь регулярным выражением, но не сохранял путь исходного файла
задачи. Затем он безусловно добавлял `docs/` вместо обычного разрешения
Markdown-ссылки.

<!-- toudocu:section scope -->
## Область изменения

- `internal/app/changes_build.go`;
- `internal/app/changes_types.go`;
- `internal/app/changes_report.go`;
- `internal/app/changes_test.go`;
- `docs/work/BUG-CHANGES-002.md`.

<!-- toudocu:section out-of-scope -->
## Не входит в исправление

- изменение смысла предупреждений о влиянии задачи;
- сравнение файлов за пределами выбранного корня документации;
- изменение общих правил Markdown-ссылок.

<!-- toudocu:section plan -->
## План

1. Сохранить путь задачи и корень документации в контексте снимка.
2. Разрешать ссылки относительно задачи и отклонять выход за границу корня
   документации.
3. Добавить сквозной регрессионный сценарий для заявленного изменения.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Регрессионный тест сопоставляет `../modules/site.md` с
  `docs/modules/site.md` в выбранном снимке.
- [x] `AC-02` Для заявленного изменения не появляется предупреждение
  `undeclared-document-change`.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `go test ./internal/app -run TestTaskImpactResolvesRelativeDocumentationLinks`
- `AC-02` → `go test ./internal/app -run TestTaskImpactResolvesRelativeDocumentationLinks`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make fmt-check && go vet ./... && go test -race ./... && go mod verify && for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do GOOS=${target%/*} GOARCH=${target#*/} CGO_ENABLED=0 go build -trimpath -o /dev/null ./cmd/toudocu || exit 1; done`

<!-- toudocu:section regression-test -->
## Регрессионный тест

Временный Git-репозиторий изменяет документ по относительной ссылке, проверяет
его появление в `declared` и отсутствие ложного предупреждения.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Меняется только эта историческая запись. Контракт рабочих задач уже требует
обычные относительные Markdown-ссылки.
