# Использование AI-skill Toudocu

Руководство объясняет, как вызывать установленный skill из AI-агента для
повседневной работы с CLI, порталом, work items и исходной документацией, а
также когда выбирать специальные workflow `init`, `refresh`, `translate` и
`feedback`.

## Два разных интерфейса

Команды `toudocu skill ...` выполняются в shell и управляют только
установленной копией skill:

```bash
toudocu skill install
toudocu skill status --agent all
toudocu skill update --agent codex
toudocu skill uninstall --agent codex
```

Вызовы `$toudocu ...` пишутся в prompt AI-агенту. Это инструкции агенту,
а не подкоманды Go CLI:

```text
$toudocu проверь исходную документацию и объясни diagnostics
$toudocu собери локальный портал в установленный проектом output
$toudocu подготовь контекст TASK-AREA-001
$toudocu обнови руководство по установке по текущему CLI-контракту
$toudocu feedback
```

Сам CLI предоставляет `check`, `build`, `serve`, `search` и `task ...`, но не
имеет команд `init`, `refresh` или `translate`. Для работы внутри исходного
репозитория Toudocu агент использует `go run ./cmd/toudocu`; в других
проектах — установленный `toudocu` из `PATH`.

## Что можно поручить skill

Обычный запрос не обязан быть одним из специальных workflow. Skill подходит,
когда нужно:

- проверить документацию, разобрать ошибки и предупреждения или найти документ;
- собрать либо локально запустить статический портал по принятой в проекте
  конфигурации;
- создать или уточнить подтверждённый документационный источник: guide,
  contract, ADR, module, use case, flow, screen, roadmap, risk или work item;
- получить read-only контекст существующего `TASK-*`, проверить его готовность,
  просмотреть verification plan или выполнить явно запрошенную проверку;
- обновить обычную документацию по указанному пользователем поведению, коду или
  решению без полного обзора проекта.

Агент сначала читает repository instructions, применимые стандарты и реальные
runbook, переиспользует найденные docs root, repository root, excludes, stale
policy и output. Если соглашений нет, fallback — `./docs` и его родитель.
Диагностика `check` подтверждает структуру, ссылки и объявленные связи, но не
доказывает полезность или истинность текста.

## Границы разрешений

Обычная работа следует запрошенному изменению: просьба проверить или объяснить
не разрешает менять файлы, а просьба обновить конкретный документ разрешает это
обновление и необходимые согласованные ссылки. Следующие действия требуют
отдельного явного запроса:

| Действие | Необходимое разрешение |
|---|---|
| `$toudocu init` | Явный вызов init или однозначная просьба выполнить именно этот workflow |
| `$toudocu refresh` | Явный вызов полного refresh |
| `$toudocu refresh diff` | Явный вызов diff refresh |
| `$toudocu translate <locale> ...` | Явный запрос перевода и выбранная целевая локаль |
| `$toudocu translate diff` | Явный вызов перевода текущего diff во все настроенные целевые локали |
| `$toudocu feedback` | Явный запрос обработать локальные comments из Changes; разрешает только обоснованные изменения и релевантные проверки |
| `task verify --run` | Явная просьба выполнить или проверить задачу в доверенном репозитории |

Отсутствующие файлы, первое использование skill, обычная правка документации
или запуск `check` не разрешают `init`. Обычный запрос «актуализировать этот
guide» не разрешает полный `refresh`. `task context`, `task ready` и
`task verify --dry-run` не исполняют команды; `task verify --run` исполняет
доверенный код репозитория с правами текущего пользователя.

Work item создаётся только по явному требованию пользователя или проекта либо
когда существенной работе действительно нужны долговечные scope, acceptance,
verification и handoff. Небольшая правка или обычный prompt сами по себе не
требуют `TASK-*`.

## Повседневные сценарии

### Проверка и поиск

Для диагностики агент предпочитает JSON, а для подтверждения результата
человеком — text output:

```bash
toudocu check ./docs --repository-root . --format json
toudocu check ./docs --repository-root .
toudocu search "verification" ./docs --format json
```

Обычный `check` падает на errors и сообщает warnings. `--strict` дополнительно
делает warning причиной ненулевого exit code и используется только по политике
проекта, CI или явному запросу.

### Портал

По запросу на сборку агент переиспользует принятый output либо выбирает
отдельный disposable-каталог. `build` пишет generated output, а `serve`
собирает его и запускает локальный HTTP server. Перед `--clean` агент обязан
проверить, что разрешённый output безопасен и не является input, его предком,
system root или небезопасной symlink-целью. По умолчанию `serve` слушает
`127.0.0.1`; `0.0.0.0` выбирается только для явно запрошенного доверенного
локального preview.

Generated `build/`, `dist/`, `project-docs/` и portal output не редактируются
как источник документации. Портал собирается только по запросу, для проверки
или по установленной политике проекта.

`serve` поднимает локальный редактор без аутентификации. Явные browser-действия
save, create и roadmap add могут изменить canonical sources. По умолчанию
canonical portal один раз проверяет latest stable release через GitHub Releases.
Для работы без исходящего запроса агент добавляет `--no-update-check`; внешний
bind требует отдельного явного запроса и доверенной сети.

### Work items

Для существующей Ready+ задачи агент начинает с компактного read-only контекста:

```bash
toudocu task context TASK-AREA-001 ./docs \
  --repository-root . \
  --format json
```

Перед исполнением разрешённой проверки он сначала показывает dry run:

```bash
toudocu task verify TASK-AREA-001 ./docs --dry-run \
  --repository-root . \
  --format json
```

Только после явной просьбы выполнить проверку, в доверенном репозитории и после
task-local validation gate разрешён режим `--run`. Report сохраняется вне
исходной документации. Архивирование и восстановление выполняются только через
`task archive` и `task restore`.

### Обычная правка документации

Агент определяет аудиторию, полезный вопрос и источник истины, обновляет
существующий документ вместо дублирования и пишет только подтверждённые
утверждения. Typed document выбирается по смыслу, а не ради ID или зелёной
проверки. Неизвестные status, owner, date, relationship и procedure не
изобретаются.

Для каждого изменения действуют два последовательных gate:

1. Semantic gate: автор проверяет полезность, доказательства, границы,
   отсутствие противоречий и правильный источник истины. Изменения требований,
   поведения, архитектуры, контрактов, статусов, stable IDs и machine-readable
   связей требуют независимого semantic review.
2. Structural gate: после semantic review выполняется обычный project-wide
   `check`; strict-check добавляется только по политике проекта или запросу.

Структурную ошибку исправляют в источнике. Значимую связь нельзя удалить, а
неподтверждённый текст — добавить только ради чистого отчёта.

## Специальные workflow

### Feedback из Changes

`$toudocu feedback` получает oldest local snapshot командой
`changes feedback pending --json`. Агент проверяет target/anchor и текущий Git
diff, трактует `issue`, `suggestion`, `question` и `praise` по их смыслу,
изменяет только обоснованные места и запускает минимальные релевантные проверки.

Для каждого item возвращается ровно один outcome:
`fixed`, `notFixed` или `needsClarification`, пояснение и только относящиеся к
нему safe repository-relative `changedPaths`. `respond` принимает весь batch
атомарно по feedback digest и review revision/state digest. При конфликте агент
заново получает pending и пересматривает batch, а не подменяет CAS. После успеха
workflow последовательно обрабатывает следующий FIFO batch до пустой очереди.
Ни transport CLI, ни Changes UI не запускают агента и не resolve threads.

### Инициализация

`$toudocu init` используется только по явному запросу. Workflow проверяет
repository instructions, существующую документацию, конфигурацию и managed
markers в корневом `AGENTS.md`. Наличие только одного marker из пары, дубликат,
обратный порядок или вложенность блокируют запись. Отдельно workflow
останавливается, если unmanaged-инструкция конфликтует с Toudocu trigger или
политикой создания задач. Любой legacy Markdown внутри `architecture/`, кроме
единственного структурно корректного overview, также блокирует автоматическую
миграцию.

При безопасном preflight workflow создаёт только отсутствующие минимальные
`index.md` и `architecture/overview.md`, заполняет project locale и встроенную
section map и добавляет либо обновляет managed project guidance. Он не
изобретает typed entities и не создаёт задачу автоматически. Init не является
командой Go CLI и никогда не запускается из-за отсутствующих файлов.

Пути разрешаются от найденных repository root и documentation root, поэтому
workflow не предполагает имя каталога `docs`. Для `en-*` и `ru-*` используются
соответственно bundled assets `en` и `ru`. Другая locale допустима только при
заранее заданной полной карте из 12 section titles и явном выборе английских
или русских bundled guidance/structure assets; исходный текст при этом пишется
в project locale. H1 нового built-in entry всегда берётся из итоговой section
map, а не копируется из шаблона. При отсутствии этих данных init
останавливается до записи. При strict policy warnings, которые init сам
устраняет, не блокируют preflight: это только `missing-index`,
`missing-project-locale` и `incomplete-project-sections`.

### Полная актуализация

`$toudocu refresh` сопоставляет каждый Markdown-документ canonical root с
актуальными repository evidence: кодом, тестами, публичными интерфейсами,
schemas, configuration, CI, решениями и подтверждёнными требованиями. Каждый
документ классифицируется как current, needs update, unverifiable, obsolete,
duplicated или misplaced. Workflow меняет только evidence-backed утверждения,
сохраняет неоднозначные конфликты как unresolved findings и затем проходит
semantic review и project-wide structural check.

Refresh не выполняет init, не устанавливает managed guidance и не создаёт новое
дерево документации. Дата обновляется только вместе с содержанием или связями;
`Last verified` runbook меняется только после фактической проверки процедуры.

### Актуализация текущего diff

`$toudocu refresh diff` требует Git worktree и валидный `HEAD`. Начальный
change set строится из:

```bash
git diff --name-only HEAD --
git ls-files --others --exclude-standard
```

Так охватываются staged, unstaged и untracked изменения относительно `HEAD`,
без merge-base или default branch. Затем workflow добавляет документы,
затронутые через local links, backlinks, stable IDs, task relationships,
declared repository paths и изменённое публичное поведение. Generated output,
caches, vendored artifacts и translation roots исключаются. Если Git или
`HEAD` недоступен, агент останавливается и предлагает полный refresh, не
расширяя область молча.

### Перевод

`$toudocu translate <locale>` требует configured target profile и ровно один
режим:

```text
$toudocu translate <locale> --task TASK-ID
$toudocu translate <locale> --base REF
$toudocu translate <locale> --all-stale
```

`$toudocu translate diff` не принимает locale или дополнительные режимы. Он
требует Git worktree и валидный `HEAD`, один раз строит change set staged,
unstaged и untracked canonical-файлов через:

```bash
toudocu changes ./docs --base HEAD --target working-tree \
  --translation-input --format json
```

`--translation-input` сохраняет reader-facing файловый паритет независимо от
task, asset и произвольных config-excludes, оставляя исключёнными только
`generated/**` и `cache/**` внутри canonical root. Затем workflow валидирует все
настроенные translation profiles до первой записи и обрабатывает их по одному в
нормализованном порядке locale. Профили должны быть полными до запуска перевода
и не создаются или не дополняются этим workflow. Пустой diff не меняет targets
или manifests. Ошибка
перевода или strict-check одной локали оставляет её manifest неизменённым, но не
мешает обработать остальные; итоговый отчёт сохраняет отдельный результат для
каждой локали.

Workflow поддерживает в configured translation root тот же набор читательских
файлов, что и в canonical root. Он обрабатывает одну source/target-пару за раз,
сохраняет IDs, команды, пути, URL, anchors, code fences и machine-readable
contracts. Binary assets копируются byte-for-byte. Переведённые work items
являются только read-only зеркалом и никогда не используются для task context,
readiness, verification или editor writes.

Перед изменением manifest агент выполняет strict JSON checks canonical и target
roots, сравнивает нормализованные document types, status kinds и roadmap
semantics, затем запускает финальный strict-check выбранной локали. Semantic
mismatch или ошибка проверки оставляет manifest неизменённым и попадает в
отчёт.

## Изоляция переводов

Canonical documentation root — единственный источник для обычного поиска по
репозиторию, inventory, semantic review, implementation analysis и task
context. Настроенные translation roots, включая переведённые work items,
исключаются из этих операций и не добавляются в ignore-файлы.

Выбранный translation root читается только при явном
`$toudocu translate <locale>` или явной просьбе проверить, найти, собрать,
запустить либо изучить эту локаль. Явный `$toudocu translate diff` разрешает
последовательно открыть все настроенные roots. В каждый момент доступ
ограничивается одной locale и минимальной source/target-парой; для parity
сначала сравниваются relative paths, source digests и structural reports.

## Что сообщает агент

После работы агент перечисляет все изменённые файлы: canonical sources, locale
targets и manifest для translate, а для init также конфигурацию и managed-блок
корневого `AGENTS.md`. Он сообщает результат авторского semantic review и
независимого review, когда он обязателен, исправленные errors, оставшиеся
warnings и применённую validation policy. Для refresh отчёт также включает
просмотренную область, evidence, unresolved findings, migrations IDs и
изменения дат. Для translate — выбранный режим, locale, parity и состояние
manifest; для translate diff — base `HEAD` и отдельный результат каждой
настроенной locale. Сборка портала и `task verify --run`, если они не были
разрешены или не требовались, отмечаются как намеренно не выполненные.
