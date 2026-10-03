# Установка и обновление Toudocu

Toudocu требует Node.js 24 или новее. Готовый выпуск уже содержит JavaScript,
браузерные ресурсы, skill и native PTY для выбранной платформы; Go, pnpm,
TypeScript, Python, `node-gyp` и compiler toolchain пользователю не нужны.

## npm

```bash
npm install --global toudocu
toudocu version
```

Project-local установка использует тот же пакет через `npm install toudocu` и
`npx toudocu`.

## Release installer

Linux и macOS:

```sh
curl -fsSL https://github.com/lumenikoly/toudocu/releases/latest/download/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://github.com/lumenikoly/toudocu/releases/latest/download/install.ps1 | iex
```

Установщик проверяет Node.js, выбирает `linux|darwin|win32` и `x64|arm64`,
скачивает архив и `checksums.txt`, сверяет SHA-256 и атомарно активирует выпуск.
Автоматическая установка Node.js не выполняется.

Явную версию без префикса `v` задаёт `TOUDOCU_VERSION`; каталог установки —
`TOUDOCU_INSTALL_DIR`. Ошибка загрузки, контрольной суммы или проверки версии
не повреждает предыдущую установку.

## Поддерживаемые платформы

| Система | Архитектура | Архив |
|---|---|---|
| Linux | x64 | `toudocu-linux-x64.tar.gz` |
| Linux | arm64 | `toudocu-linux-arm64.tar.gz` |
| macOS | x64 | `toudocu-darwin-x64.tar.gz` |
| macOS | arm64 | `toudocu-darwin-arm64.tar.gz` |
| Windows | x64 | `toudocu-win32-x64.tar.gz` |
| Windows | arm64 | `toudocu-win32-arm64.tar.gz` |

Архив и контрольная сумма приходят из одного GitHub Release, поэтому сумма
обнаруживает повреждение передачи, но не заменяет независимую подпись.

## Разработка из исходников

```bash
git clone https://github.com/lumenikoly/toudocu.git
cd toudocu
pnpm install --frozen-lockfile
pnpm build
node apps/cli/dist/main.js version
```

`pnpm build` и `make update-local` собирают Toudocu без установленного bb.
Интеграция bb собирается отдельно через
`pnpm --filter @toudocu/bb-plugin build`; только этой команде нужен CLI bb.
