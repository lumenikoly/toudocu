# Проверка изменений Toudocu

Репозиторий использует Node.js 24 и pnpm 11.0.0.

## Полный цикл

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:browser
pnpm build
```

`pnpm check` последовательно проверяет форматирование, ESLint, строгий
TypeScript, unit/integration tests, compatibility corpus и каноническую
документацию. Браузерные сценарии Playwright запускаются отдельно, потому что
им нужен установленный Chromium.

## Узкие проверки

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm test:compat
pnpm --filter @toudocu/web-app test:browser
node apps/cli/dist/main.js check ./docs --repository-root . --strict --stale-days 0
```

Compatibility corpus в `fixtures/` хранит зафиксированные CLI/JSON и Markdown
случаи, полученные до удаления Go-реализации. Он остаётся обычной регрессией и
не требует старого runtime.

Release workflow дополнительно выполняет реальные filesystem, Git, process и
PTY tests на Linux x64, macOS arm64 и Windows x64, собирает три нативных артефакта,
устанавливает созданный npm tarball в чистый каталог и запускает smoke test.
При упаковке восстанавливаются права исполнения macOS `node-pty/spawn-helper`,
которые могут теряться при скачивании CI-артефактов. В Windows npm запускается
через `npm-cli.js` установленного Node.js; версия установленного Toudocu
проверяется через его JS-entrypoint, без прямого запуска `.cmd`-лаунчеров.
PTY smoke проверяет вывод выполненной команды, затем явно закрывает терминал:
естественный выход shell в `node-pty` 1.1.0 оставляет активный ConPTY worker.
Echo введённой команды не считается успешным выполнением. Для установки
выделено не более 10 минут, для проверки версии — 30 секунд, для native smoke —
60 секунд, включая ожидание вывода PTY не более 30 секунд. Этапы выводятся в лог;
общий предел smoke job — 20 минут. Установка отключает сетевой аудит npm и
сообщения funding, но не install scripts.
Регрессионные тесты упаковки и запуска входят в `pnpm check`.

После успешных smoke tests workflow публикует архивы только в GitHub Release.
Npm tarball проверяется локальной установкой и не публикуется в npm registry;
для выпуска не нужен npm-токен.

`task verify --run` запускается только по явному решению пользователя; обычные
проверки документации команды из work item не исполняют.
