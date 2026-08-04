# CLI и workflow задач

- Идентификатор: MOD-CLI
- Статус: Готово
- Владелец: Команда Docu-docu
- Последнее обновление: 2026-08-03

Модуль предоставляет команды Docu-docu и детерминированный workflow от поиска и
каркаса задачи до контекста и управляемого выполнения объявленных проверок.

## Назначение

Объединить операции проверки, сборки, локального просмотра и task workflow в
предсказуемом CLI с устойчивыми exit codes и JSON-выводом.

## Расположение в коде

- публичный фасад и entrypoint: `api.go`, `cmd/docu-docu/main.go`;
- CLI и локальный HTTP-сервер: `internal/app/cli.go`, `internal/app/server.go`;
- read-only контекст и readiness: `internal/app/task_context.go`, `internal/app/task_ready.go`;
- search и каркасы: `internal/app/search.go`, `internal/app/scaffold.go`;
- выполнение verify и управление процессами: `internal/app/task_verify.go`, `internal/app/command_process_*.go`.

## Границы

CLI не интерпретирует пользовательский запрос. `task ready` и `task context`
только читают данные, а `task verify --run` запускает команды после локального
validation gate. Prompt-workflows `$use-docu-docu init`, `$use-docu-docu refresh`
и `$use-docu-docu refresh diff` находятся за границей Go CLI.

## Бизнес-правила

### BR-CLI-001: Контекст задачи не исполняет команды

`task context` возвращает задачу, связанные сущности, документы и diagnostics,
но не вызывает системную оболочку.

### BR-CLI-002: Проверки запускаются только явно

Команды `AC-*`, `ALL` и `DOCS` исполняются только через `task verify --run`.
Повторяющаяся команда выполняется один раз и сохраняет все связанные targets.

### BR-CLI-003: Timeout завершает дерево процессов

При превышении timeout завершается не только shell, но и созданные им дочерние
процессы; отчёт получает статус `timed_out`.

### BR-CLI-004: Docu-docu не интерпретирует пользовательский запрос

Docu-docu создаёт нейтральные каркасы и проверяет структуру. Выбор сущностей,
формулировка требований, изменение статуса и подтверждение критериев остаются
ответственностью исполнителя.

### BR-CLI-005: Browser и CLI используют один scaffold registry

`task init` и семь вариантов `scaffold` сохраняют публичные команды, но их
порядок, fields, validation, target path и renderer определяет тот же registry,
который `serve` возвращает editor UI. Создание остаётся атомарным `O_EXCL`.

## Инварианты

- JSON-режим не смешивает отчёт с потоковым текстовым выводом;
- команды выполняются последовательно даже после ошибки;
- каждая команда запускается из repository root;
- stdout и stderr ограничены последним 1 MiB каждого потока;
- сборка требует явного `docu-docu build`; путь без команды отклоняется;
- зарезервированные skill-level имена `init` и `refresh` отклоняются как
  неизвестные команды Go CLI;
- `serve` по умолчанию слушает только loopback; сетевой доступ включается явно;
- `--host`, `--port`, `--open` и отсутствие auto-open не изменены; `--no-open`
  не добавлен, а `--edit` остаётся неизвестным параметром.

## Стабильные интерфейсы

- команды и параметры из [CLI-контракта](../contracts/cli.md);
- `ProjectReport` и `TaskContextReport` schema v1;
- `SearchReport`, `TaskInitReport`, `ScaffoldReport`, `TaskReadyReport` и
  `TaskVerifyReport` schema v1;
- exit code `0` только при успешном результате операции.

## Связанные сценарии

- [UC-TASK-01: Контекст рабочей задачи](../use-cases/task-workflow.md)
- [UC-TASK-02: Проверка рабочей задачи](../use-cases/task-verify.md)
- [UC-TASK-03: Подготовка рабочей задачи](../use-cases/UC-TASK-03.md)
- [UC-DOCS-02: Проверка документации](../use-cases/check-documentation.md)
- [UC-DOCS-03: Локальный сервер](../use-cases/serve-portal.md)

## Связанные процессы

- [FLOW-DOCS-CHECK: Проверка документационного контракта](../flows/FLOW-DOCS-CHECK.md)
- [FLOW-DOCS-SERVE: Локальный просмотр портала](../flows/FLOW-DOCS-SERVE.md)
- [FLOW-TASK-WORKFLOW: Работа с проверяемой задачей](../flows/FLOW-TASK-WORKFLOW.md)
