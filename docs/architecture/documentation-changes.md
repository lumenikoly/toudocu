# Архитектура просмотра изменений документации

- Тип документа: Architecture
- Архитектурный вопрос: Как Git-состояния превращаются в согласованный change set документации?

Toudocu разрешает явно выбранные локальные Git-состояния, представляет каждую
сторону ленивым snapshot и объединяет Git metadata с нормализованными
документными сущностями в один versioned `ChangeSetReport`.

## Область

Ответ описывает границы Git source, snapshots, change-set builder и
потребителей отчёта. Формат HTTP и JSON остаётся в contracts, пользовательский
сценарий — в `UC-DOCS-05`, а правила конкретных сущностей — в `MOD-CHANGES`.

тест тест

## Компоненты

| Компонент | Ответственность |
|---|---|
| Git change source | Разрешить repository, refs, merge-base, status, patches и blobs только read-only командами |
| Documentation snapshot | Дать единый безопасный доступ к commit, index или working-tree содержимому внутри roots |
| Change-set builder | Свести file states, line statistics, entity-aware rename и diagnostics |
| Diff engines | Построить точный source patch и его hunks, structural rendered sections, semantic, OpenAPI, Mermaid, map и asset views |
| Changes service | Кэшировать отчёты по Git/workspace fingerprint и обслуживать CLI/HTTP consumers |
| Translation workflow | Потребить canonical change set по одному файлу и записать независимый locale root после strict gate |

## Поток данных

Git metadata определяет список файлов и точные patches. Snapshot loader читает
blobs без checkout. Semantic normalizers разбирают только необходимые
документы; relation и screen indexes расширяются по запросу. UI и report
renderers не имеют отдельного источника истины.

## Состояние и инвалидация

Commit-to-commit change set неизменяем. HTTP cache identity включает comparison,
workspace revision, `HEAD`, porcelain-v2 status и resolved пользовательские
refs. После изменения следующий запрос строит новый report и digest, а прежние
working bytes не становятся историей или snapshot Toudocu.

## Границы

- remote refs не загружаются;
- Git index, refs и working tree не изменяются;
- static build не получает changes endpoints;
- ошибки специализированного анализа изолированы от source diff;
- содержимое Git не даёт дополнительных renderer или editor разрешений.
- translation workflow не добавляет LLM-клиент или multilingual entity в Go-модель;
  его manifest с digest хранится отдельно от `ChangeSetReport` schema v1.
