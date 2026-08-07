# Agent-workflows Docu-docu

Устанавливаемый skill добавляет четыре явных workflow для создания и
актуализации исходной документации. Они изменяют Markdown по подтверждённым
repository evidence и не являются командами Go CLI.

## Инициализация

`$docu-docu init` используется только по явному запросу. Workflow изучает
существующие инструкции и документацию, создаёт недостающие минимальные
`index.md` и `architecture/overview.md`, добавляет project locale/section map и
управляемый блок guidance в `AGENTS.md`. Существующая неоднозначная или
конфликтующая структура блокирует запись; task автоматически не создаётся.

## Полная актуализация

`$docu-docu refresh` сопоставляет всю canonical source documentation с кодом,
тестами, интерфейсами, schemas, configuration, CI, решениями и подтверждёнными
требованиями. Workflow обновляет только evidence-backed утверждения, затем
проходит semantic review и project-wide structural check.

## Актуализация текущего diff

`$docu-docu refresh diff` начинает со staged, unstaged и untracked файлов
относительно `HEAD`, после чего добавляет документы, затронутые через links,
stable IDs, task relationships и изменённое публичное поведение. Если Git или
`HEAD` недоступен, workflow не расширяет область молча и предлагает полный
refresh.

## Перевод

`$docu-docu translate <locale>` требует ровно один режим:

```text
$docu-docu translate <locale> --task TASK-ID
$docu-docu translate <locale> --base REF
$docu-docu translate <locale> --all-stale
```

Workflow обновляет configured translation root как полное read-only зеркало.
Он обрабатывает одну source/target-пару за раз, сохраняет IDs, команды, пути и
code blocks, сравнивает нормализованную семантику и обновляет manifest только
после strict-проверки выбранной локали.

## Общие границы

- canonical documentation root остаётся единственным источником обычного
  implementation, task и semantic-review контекста;
- init, refresh и translate никогда не маскируются под команды `docu-docu`;
- generated portals не редактируются как источник истины;
- неизвестные status, owner, date, relationship или procedure не изобретаются;
- translation roots читаются только для явно выбранной locale-операции и не
  используются task workflow или editor-записью.

После изменяющего workflow агент сообщает затронутые источники, semantic-review
verdict, ошибки и предупреждения structural check и результат пересборки
локального или CI portal artifact, если она требуется политикой проекта.
