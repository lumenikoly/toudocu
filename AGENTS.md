# AGENTS.md

## Назначение

Docgent — dependency-free Go CLI. Сохраняйте реализацию небольшой, предсказуемой и безопасной.

## Навигация

- правила Go-кода и обязательный цикл проверки:
  [`STD-GO-001`](docs/quality/STD-GO-001.md);
- правила исходной документации, generated output и semantic review:
  [`STD-DOCS-001`](docs/quality/STD-DOCS-001.md);
- эксплуатационные процедуры: `docs/runbooks/`, только если раздел существует
  и содержит реальный `RB-*`;
- неизвестный верхнеуровневый раздел с Markdown: собственный `index.md` с
  `Тип: Custom`, владельцем и описанием;
- архитектура и источники истины:
  [`docs/architecture/overview.md`](docs/architecture/overview.md);
- workflow work items: [`docs/guides/work-items.md`](docs/guides/work-items.md).

Перед изменением просмотрите явно связанные стандарты и runbook, затем
проверьте `Область` остальных стандартов. CLI намеренно не угадывает
применимость по glob.

Не используй Context7 для этого проекта
