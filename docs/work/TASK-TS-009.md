<!-- toudocu
id: TASK-TS-009
status: done
taskType: maintenance
module: MOD-SITE
parentTask: TASK-TS-001
dependsOn: TASK-TS-008
standards: STD-DOCS-001
updated: 2026-09-19
-->

# TASK-TS-009: Реализовать статическую сборку готовым React renderer

<!-- toudocu:section result -->

## Результат

Собранный TypeScript CLI создаёт переносимый статический портал без frontend toolchain у
пользователя.

Это требуемый результат этапа; статус и отмеченные критерии показывают фактическую готовность.
Основание — этап и пункты 7; 31–37 исходного ТЗ, преобразованного в
[дерево миграции](TASK-TS-001.md).

<!-- toudocu:section use-case-omission-reason -->

## Почему нет отдельного сценария

Миграция реализации сохраняет существующие пользовательские сценарии и публичные CLI/JSON-контракты.
Новый сценарий ради смены языка не вводится.

<!-- toudocu:section scope -->

## Область изменения

Исходные точки переноса: `internal/`, `web/`, `scripts/`, `skills/` и `docs/`. Новые пакеты
создаются в пределах репозитория согласно результату этапа.

Предсобранные client assets и renderer; snapshots, route manifest, report/search/page data; staging
и commit output.

<!-- toudocu:section out-of-scope -->

## Не входит в задачу

Изменение семантики CLI, документационного формата и модели задач, MCP, база данных, облачный
backend, Next.js, Astro и автоматический запуск агента ядром. Другие этапы выполняются по
зависимостям родительской задачи.

<!-- toudocu:section acceptance-criteria -->

## Критерии приёмки

- [x] `AC-01` `toudocu-ts build` не вызывает npm/pnpm/vite/tsc/react-router build и работает без
      исходников frontend.
- [x] `AC-02` Сбой сборки сохраняет предыдущий output; --clean проходит прежние проверки путей.
- [x] `AC-03` Статический портал работает без запущенного Toudocu, Node.js и клиентского JavaScript
      под вложенным URL prefix; browser tests подтверждают ссылки и ресурсы при обычной раздаче по HTTP(S).
- [x] `AC-04` Отмена отрисовки или подготовки сборки удаляет незавершённый временный результат и
      сохраняет предыдущий опубликованный каталог.

<!-- toudocu:section plan -->

## План

1. Включить в поставку готовый React renderer, браузерные ресурсы, реестр маршрутов и данные страниц
   и поиска.
2. Реализовать сборку во временный каталог с последующей фиксацией результата и защитой путей для
   --clean.
3. Проверить чтение без JavaScript и ссылки во вложенном URL; при ошибке сохранить предыдущий
   результат сборки.
4. Проверить отмену отрисовки и обновить руководство по сборке и установке.

<!-- toudocu:section verification -->

## Проверка

- `AC-01` -> `pnpm --filter @toudocu/web-app test:browser`
- `AC-02` -> `pnpm exec vitest run packages/platform-node/src/static-build.test.ts`
- `AC-03` -> `pnpm test:browser`
- `AC-04` -> `pnpm exec vitest run packages/platform-node/src/static-build.test.ts`
- `ALL` -> `pnpm check` (базовые проверки) и `pnpm test:browser`
- `DOCS` -> `node apps/cli/dist/main.js check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` -> `pnpm check`

Проверка запускает реальный `toudocu-ts build` с предсобранным renderer и ресурсами. Браузерные
сценарии открывают production output во вложенном URL-пути с JavaScript и без него. Отдельные тесты
прерывают отрисовку и проверяют сохранность опубликованного каталога и удаление staging-каталога.
Окончательная упаковка этих готовых артефактов в npm и release-комплекты входит в `TASK-TS-013`.

<!-- toudocu:section documentation-impact -->

## Влияние на документацию

Обновить описание соответствующей границы в модулях и руководствах вместе с работающей реализацией.
Сохранять различие между действующим Go runtime и целевым TypeScript runtime; не объявлять перенос
завершённым до выполнения критериев. Текущий план и общие ограничения находятся в
[родительской задаче](TASK-TS-001.md).
