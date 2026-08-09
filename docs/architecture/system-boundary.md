# Системная граница Toudocu

- Тип документа: Architecture
- Архитектурный вопрос: Где проходит системная граница Toudocu и кто с ней взаимодействует?

Toudocu ограничен одним локальным процессом, который читает документацию и
репозиторий, строит проверенную модель и выдаёт diagnostics либо производные
представления. Встраивающий Go-код вызывает тот же фасад модели и операций без
отдельного процесса. В `serve` процесс принимает ограниченные editor/changes
запросы, отдаёт offline OpenAPI UI и атомарно сохраняет выбранный
workspace-файл. Локальный review state canonical `serve` хранит отдельно от
repository в platform user-state; агент получает только явно созданные
feedback snapshots через CLI. Canonical `serve` также может один раз получить метаданные
latest stable release из фиксированного GitHub API; это единственный сетевой
выход работающего портала и он отключается флагом. Пользователь, библиотечный
потребитель, агент, CI и браузер остаются взаимодействующими сторонами за этой
границей. Release installer также остаётся снаружи: это отдельный bootstrap,
который использует сеть только до запуска Go runtime. Внутри runtime команда
`skill` читает embedded package и ограниченно изменяет выбранный project/user
target; она не загружает и не исполняет содержимое skill.

## Область

Ответ описывает границу одного Go runtime, доступного через CLI или публичный
пакет, и его внешние взаимодействия. Команды и форматы определены в
[CLI-контракте](../contracts/cli.md), Go-фасад кратко описан в
[справочнике возможностей](../reference/features.md#публичный-go-api), а
причина dependency-free поставки — в
[ADR-001](../decisions/001-dependency-free.md).

## Взаимодействующие стороны

- разработчик или агент выбирает вход, repository root и операцию;
- библиотечный потребитель вызывает экспортируемый фасад `api.go` и получает
  типизированную модель или отчёт;
- CI использует exit code и `ProjectReport` schema v1;
- файловая система предоставляет Markdown, локальные assets и разрешённые
  repository targets;
- браузер читает backend-independent портал на HTTP(S) static hosting; через canonical `serve` он
  также читает revision, editor/changes API и OpenAPI UI и явно сохраняет
  разрешённый исходник; status версии он получает только same-origin;
- GitHub Releases API предоставляет недоверенные метаданные latest stable
  release только canonical serve runtime;
- shell и дочерние процессы доступны только явному `task verify --run`.
- filesystem host AI-skill получает изменения только через явные
  `skill install`, `update` или `uninstall`; `status` остаётся read-only.
- установленный AI-skill читает oldest pending review snapshot и записывает
  полный structured response через CLI; Toudocu не запускает агента и не
  вызывает LLM.

## Что остаётся снаружи

Toudocu не хранит серверное состояние в repository, не обращается к базе
данных и не интерпретирует пользовательский запрос. Единственное длительное
serve-состояние — локальные review sessions и content-addressed snapshots в
platform user-state. Граница между детерминированным CLI и
смысловой работой исполнителя зафиксирована в
[ADR-002](../decisions/ADR-002.md).
Загрузка release assets и запись бинарника в user install dir принадлежат
отдельному installer workflow, описанному в
[руководстве по установке](../guides/installation.md).
Offline-размещение embedded AI-skill является отдельной явной командой
runtime и описано в [руководстве skill lifecycle](../guides/skill-installation.md).
