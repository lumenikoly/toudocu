# Проверка изменений Toudocu

Этот документ описывает принятый локальный и CI-цикл для кода и документации
самого проекта. Команды запускаются разработчиком в обычной работе; чтение
этого руководства ничего не запускает.

## Быстрый цикл

```bash
gofmt -w .
golangci-lint run ./...
go test ./...
go run ./cmd/toudocu check ./docs --strict --stale-days 0
```

Для воспроизводимой локальной проверки используйте закреплённый готовый
бинарник golangci-lint:

```bash
curl -sSfL https://golangci-lint.run/install.sh | \
  sh -s -- -b "$(go env GOPATH)/bin" v2.13.1
```

Команда `make lint` запускает настроенный стандартный набор линтеров. Отдельный
`go vet` локально не нужен: тот же анализ выполняет `govet` внутри
golangci-lint. Инструмент не добавляется в `go.mod` и не входит в сборку
Toudocu.

## Полный цикл

```bash
golangci-lint run ./...
go test -count=1 ./...
go test -count=1 -race ./...
cd web
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
cd ..
go run ./cmd/toudocu build ./docs \
  --output ./build/project-docs \
  --repository-root . \
  --clean \
  --strict \
  --stale-days 0
```

Проверка Windows-специфичного управления процессами из Unix:

```bash
GOOS=windows GOARCH=amd64 go test -c -o /tmp/toudocu-windows.test .
GOOS=windows GOARCH=amd64 go build -o /tmp/toudocu-windows.exe ./cmd/toudocu
```

## Правила

- Новое правило модели получает поведенческий тест.
- Исправление безопасности получает негативный тест.
- JSON CLI декодируется в публичный тип отчёта, а не сравнивается как случайная
  строка.
- Превышение времени проверяется и подставным runner, и реальным дочерним
  процессом.
- Обычные `check` и `build` никогда не исполняют команды рабочих задач.
- Временные каталоги создаются через `t.TempDir` или безопасный каталог `/tmp`.
- Статический портал проверяется через HTTP, в том числе по вложенному URL;
  `file://` не является тестовым контрактом.
- CI заново собирает `internal/site/assets/generated/` и отклоняет расхождение.

## Документационная задача

Сначала получите контекст и план без исполнения:

```bash
go run ./cmd/toudocu task context TASK-DOCS-001 ./docs --format json
go run ./cmd/toudocu task verify TASK-DOCS-001 ./docs --dry-run --format json
```

`task verify --run` выполняет команды из задачи с правами текущего пользователя.
Его запускают только для доверенной задачи и после отдельного явного разрешения.

## Когда изменение готово

1. Форматирование больше не меняет файлы.
2. Golangci-lint, обычные и race-тесты проходят.
3. `toudocu check ./docs --strict` не возвращает ошибок и предупреждений.
4. Минимальный проект с `index.md` и `architecture/overview.md` остаётся
   допустимым.
5. Реальное поведение и публичные контракты отражены в документации.
