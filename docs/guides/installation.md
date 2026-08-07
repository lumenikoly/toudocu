# Установка и обновление Docu-docu

Это руководство помогает без прав администратора установить подходящий
бинарник из GitHub Release. Та же команда повторно проверяет и обновляет
установку.

## Установить или обновить latest release

Linux и macOS:

```sh
curl -fsSL https://github.com/lumenikoly/docu-docu/releases/latest/download/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://github.com/lumenikoly/docu-docu/releases/latest/download/install.ps1 | iex
```

Повторный запуск не заменяет бинарник, если его SHA-256 уже совпадает с
файлом из release. При новой версии installer заменяет прежний файл только после
успеха всех проверок.

## Поддерживаемые платформы

| Система | Архитектура | Release asset |
|---|---|---|
| Linux | AMD64 / x86-64 | `docu-docu-linux-amd64` |
| Linux | ARM64 / AArch64 | `docu-docu-linux-arm64` |
| macOS | Intel | `docu-docu-darwin-amd64` |
| macOS | Apple silicon | `docu-docu-darwin-arm64` |
| Windows | AMD64 / x86-64 | `docu-docu-windows-amd64.exe` |
| Windows | ARM64 | `docu-docu-windows-arm64.exe` |

На Windows ARM64 installer выбирает нативный ARM64-бинарник, в том числе при
запуске из x64-процесса под эмуляцией. Другие неперечисленные комбинации
завершаются ошибкой до загрузки.

## Выбрать версию

POSIX-shell получает environment после pipe:

```sh
curl -fsSL https://github.com/lumenikoly/docu-docu/releases/latest/download/install.sh \
  | DOCU_DOCU_VERSION=0.0.1 sh
```

PowerShell получает ту же переменную:

```powershell
$env:DOCU_DOCU_VERSION = "0.0.1"
irm https://github.com/lumenikoly/docu-docu/releases/latest/download/install.ps1 | iex
Remove-Item Env:DOCU_DOCU_VERSION
```

Допускается только формат `X.Y.Z` без префикса `v`. Явная версия
разрешает как закрепление, так и намеренный downgrade.

## Каталог и PATH

По умолчанию бинарник устанавливается в:

- `~/.local/bin/docu-docu` на Linux и macOS;
- `%LOCALAPPDATA%\Programs\docu-docu\docu-docu.exe` на Windows.

Если этого каталога нет в `PATH`, installer добавляет одну managed entry в
`.bashrc`, `.zshrc`, fish `conf.d`, `.profile` или user `PATH` Windows. Он не
может изменить parent shell, поэтому печатает точную команду
`source`, требование login/re-login или просит открыть новый Windows terminal.

Другой каталог не меняет shell profile:

```sh
curl -fsSL https://github.com/lumenikoly/docu-docu/releases/latest/download/install.sh \
  | DOCU_DOCU_INSTALL_DIR="$HOME/bin" sh
```

`DOCU_DOCU_NO_MODIFY_PATH=1` отключает изменение профиля или Windows user
`PATH`. В обоих случаях installer печатает каталог, который нужно
добавить в `PATH` вручную.

## Граница доверия

Bootstrap по HTTPS скачивает бинарник и `checksums.txt` из одного GitHub
Release. Он требует ровно одну SHA-256 запись для выбранного
artifact, сравнивает digest и проверяет `docu-docu version` до замены.
Ошибка загрузки, checksum, версии или staging до replacement не изменяет
старый бинарник. Ошибка последующей записи `PATH` не откатывает уже
проверенный binary: installer печатает warning и ручную `PATH`-подсказку.

Checksum защищает от случайного повреждения, но не является независимой
криптографической подписью: binary и checksum имеют один trust root релиза.
Команды `curl | sh` и `irm | iex` также исполняют удалённый
installer. Перед запуском его можно скачать отдельно и просмотреть.

Сеть и системные download/hash инструменты нужны только installer. После
установки Docu-docu остаётся одним автономным Go-бинарником без
runtime-зависимостей и внешних outbound-загрузок во время обычной работы.
