<!-- toudocu
version: 1
id: TASK-DOCS-004
status: done
taskType: documentation
priority: high
module: MOD-MODEL
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-10
-->

# TASK-DOCS-004: Добавить систематическое обновление документации

<!-- toudocu:section result -->
## Результат

Пользователь может явно запустить полное обновление документации или ограничить
его текущими изменениями Git. Skill сверяет Markdown с реализацией, меняет
только подтверждённые факты и в обычном процессе завершает работу проверкой
смысла и структуры.

<!-- toudocu:section behavior-change -->
## Изменение поведения

<!-- toudocu:section before -->
### Было

Skill обновлял отдельные документы по конкретному запросу, но не предлагал
единого способа регулярно проверить актуальность всего набора.

<!-- toudocu:section after -->
### Станет

`$toudocu refresh` охватывает всю документацию. `$toudocu refresh diff`
начинает со staged, unstaged и untracked изменений относительно `HEAD`, затем
добавляет зависимые документы. Оба режима могут обновить, удалить или
переименовать документ, если репозиторий даёт однозначное основание.

<!-- toudocu:section scope -->
## Область изменения

- `skills/toudocu/`;
- разбор аргументов CLI, подтверждающий отсутствие Go-команды `refresh`;
- тесты шаблонов и интеграционные тесты;
- README, журнал изменений, `AGENTS.md` и исходная документация.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

- новая Go-команда `toudocu refresh`;
- отдельный режим обновления только для чтения;
- сравнение с merge base или веткой по умолчанию;
- изменение кода ради соответствия тексту;
- обновление `Last verified` без реального выполнения runbook.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Skill направляет `$toudocu refresh` и `$toudocu refresh diff` в
  отдельный процесс, не смешивая их с `init`.
- [x] `AC-02` Полный режим читает всю документацию; diff-режим использует
  `HEAD`, учитывает все виды локальных изменений и расширяет охват по связям.
- [x] `AC-03` Процесс опирается на доказательства, безопасно меняет даты,
  идентификаторы и пути и честно перечисляет нерешённые расхождения.
- [x] `AC-04` Проверка смысла и структуры предшествует условной пересборке
  отслеживаемого портала. Сгенерированный результат не редактируется как
  источник.
- [x] `AC-05` Русские и английские правила и пользовательская документация
  одинаково описывают оба вызова как операции skill.
- [x] `AC-06` Go CLI отклоняет `toudocu refresh`.

<!-- toudocu:section plan -->
## План

- [x] Добавить описание `refresh` и маршрутизацию вызовов.
- [x] Согласовать управляемые правила, метаданные и документацию.
- [x] Закрепить полный и ограниченный режимы тестами.
- [x] Провести независимую проверку смысла.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` → `go test ./... -run 'TestUseToudocuRefresh'`
- `AC-02` → `go test ./... -run 'TestUseToudocuRefresh'`
- `AC-03` → `go test ./... -run 'TestUseToudocuRefresh'`
- `AC-04` → `go test ./... -run 'TestUseToudocuRefresh'`
- `AC-05` → `go test ./... -run 'TestUseToudocuRefresh|TestUseToudocuMetadata|TestUseToudocuProjectGuidanceTemplates'`
- `AC-06` → `go test ./... -run 'TestCLIArguments|TestUseToudocuRefresh'`
- `ALL` → `go test -count=1 ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `go test ./... -run 'TestUseToudocu'`

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Были обновлены встроенный skill, русские и английские управляемые правила,
README, журнал изменений, документация Toudocu и корневой `AGENTS.md`.

<!-- toudocu:section use-case-omission-reason -->
## Обоснование отсутствия сценария

Это способ работы AI-skill, а не новая команда или пользовательский сценарий
Go CLI.
