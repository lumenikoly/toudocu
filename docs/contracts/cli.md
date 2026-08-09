# CLI Docu-docu v1

- Идентификатор: CON-CLI-V1
- Статус: Готово
- Владелец: Команда Docu-docu
- Последнее обновление: 2026-08-09

Документ фиксирует команды, побочные эффекты, exit codes и версионируемые
JSON-результаты CLI. Конкретный синтаксис флагов показывает
`docu-docu COMMAND --help`.

## Команды

| Команда | Что делает | Меняет данные |
|---|---|---|
| `check` | Проверяет документы, связи и OpenAPI | Нет |
| `build` | Собирает backend-independent static HTTP portal и `report.json` | Пишет только в output; `--clean` очищает проверенный output |
| `serve` | Запускает локальный портал, watcher, Editor и Changes API | Меняет canonical docs только по явному save, create или roadmap add в редакторе |
| `search` | Ищет по актуальной модели | Нет |
| `changes`, `changes file` | Сравнивает Git revisions, index и working tree | Нет, кроме явно указанного `-o` |
| `changes feedback pending` | Возвращает oldest local review snapshot для агента | Нет |
| `changes feedback respond` | Атомарно добавляет полный agent response в local review state | Да, только user-state вне repository; Git и Markdown не меняет |
| `task changes` | Показывает изменения и влияние на выбранную задачу | Нет, кроме явно указанного `-o` |
| `task init` | Создаёт черновик `TASK-*` или `BUG-*` | Создаёт один новый файл без перезаписи |
| `scaffold` | Создаёт типизированный документ | Создаёт один новый файл без перезаписи |
| `task ready`, `task context` | Проверяет готовность или возвращает контекст задачи | Нет |
| `task verify --dry-run` | Показывает план проверок задачи | Нет, кроме явно указанного `--report` |
| `task verify --run` | Выполняет команды, явно записанные в задаче | Да, в пределах команд репозитория и явно указанного `--report` |
| `task archive`, `task restore` | Перемещает завершённую задачу в архив или обратно | Перемещает один файл без перезаписи |
| `skill install`, `skill update`, `skill uninstall` | Управляет встроенным offline skill package | Пишет только в выбранный project/user target |
| `skill status` | Показывает target и состояние skill package | Нет |
| `version` | Печатает версию | Нет |

Путь без имени команды не запускает неявную сборку. Команд верхнего уровня
`init` и `refresh` нет: одноимённые `$docu-docu` workflows принадлежат AI-skill,
а не Go CLI.

## Skill lifecycle

```text
docu-docu skill install|status|update|uninstall
  [--agent auto|codex|claude-code|copilot|all]
  [--scope project|user]
  [--repository-root DIR]
```

По умолчанию используются `--agent auto` и `--scope project`.
`--repository-root` доступен только для project scope. `auto` выбирает
единственный обнаруженный host; при неоднозначности интерактивный terminal
предлагает выбор, а non-TTY возвращает `SKILL_AGENT_REQUIRED`. `all` планирует
все уникальные абсолютные targets до записи и затем обрабатывает их независимо.

CLI различает состояния `not-installed`, `installed`, `outdated`,
`newer-than-bundle`, `modified`, `unmanaged`, `invalid-manifest` и
`unsafe-path`. `status` всегда остаётся read-only. Изменяющие операции не
заменяют unmanaged, modified, invalid, newer или unsafe target. Форматы JSON,
`--dry-run` и `--force` не поддерживаются.

Успех или допустимый no-op возвращает `0`; конфликт, ошибка одного target или
частичный результат — `1`. Диагностика использует стабильные краткие коды,
включая `SKILL_AGENT_REQUIRED`, `SKILL_LOCAL_CHANGES`, `SKILL_UNMANAGED`,
`SKILL_MANIFEST_INVALID`, `SKILL_PATH_UNSAFE`, `SKILL_DOWNGRADE_BLOCKED`,
`SKILL_TARGET_CHANGED` и `SKILL_RESTORE_FAILED`.

## Общие правила

- Входной каталог задаётся явно; по умолчанию сервер слушает
  `127.0.0.1:8080` без TLS и аутентификации.
- `--host 0.0.0.0` открывает `serve` для доверенной локальной сети.
- Canonical `serve` по умолчанию один раз за процесс проверяет latest stable
  release и может показать ссылку в portal UI. `--no-update-check` отключает
  capability, endpoint и внешний запрос; для остальных команд флаг недопустим.
- `build` остаётся статическим и read-only. Editor, Swagger UI и server-only
  scripts в результат не попадают; сами OpenAPI-файлы копируются. Для
  локального browser runtime используется существующий `serve`; команды
  `preview` нет.
- Configured translation root доступен для проверки, сборки, поиска,
  просмотра изменений и read-only `serve`. Task workflow, scaffold и Editor
  возвращают `TRANSLATION_ROOT_READ_ONLY` до изменения файлов или запуска
  проверок.
- `task verify --run` разрешён только для Ready, In Progress, Blocked и Done;
  `--dry-run` можно использовать и для полного Draft.
- `changes` читает Git напрямую без shell, fetch, checkout и записи в index.
- Git revisions для `changes` разрешаются от enclosing Git top-level, а
  `.docu-docu/config.yml` и repository-relative config paths — от явно
  выбранного `--repository-root`, который должен содержать documentation root.
- `changes`, `changes file` и `task changes` принимают `--include-assets`,
  который включает binary assets независимо от `changes.includeAssets`, но с
  сохранением `changes.exclude`.
- `--translation-input` включает reader-facing Markdown, work artifacts и
  binary assets независимо от `includeTaskArtifacts`, `includeAssets` и
  `changes.exclude`; исключениями остаются только `generated/**` и `cache/**`
  внутри выбранного documentation root. С `--permanent-only` он несовместим.

## Результаты JSON

Все публичные отчёты используют `schemaVersion: 1`.

- `ProjectReport` описывает проект, документы, связи, roadmap, риски, знания,
  экраны, процессы и диагностику.
- `SearchReport`, `TaskInitReport`, `ScaffoldReport`, `TaskReadyReport`,
  `TaskContextReport`, `TaskMoveReport` и `TaskVerifyReport` принадлежат
  соответствующим workflow.
- `ChangeSetReport` — отдельная схема отчёта об изменениях и не входит в
  `ProjectReport`.
- `changes feedback pending --json` возвращает schema-v1 envelope с revision,
  state digest и `feedback`; пустая очередь содержит `feedback: null` и exit
  code `0`.
- `changes feedback respond --input response.json --json` принимает review ID,
  feedback ID/digest, expected revision/digest и полный набор item results.
  Успех возвращает `accepted: true` и новую пару revision/digest.

Пустые коллекции сериализуются как `[]`; номера строк начинаются с единицы.
Новые необязательные поля могут добавляться без смены версии схемы.

`task verify` записывает для каждой команды exit code, время, длительность,
ограниченные stdout/stderr и связанные targets. Итоговый статус — `passed`,
`failed` или `blocked`.

## Agent feedback

```text
docu-docu changes feedback pending [--repository-root DIR] --json
docu-docu changes feedback respond --input response.json \
  [--repository-root DIR] [--json]
```

Без `--repository-root` Git определяет enclosing repository от cwd. Явный путь
обязан быть canonical Git top-level. `pending` выдаёт batches FIFO по одному и
повторяет oldest до успешного полного response. `respond` отклоняет неизвестные
IDs, digest/revision conflict, missing или duplicate items, outcome вне
`fixed|notFixed|needsClarification`, oversized text/response и unsafe
`changedPaths`. Ни одна команда не запускает агента, LLM, shell или Git write.

Стабильные diagnostics включают `REVIEW_INVALID_RESPONSE`,
`REVIEW_MESSAGE_TOO_LARGE`, `REVIEW_STATE_BUSY`, `REVIEW_CONFLICT`,
`REVIEW_UNSAFE_PATH`, `REVIEW_STATE_CORRUPTED` и связанные `REVIEW_*` коды.

## Exit codes

- `0` — операция завершена успешно;
- `1` — ошибка аргументов, ввода-вывода, модели, генерации или проверки;
- `1` при `--strict` — найдена хотя бы одна warning;
- `changes`: `2` для ошибки аргумента или revision, `3` при недоступном Git,
  `4` при внутренней ошибке;
- `serve`: первоначальная ошибка сборки или listener завершает команду с `1`;
  ошибка последующей пересборки не останавливает сервер.
- `skill`: конфликт или частичная ошибка возвращает `1`; status и no-op — `0`.

## Подробные правила

- [Рабочие задачи](../guides/work-items.md)
- [Просмотр изменений](../guides/documentation-changes.md)
- [Виды документов](../reference/document-types.md)
- [Настройка](../reference/configuration.md)
- [Установка AI-skill](../guides/skill-installation.md)
