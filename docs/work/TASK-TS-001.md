<!-- toudocu
id: TASK-TS-001
status: done
taskType: maintenance
module: MOD-CLI
standards: STD-TS-001, STD-DOCS-001
updated: 2026-09-20
-->

# TASK-TS-001: Перевести Toudocu на TypeScript и единое React-приложение

<!-- toudocu:section result -->
## Результат

Toudocu работает как единое Git-native пространство знаний о проекте: TypeScript
владеет компилятором и прикладными операциями, React — представлением. Markdown
в Git остаётся источником истины, CLI и JSON — стабильным интерфейсом автоматизации.
Статическая публикация и локальный workspace используют одни компоненты страниц.

Задача преобразует исходное ТЗ `.tmp/new-arch.md` в последовательность проверяемых
этапов 0–12. Дерево и прогресс вычисляются из дочерних задач командой
`node apps/cli/dist/main.js task tree TASK-TS-001 ./docs --repository-root .`.

<!-- toudocu:section use-case-omission-reason -->
## Почему нет отдельного сценария

Архитектурная миграция сохраняет существующие сценарии; смена языка не создаёт
новую пользовательскую возможность. Установка Node становится явным требованием.

<!-- toudocu:section behavior-change -->
## Изменение поведения

<!-- toudocu:section before -->
### Было

Go реализует CLI, семантику, HTTP и генерацию HTML. React обслуживает отдельные
поверхности; собственный lifecycle переставляет HTML и монтирует острова.

<!-- toudocu:section after -->
### Стало

Node.js исполняет ESM TypeScript-сборку. Чистый compiler передаёт модель
прикладным сервисам; отдельные mapper создают CLI DTO и представление портала.
React Router управляет переходами, постоянные providers сохраняют агент и PTY.

<!-- toudocu:section scope -->
## Область изменения

Область миграции: `apps/`, `packages/`, `scripts/`, `skills/`, `.github/` и `docs/`.

Все production-слои CLI, compiler, Git/filesystem/process, static renderer,
локального сервера, workspace, skills и release pipeline. Дочерние задачи
покрывают этапы 0–12; общие ограничения пунктов 1–80 применимы ко всему дереву.

- Backend и core используют только TypeScript strict, noUncheckedIndexedAccess,
  exactOptionalPropertyTypes и ESM; неизвестные данные сужаются на границе.
- Core определяет смысл, не импортирует React, HTTP и реализации filesystem.
  React получает только contracts/presentation, не вычисляет готовность задач.
- Один источник runtime schemas, один route registry, общие ProcessRunner,
  PathPolicy и logger; операции учитывают AbortSignal и освобождают ресурсы.
- Сохраняются JSON schemaVersion, диагностика, exit codes, документационный
  контракт и CLI-доставка навыков. Публичный Go API удалён в финале;
  стабильный JavaScript SDK не обещается.
- Статический портал читабелен без JS, не требует Node на hosting, работает
  во вложенном URL. Пользовательский build использует готовый renderer,
  не запускает frontend compiler и фиксирует output после успешного staging.
- Serve по умолчанию слушает loopback; изменения проверяют revision. Watcher
  объединяет события, сервер хранит общую модель и закрывает ресурсы при остановке.
- Path traversal, symlinks, raw HTML, опасные URL, активные SVG/XML, Mermaid
  directives и OpenAPI external refs сохраняют проверки безопасности.
- Поставка покрывает Linux/macOS/Windows x64/arm64, готовые PTY artifacts,
  npm и release installers; native toolchain у пользователя не требуется.

Для первой новой поставки выбран Node >= 24 по заключительной рекомендации ТЗ;
поддержка Node 22 не обещается. Конкретные версии React Router и библиотек
выбираются по их фактическим требованиям, а не по предположению о версии из ТЗ.
Standalone executable остаётся возможным будущим способом поставки.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

Измерения производительности, времени выполнения и потребления памяти исключены
по решению пользователя. Приёмка проверяет работу функциональности и совместимость.

MCP, Next.js, Astro, MDX, облачный backend, база данных, перенос source of truth
из Markdown, редизайн продукта, новый task model, private HTTP API для skills,
автоматический запуск агента ядром и новый публичный JavaScript SDK.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Все этапы дерева выполнены; TypeScript/React заменили production Go и islands без потери существующих возможностей.
- [x] `AC-02` CLI/JSON, filesystem side effects, security, offline и browser regression tests подтверждают совместимость, включая static без JS и вложенный URL.
- [x] `AC-03` Готовые релизы проверены на шести targets, а документация описывает фактическую итоговую архитектуру и установку.

<!-- toudocu:section plan -->
## План

1. Сохранить baseline до изменения runtime и подготовить workspace независимо.
2. Перенести compiler, затем команды чтения и записи с differential checks.
3. Ввести presentation contracts, общие React pages, static build и serve SPA.
4. Перенести workspace и постоянные agent/terminal sessions.
5. Проверить поставку, закрыть все пробелы паритета и только затем удалить Go.

Регрессионный корпус сохраняет эталонное поведение после удаления Go-реализации.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` -> `pnpm check`
- `AC-02` -> `pnpm test && pnpm test:browser`
- `AC-03` -> `pnpm build && pnpm check`
- `ALL` -> `pnpm lint && pnpm typecheck && pnpm test && pnpm test:browser && pnpm build && pnpm check`
- `DOCS` -> `node apps/cli/dist/main.js check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` -> `pnpm check`

Сначала должны появиться реальные проверки каждого критерия; зелёная команда
с неполным набором тестов не подтверждает завершение. Проверки установки
требуют результатов матрицы CI на реальных Linux, macOS и Windows. При
удалении Go цели DOCS и QUALITY переключаются на новый CLI после паритета.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Обновляются README, CONTRIBUTING, architecture overview, модули model/markdown/site,
CLI contract, установка, локальная разработка, агентские workflows, skills,
release и security. Решение и последствия фиксирует
[ADR-012](../decisions/ADR-012.md). Переводные корни не читаются и не меняются
без отдельного запроса; каноническая документация ведётся на русском.
