# Просмотр изменений документации

Toudocu использует Git как единственный источник старой и новой версии. Он не
создаёт snapshots, не выполняет fetch и не изменяет history, refs, index или
working tree. Раздел доступен только в `serve` по адресу `/changes/`; обычный
`build` остаётся автономным представлением текущей документации и не требует
Git history.

## Режимы сравнения

По умолчанию `HEAD → working-tree` включает staged, unstaged, удаления и
untracked-файлы. Также доступны `HEAD → index`, revision → revision, revision →
working-tree и `merge-base(base-ref, HEAD) → working-tree` через
`--branch-base`. Base, target, resolved commit, branch и dirty state всегда
видимы. Toudocu не загружает remote refs и не угадывает неоднозначную базу.

Git revisions разрешаются от enclosing Git top-level. Для вложенного проекта
`--repository-root` отдельно выбирает его `.toudocu/config.yml`; относительные
`changes.exclude` интерпретируются от этого project root.

## Три уровня diff

`Исходник` — Git unified patch без external diff и textconv. Unified view
показывает old/new line numbers, переходы, копирование и deep links для hunks;
полный patch можно скопировать отдельно. `Side by side` использует read-only
CodeMirror MergeView над содержимым обеих Git-сторон. Binary и слишком большие
файлы получают diagnostic, не блокируя change set.

`До и после` пропускает обе версии Markdown через безопасный renderer портала.
Новая или удалённая сторона явно отсутствует. Изменённые Markdown-секции
сопоставляются по anchor и отмечаются как added/removed/modified/moved; это не
DOM diff. Ошибка Mermaid одной стороны не скрывает вторую.

`Семантика` сравнивает нормализованные metadata, sections, task criteria,
стабильные `BR-*`, `INV-*`, `TR-*` и relations детерминированно, без LLM.
Изменения сохраняют old/new и source locations. Пробелы и форматирование без
изменения project model игнорируются. Ошибка parsing отключает только semantic
view.

## Специализированные представления

- OpenAPI сравнивается по info/servers/tags/webhooks, operations, parameters,
  request body, responses и headers, security schemes/alternatives, schemas,
  properties, required fields и enum с `breaking`, `potentially-breaking`,
  `non-breaking` или `informational` compatibility. Например, новый required
  parameter или request body, удалённый security alternative, удалённое schema
  property и суженный enum — breaking; новое optional property — non-breaking;
  случаи, зависящие от клиента, остаются potentially-breaking;
- Mermaid-блоки сопоставляются по `%% id: <stable-id>` либо по секции и
  порядку, рендерятся независимо до и после и показывают source line diff.
  Для крупных схем доступны zoom, pan и fullscreen. При неоднозначном
  сопоставлении report выдаёт `mermaid-block-match-ambiguous`; структурно
  нераспознанная старая или новая сторона получает отдельный diagnostic;
- PNG, JPEG, WebP и SVG показываются рядом с byte sizes, dimensions и aspect
  ratio; для двух растровых сторон доступен overlay slider;
- SC/TR дают change overlay на основной карте, filters added/modified/removed
  и JSON screen-map diff с old-side ghost entities.

## CLI и CI

```bash
toudocu changes ./docs --format text
toudocu changes ./docs --base main --target working-tree --format json
toudocu changes ./docs --branch-base main --format markdown
toudocu changes ./docs --status modified --module MOD-AUTH --type use-case
toudocu changes ./docs --include-assets --format json
toudocu changes ./docs --translation-input --format json
toudocu changes ./docs --permanent-only --format json
toudocu changes file docs/modules/MOD-AUTH.md --base HEAD --target index
toudocu task changes TASK-AUTH-015 ./docs --format json
```

CLI-фильтры применяются к уже построенному change set:

| Флаг | Отбор |
|---|---|
| `--status STATUS` | точное состояние `added`, `untracked`, `modified`, `deleted` или `renamed` |
| `--module VALUE` | совпадение по path, ID/названию сущности или semantic summary |
| `--type TYPE` | тип нормализованной сущности, например `module`, `use-case`, `flow`, `screen` или `task` |
| `--permanent-only` | только classification `permanent-documentation`, без work artifacts, contracts и assets |
| `--include-assets` | включает binary assets независимо от `changes.includeAssets`, сохраняя `changes.exclude` |
| `--translation-input` | включает reader-facing Markdown, work artifacts и assets; из config-excludes сохраняет только `generated/**` и `cache/**` внутри docs root |

Фильтры можно сочетать. Text, JSON и Markdown получают одну отфильтрованную
сводку; `-o FILE` записывает выбранный формат в отдельный файл.

Exit code `1` означает построенный отчёт с error, `2` — неверный диапазон, `3`
— Git недоступен/не найден, `4` — внутренняя ошибка.

Workflow `$toudocu translate` использует этот report только как входные
данные: skill-параметр `--task` вызывает канонический `task changes` до
`working-tree`, а `--base` —
`<base> → working-tree`. Публичный флаг `--translation-input` формирует полный
reader-facing набор независимо от `changes.includeTaskArtifacts`,
`changes.includeAssets` и произвольных `changes.exclude`; schema
`ChangeSetReport` при этом остаётся v1.
Точный `sourceDiff` остаётся приоритетным и доступным, когда rendered,
semantic, OpenAPI или Mermaid представления добавляют свои diagnostics.

## Task impact

Изменение `TASK-*` отделяется как контракт задачи от постоянной документации.
Явные пути `Влияние на документацию` сопоставляются с Git change set. Warning
о незаявленном, неизменённом или заявленном, но не созданном документе требует review, но сам по себе не
доказывает ошибку реализации и не блокирует completion.

См. [HTTP contract](../contracts/changes-http.md),
[JSON report](../reference/changes-report.md) и
[архитектуру Git snapshots](../architecture/documentation-changes.md).
