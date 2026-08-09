# CLI и workflow задач

- Идентификатор: MOD-CLI
- Статус: Готово
- Владелец: Команда Toudocu
- Последнее обновление: 2026-08-09

Модуль предоставляет команды Toudocu и детерминированный workflow от поиска и
каркаса задачи до контекста и управляемого выполнения объявленных проверок.

## Назначение

Объединить операции проверки, сборки, локального просмотра и task workflow в
предсказуемом CLI с устойчивыми exit codes и JSON-выводом.

## Расположение в коде

- публичный фасад и entrypoint: `api.go`, `cmd/toudocu/main.go`;
- CLI и локальный HTTP-сервер: `internal/app/cli.go`, `internal/app/server.go`;
- read-only контекст и readiness: `internal/app/task_context.go`, `internal/app/task_ready.go`;
- search и каркасы: `internal/app/search.go`, `internal/app/scaffold.go`;
- выполнение verify и управление процессами: `internal/app/task_verify.go`, `internal/app/command_process_*.go`;
- архивирование и восстановление work items: `internal/app/task_archive.go`.
- embedded skill bundle: `skills/bundle.go`;
- registry, planner, manifest и filesystem lifecycle: `internal/skillinstall/`;
- text CLI и внутренний TTY-контекст: `internal/app/skill_cli.go`.

## Границы

CLI не интерпретирует пользовательский запрос. `task ready` и `task context`
только читают данные, а `task verify --run` запускает команды после локального
validation gate. Prompt-workflows `$toudocu init`, `$toudocu refresh`
и `$toudocu refresh diff` находятся за границей Go CLI.
Команда `skill` управляет только файлами embedded package и не исполняет его
содержимое; lifecycle намеренно не добавлен в публичный Go-фасад.

## Бизнес-правила

### BR-CLI-001: Контекст задачи не исполняет команды

`task context` возвращает задачу, связанные сущности, документы и diagnostics,
но не вызывает системную оболочку.

### BR-CLI-002: Проверки запускаются только явно

Команды `AC-*`, `ALL`, `DOCS` и условный `QUALITY` исполняются только через
`task verify --run`. Повторяющаяся команда выполняется один раз и сохраняет все
связанные targets.

### BR-CLI-003: Timeout завершает дерево процессов

При превышении timeout завершается не только shell, но и созданные им дочерние
процессы; отчёт получает статус `timed_out`.

### BR-CLI-004: Toudocu не интерпретирует пользовательский запрос

Toudocu создаёт нейтральные каркасы и проверяет структуру. Выбор сущностей,
формулировка требований, изменение статуса и подтверждение критериев остаются
ответственностью исполнителя.

### BR-CLI-005: Browser и CLI используют один scaffold registry

`task init` и семь вариантов `scaffold` сохраняют публичные команды, но их
порядок, fields, validation, target path и renderer определяет тот же registry,
который `serve` возвращает editor UI. Создание остаётся атомарным `O_EXCL`.

### BR-CLI-006: Translation root не является рабочим контекстом

Configured translation root доступен для `check`, `build`, read-only `serve`,
`search` и обычного просмотра changes. `task init`, `task context`, `task ready`,
`task verify`, `task changes`, `task archive`, `task restore`, `scaffold` и
editor-запись отклоняются с `TRANSLATION_ROOT_READ_ONLY`. Work items перевода
остаются читательским зеркалом, а агент и CI используют только canonical docs
root.

### BR-CLI-007: Архивирование не изменяет контракт задачи

`task archive` и `task restore` перемещают один допустимый work item без
перезаписи и не изменяют его Markdown или статус. Операция блокируется, если
перемещение разорвёт разрешение прямой Markdown-ссылки.

### BR-CLI-008: Managed skill не перезаписывает пользовательские изменения

Lifecycle изменяет только отсутствующую или неизменённую managed-копию с
валидным manifest. Дополнительный, изменённый, удалённый bundled-файл,
изменение permissions, symlink, unmanaged каталог, повреждённый manifest и
более новая версия блокируют запись; `--force` отсутствует.

### BR-CLI-009: Skill lifecycle работает offline

Единственный канонический package встраивается в binary. `skill install`,
`status`, `update` и `uninstall` не используют сеть, shell, marketplace и не
исполняют scripts из bundle.

### BR-CLI-010: Multi-target планируется до записи

Для `--agent all` CLI сначала разрешает и классифицирует все дедуплицированные
targets. Выполнение каждого target независимо продолжается после ошибки;
конфликт или частичный результат возвращает exit code `1`.

## Инварианты

- JSON-режим не смешивает отчёт с потоковым текстовым выводом;
- команды выполняются последовательно даже после ошибки;
- каждая команда запускается из repository root;
- stdout и stderr ограничены последним 1 MiB каждого потока;
- сборка требует явного `toudocu build`; путь без команды отклоняется;
- зарезервированные skill-level имена `init` и `refresh` отклоняются как
  неизвестные команды Go CLI;
- task workflow и создание сущностей никогда не используют configured
  translation root;
- `serve` по умолчанию слушает только loopback; сетевой доступ включается явно;
- `--host`, `--port`, `--open` и отсутствие auto-open не изменены; `--no-open`
  не добавлен, а `--edit` остаётся неизвестным параметром.
- `skill status` не пишет filesystem; изменяющие skill-команды повторно сверяют
  snapshot после атомарного backup move и восстанавливают прежнюю копию при
  ошибке публикации.

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
- [UC-TASK-04: Архивирование и восстановление задачи](../use-cases/UC-TASK-04.md)
- [UC-DOCS-02: Проверка документации](../use-cases/check-documentation.md)
- [UC-DOCS-03: Локальный сервер](../use-cases/serve-portal.md)
- [UC-AGENT-01: Установка AI-skill](../use-cases/UC-AGENT-01.md)

## Связанные процессы

- [FLOW-DOCS-CHECK: Проверка документационного контракта](../flows/FLOW-DOCS-CHECK.md)
- [FLOW-DOCS-SERVE: Локальный просмотр портала](../flows/FLOW-DOCS-SERVE.md)
- [FLOW-TASK-WORKFLOW: Работа с проверяемой задачей](../flows/FLOW-TASK-WORKFLOW.md)
