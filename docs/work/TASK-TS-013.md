<!-- toudocu
id: TASK-TS-013
status: done
taskType: maintenance
module: MOD-CLI
parentTask: TASK-TS-001
dependsOn: TASK-TS-012
standards: STD-TS-001, STD-DOCS-001
updated: 2026-09-20
-->

# TASK-TS-013: Подготовить кроссплатформенную поставку и проверки установки

<!-- toudocu:section result -->
## Результат

Пользователь устанавливает готовый Toudocu через npm либо release installer без компиляции native dependencies.

Это требуемый результат этапа; статус и отмеченные критерии показывают фактическую готовность. Основание — этап и пункты 11; 53; 58–63; 69 исходного ТЗ, преобразованного в [дерево миграции](TASK-TS-001.md).

<!-- toudocu:section use-case-omission-reason -->
## Почему нет отдельного сценария

Миграция реализации сохраняет существующие пользовательские сценарии и публичные CLI/JSON-контракты. Новый сценарий ради смены языка не вводится.

<!-- toudocu:section scope -->
## Область изменения

Область поставки: `scripts/release.mjs`, `scripts/install.sh`, `scripts/install.ps1`,
`.github/workflows/release.yml`, `package.json` и `docs/guides/installation.md`.

npm global/project-local; archives/installers; Linux/macOS/Windows x64/arm64; native PTY, checksums и notices.

<!-- toudocu:section out-of-scope -->
## Не входит в задачу

Изменение семантики CLI, документационного формата и модели задач, MCP, база данных, облачный backend, Next.js, Astro и автоматический запуск агента ядром. Другие этапы выполняются по зависимостям родительской задачи.

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

- [x] `AC-01` Release содержит CLI/server/renderer/assets/skills/native PTY/licenses; notices формируются из lockfile и runtime dependencies.
- [x] `AC-02` Чистая установка на всех шести targets не требует Go, pnpm, TypeScript, Python, node-gyp или compiler toolchain.
- [x] `AC-03` Installer проверяет поддерживаемый Node без автоматической установки; реальные filesystem/Git/process/PTY тесты проходят на Linux/macOS/Windows.

<!-- toudocu:section plan -->
## План

1. Определить состав выпуска: CLI, сервер, renderer, браузерные ресурсы, навыки, готовые PTY-библиотеки, контрольные суммы и лицензии из lockfile.
2. Подготовить npm-пакет, архивы и установщики для Linux, macOS и Windows x64/arm64; проверить чистую установку без Go и компилятора native-зависимостей.
3. Проверить версию Node в установщике, загрузку PTY и работу файловой системы, Git и процессов.
4. Выполнить матрицу CI на шести платформах и обновить руководства по установке, выпуску и безопасности.

<!-- toudocu:section verification -->
## Проверка

- `AC-01` -> `pnpm test`
- `AC-02` -> `pnpm test`
- `AC-03` -> `pnpm check`
- `ALL` -> `pnpm check`
- `DOCS` -> `node apps/cli/dist/main.js check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` -> `pnpm check`

Полная release-проверка собирает готовый npm-архив и запускает его на каждой из шести платформ CI.

<!-- toudocu:section documentation-impact -->
## Влияние на документацию

Фактические npm, archive, installer и CI-контракты описаны в руководстве по установке.
