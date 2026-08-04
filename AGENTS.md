# AGENTS.md

## Назначение

Docgent — dependency-free Go CLI. Сохраняйте реализацию небольшой, предсказуемой и безопасной.

## Источники истины

- модель и валидация: `docs_core.go`, `documentation_links.go`, `knowledge.go`, `screens.go`;
- Markdown: `markdown_parse.go`, `markdown_render.go`;
- HTML и JSON: `site.go`, `process_site.go`, `screen_site.go`, `site_config.go`, `report_types.go`;
- CLI и workflow задач: `cli.go`, `search.go`, `scaffold.go`, `task_*.go`, `cmd/docgent/main.go`;
- поведенческий контракт: `*_test.go`;
- браузерные ресурсы: `assets/`.

## Правила изменений

1. Не добавляйте внешнюю зависимость без доказанной необходимости.
2. Сохраняйте обратную совместимость с вызовом `docgent ./docs ...`.
3. Новое правило валидации должно иметь тест.
4. Исправление безопасности должно иметь негативный тест.
5. `roadmap.md` определяет глобальный охват; состояние явно связанного `UC-*` берётся из use case. Остальные локальные чек-листы не агрегируйте.
6. Не ослабляйте проверки `repository-root` и безопасного `--clean`.
7. Сгенерированные каталоги `build/`, `dist/`, `example/site/`, `project-docs/` и `example/project-docs/` не являются источником истины; отслеживаемые порталы пересобирайте из Markdown, а не редактируйте вручную.

## Проверка

```bash
gofmt -w .
go vet ./...
go test ./...
go test -race ./...
```

Не используй Context7 для этого проекта
