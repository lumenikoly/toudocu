# Проверка изменений Docgent

Руководство задаёт единый локальный и CI-цикл для кода и собственной
документации проекта.

## Быстрая проверка

```bash
gofmt -w .
go vet ./...
go test ./...
go run ./cmd/docgent check ./docs --strict --stale-days 0
```

## Полная проверка

```bash
go test -count=1 ./...
go test -count=1 -race ./...
go run ./cmd/docgent build ./docs \
  --output ./build/project-docs \
  --repository-root . \
  --clean \
  --strict \
  --stale-days 0
```

Для проверки Windows-специфичного process management из Unix:

```bash
GOOS=windows GOARCH=amd64 go test -c -o /tmp/docgent-windows.test .
GOOS=windows GOARCH=amd64 go build -o /tmp/docgent-windows.exe ./cmd/docgent
```

## Правила тестов

- новое правило валидации получает поведенческий тест;
- исправление безопасности получает негативный тест;
- CLI JSON проверяется декодированием в публичный report type;
- timeout проверяется не только fake runner, но и реальным дочерним процессом;
- тест не должен исполнять команды work item через обычные `check` или `build`;
- временные outputs создаются через `t.TempDir` или `/tmp`.

## Проверка документационной задачи

```bash
go run ./cmd/docgent task context TASK-DOCS-001 ./docs --format json
go run ./cmd/docgent task verify TASK-DOCS-001 ./docs --dry-run --format json
```

`task verify --run` запускает команды из документа и должен использоваться только для
доверенной задачи текущего репозитория.

## Критерий готовности

Изменение готово, когда:

1. форматирование не создаёт diff;
2. vet, обычные и race-тесты проходят;
3. `docgent check ./docs --strict` не содержит warnings и errors;
4. пример и минимальный проект только с `index.md` остаются валидными;
5. поведение и публичные контракты отражены в документации.
