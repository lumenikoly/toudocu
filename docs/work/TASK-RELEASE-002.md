# TASK-RELEASE-002: Добавить установку и обновление из GitHub Release

- Статус: Выполнено
- Тип: Maintenance
- Модуль: MOD-CLI
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Toudocu
- Последнее обновление: 2026-08-07

## Результат

Release bundle и workflow `0.0.1` готовы к публикации POSIX- и
PowerShell-bootstrap: пользователь одной командой устанавливает или обновляет
Toudocu, а bootstrap сам
выбирает поддерживаемый OS/architecture artifact и проверяет SHA-256
до замены файла.

## Изменение поведения

### Было

Пользователь вручную выбирает бинарник в GitHub Releases, проверяет
его и добавляет в `PATH`.

### Станет

POSIX- и PowerShell-команды скачивают подходящий artifact и
`checksums.txt`, проверяют целостность и без `sudo` атомарно
устанавливают его в `~/.local/bin/toudocu` или
`%LOCALAPPDATA%\Programs\toudocu\toudocu.exe`. Канонические команды:

```sh
curl -fsSL https://github.com/lumenikoly/toudocu/releases/latest/download/install.sh | sh
```

```powershell
irm https://github.com/lumenikoly/toudocu/releases/latest/download/install.ps1 | iex
```

Оба `install.*` входят в release assets версии `0.0.1`.

Если standard user dir ещё не в `PATH`, POSIX installer один раз
добавляет managed entry в `.zshrc` для zsh, `.bashrc` для bash, fish
`conf.d`, а для остальных POSIX shells — в `.profile`. PowerShell installer
один раз добавляет
стандартный каталог в user `PATH`. Текущий parent shell не
изменяется: installer печатает точную `source`/fish-команду, для
`.profile` просит login/re-login, а для Windows — открыть новый terminal.

## Область изменения

- новые installer-скрипты в каталоге scripts;
- `Makefile` и `.github/workflows/`;
- installer contract tests в `internal/app/`;
- `README.md`, `CHANGELOG.md` и `docs/`.

## Не входит в задачу

- публикация Git-тега или GitHub Release;
- фоновое самообновление или новая команда Go CLI;
- system-wide установка через `sudo` и package managers;
- другие новые release targets, кроме Windows ARM64;
- подпись или notarization релизных бинарников.

## Критерии приёмки

- [x] `AC-01` Installer однозначно выбирает шесть существующих
  Linux, macOS и Windows artifacts, а неподдерживаемую
  платформу отклоняет до загрузки.
- [x] `AC-02` По умолчанию выбирается latest stable release;
  `TOUDOCU_VERSION=X.Y.Z` закрепляет версию и разрешает downgrade,
  `TOUDOCU_INSTALL_DIR` выбирает нестандартный каталог, а
  `TOUDOCU_NO_MODIFY_PATH=1` запрещает изменение `PATH`.
- [x] `AC-03` Бинарник заменяется только после точной проверки
  release checksum и версии; download, checksum и filesystem failure
  не повреждают уже установленную версию, а совпадающий checksum
  даёт idempotent no-op.
- [x] `AC-04` Release bundle содержит оба installer-скрипта, а
  `checksums.txt` покрывает их вместе с бинарниками и notices.
- [x] `AC-05` README и каноническая документация описывают
  команды, матрицу, update/version override, `PATH`, проверку
  SHA-256, границу сети только для bootstrap и стандартные команды
  установки из stable GitHub Release.
- [x] `AC-06` Повторный запуск, upgrade, downgrade и добавление
  стандартного user install dir в shell/user `PATH` идемпотентны;
  нестандартный каталог не меняет profile и получает подсказку.

## План

1. Реализовать одинаковый installer contract для POSIX и PowerShell.
2. Включить скрипты в release bundle и checksum generation.
3. Добавить platform, integrity, replacement и release contract tests.
4. Обновить источные документы и release notes.
5. Пройти semantic gate, полную проверку и пересобрать портал.

## Проверка

- `AC-01` → `go test ./internal/app -run TestInstallerPlatformContract`
- `AC-02` → `go test ./internal/app -run TestInstallerSelectionAndPathContract`
- `AC-03` → `go test ./internal/app -run TestInstallerIntegrityAndReplacement`
- `AC-04` → `make release && cd dist && sha256sum -c checksums.txt && test "$(wc -l < checksums.txt)" -eq 12 && for file in toudocu-linux-amd64 toudocu-linux-arm64 toudocu-darwin-amd64 toudocu-darwin-arm64 toudocu-windows-amd64.exe toudocu-windows-arm64.exe install.sh install.ps1 LICENSE THIRD_PARTY_NOTICES.md CODEMIRROR-CHECKSUMS.txt SWAGGER-UI-CHECKSUMS.txt; do awk -v file="$file" '$2 == file { found=1 } END { exit !found }' checksums.txt || exit 1; done`
- `AC-05` → `go test ./internal/app -run TestInstallerDocumentationContract && go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `AC-06` → `go test ./internal/app -run TestInstallerRepeatUpgradeDowngradeAndPath`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

## Влияние на документацию

Добавляется guide установки; обновляются README, `CHANGELOG.md`,
текущее состояние, system/trust boundary и отслеживаемый портал.

## Обоснование отсутствия сценария

Задача меняет release engineering и bootstrap-поставку, не добавляя
команду или сценарий основного Go CLI.
