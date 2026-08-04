# Справочник конфигурации

Docgent настраивается аргументами CLI; отдельный конфигурационный файл не
требуется.

## Значения по умолчанию

| Параметр | Значение |
|---|---|
| input | `./docs` |
| output | соседний каталог `project-docs` |
| repository root | родитель input |
| repository ref | `main` |
| stale days | `90` |
| format | `text` |
| task timeout | `10m` |

## Repository root

`--repository-root` определяет:

- границу разрешённых ссылок из документации в код;
- корень выполнения команд `task check`;
- базу проверки scope-путей work item.

Путь должен указывать на фактический корень репозитория. Для текущего проекта:

```bash
go run ./cmd/docgent check ./docs --repository-root . --strict
```

## Repository URL и ref

Если заданы `--repository-url` и точный `--repository-ref`, ссылки на файлы вне
`docs/`, но внутри repository root, преобразуются в HTTP(S) ссылки вида GitHub
`blob` или `tree`.

Для воспроизводимого портала рекомендуется commit SHA вместо плавающей ветки.

## Excludes

`--exclude` принимает список через запятую и может повторяться. По умолчанию
исключаются VCS-каталоги, `node_modules`, `vendor`, `dist`, `build` и coverage.
Скрытые файлы и символические ссылки не сканируются.

## Stale threshold

Дата документа берётся из `Последнее обновление`, затем из `Дата`, затем из
mtime файла. `--stale-days 0` отключает warning об устаревании и удобен для
воспроизводимых локальных проверок.

## Strict mode

Без `--strict` ненулевой exit code дают errors. В strict mode любой warning
также завершает команду с кодом `1`.

## Безопасная очистка

`--clean` разрешён только для отдельного output directory. Нельзя очистить:

- системный корень;
- input documentation;
- каталог-предок input;
- прямой output-симлинк.

Перед удалением сравниваются раскрытые пути.

## Task report и timeout

`--report <file.json>` атомарно сохраняет `TaskCheckReport` вне исходного
каталога документации. `--timeout` задаёт лимит каждой уникальной команды, а не
всего task check.
