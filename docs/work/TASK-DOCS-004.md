# TASK-DOCS-004: Добавить refresh workflow для актуализации документации

- Статус: Выполнено
- Тип: Documentation
- Приоритет: Высокий
- Модуль: MOD-MODEL
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Docgent
- Последнее обновление: 2026-07-31

## Результат

Пользователь явно запускает полный или diff-ограниченный refresh документации;
skill сверяет Markdown с текущими источниками истины, применяет доказуемые
обновления и завершает работу semantic и structural gates.

## Изменение поведения

### Было

Skill обновлял документацию только по конкретному запросу и не имел явного
workflow для систематического ревью актуальности.

### Станет

`$use-docgent refresh` проверяет весь проект, а `$use-docgent refresh diff`
проверяет staged, unstaged и untracked изменения относительно `HEAD` и
зависимую документацию. Оба режима могут обновлять, удалять и переименовывать
документы при однозначной доказательной базе.

## Область изменения

- `skills/use-docgent/`;
- `cli.go`;
- `skill_templates_test.go`;
- `integration_test.go`;
- `README.md`;
- `CHANGELOG.md`;
- `AGENTS.md`;
- `docs/`;
- `project-docs/`;
- `example/project-docs/`.

## Не входит в задачу

- новая Go-команда `docgent refresh`;
- отдельный read-only refresh workflow;
- merge-base или сравнение с default branch;
- изменение кода ради согласования с документацией;
- обновление `Last verified` без фактической проверки runbook.

## Критерии приёмки

- [x] `AC-01` Skill маршрутизирует `$use-docgent refresh` и `$use-docgent
  refresh diff` в отдельный workflow, не ослабляя эксклюзивность init.
- [x] `AC-02` Полный режим проверяет всю документацию, а diff-режим использует
  `HEAD`, включает staged, unstaged и untracked файлы и расширяет охват через
  зависимости документации.
- [x] `AC-03` Workflow применяет evidence-first update, безопасную политику
  дат, доказуемые delete/rename/ID migration и честно сообщает unresolved
  findings.
- [x] `AC-04` Semantic и structural gates предшествуют условной пересборке
  tracked portals; generated output не редактируется как источник.
- [x] `AC-05` RU/EN guidance, metadata и пользовательская документация
  синхронно описывают обе команды как skill-level workflows.
- [x] `AC-06` Go CLI по-прежнему отклоняет `docgent refresh`, а полный цикл
  тестов и строгой проверки завершается без warnings/errors.

## План

- [x] Добавить refresh reference и маршрутизацию команд.
- [x] Синхронизировать managed guidance, metadata и self-documentation.
- [x] Зафиксировать полный, diff, safety и no-CLI contracts тестами.
- [x] Провести независимый semantic review и устранить замечания.
- [x] Выполнить полный verification и пересобрать tracked portals.

## Проверка

- `AC-01` → `go test ./... -run 'TestUseDocgentRefresh'`
- `AC-02` → `go test ./... -run 'TestUseDocgentRefresh'`
- `AC-03` → `go test ./... -run 'TestUseDocgentRefresh'`
- `AC-04` → `go test ./... -run 'TestUseDocgentRefresh'`
- `AC-05` → `go test ./... -run 'TestUseDocgentRefresh|TestUseDocgentMetadata|TestUseDocgentProjectGuidanceTemplates'`
- `AC-06` → `go test ./... -run 'TestCLIArguments|TestUseDocgentRefresh'`
- `ALL` → `go test -count=1 ./...`
- `DOCS` → `go run ./cmd/docgent check ./docs --repository-root . --strict --stale-days 0 && go run ./cmd/docgent check ./example/docs --repository-root ./example --strict --stale-days 0`
- `QUALITY` → `go test ./... -run 'TestUseDocgent'`

## Влияние на документацию

Обновляются публичный workflow skill, RU/EN managed guidance, README,
changelog, self-documentation, корневой `AGENTS.md` и оба tracked portal.

## Обоснование отсутствия сценария

Изменение определяет orchestration устанавливаемого AI-skill и не добавляет
наблюдаемую команду или сценарий Go CLI.
