# TASK-RELEASE-002: Добавить установку и обновление из GitHub Release

- Статус: Выполнено
- Тип: Maintenance
- Модуль: MOD-CLI
- Стандарты: STD-GO-001, STD-DOCS-001
- Владелец: Команда Toudocu
- Последнее обновление: 2026-08-11

## Результат

Релизный комплект `0.0.1` включает установочные скрипты POSIX и PowerShell.
Скрипт выбирает файл для операционной системы и архитектуры, проверяет SHA-256
и только затем заменяет программу.

## Изменение поведения

### Было

Пользователь вручную выбирал бинарник в GitHub Releases, проверял его и
добавлял каталог в `PATH`.

### Станет

Одна из команд скачивает подходящий бинарник и `checksums.txt`, проверяет
целостность и без `sudo` атомарно устанавливает
Toudocu в `~/.local/bin/toudocu` или
`%LOCALAPPDATA%\Programs\toudocu\toudocu.exe`:

```sh
curl -fsSL https://github.com/lumenikoly/toudocu/releases/latest/download/install.sh | sh
```

```powershell
irm https://github.com/lumenikoly/toudocu/releases/latest/download/install.ps1 | iex
```

Оба `install.*` входят в файлы релиза `0.0.1`.

Если стандартного пользовательского каталога нет в `PATH`, POSIX-скрипт один
раз добавляет управляемую запись в `.zshrc`, `.bashrc`, fish `conf.d` или
`.profile`, в зависимости от оболочки. PowerShell один раз добавляет каталог в
пользовательский `PATH`. Уже запущенная оболочка не меняется: скрипт печатает
точную команду перезагрузки профиля или просит открыть новый терминал.

## Область изменения

- установочные скрипты в `scripts/`;
- `Makefile` и `.github/workflows/`;
- контрактные тесты установщиков в `internal/app/`;
- README, журнал изменений и каноническая документация.

## Не входит в задачу

- публикация Git-тега или GitHub Release;
- фоновое самообновление и новая команда Go CLI;
- системная установка через `sudo` и менеджеры пакетов;
- новые целевые платформы, кроме добавленного Windows ARM64;
- подпись и notarization бинарников.

## Критерии приёмки

- [x] `AC-01` Установщик однозначно выбирает один из шести файлов Linux, macOS
  и Windows, а неподдерживаемую платформу отклоняет до скачивания.
- [x] `AC-02` По умолчанию выбирается последний стабильный релиз.
  `TOUDOCU_VERSION=X.Y.Z` закрепляет версию и разрешает откат,
  `TOUDOCU_INSTALL_DIR` задаёт каталог, а `TOUDOCU_NO_MODIFY_PATH=1` запрещает
  менять `PATH`.
- [x] `AC-03` Бинарник заменяется только после точной проверки контрольной
  суммы и версии. Ошибка сети, контрольной суммы или файловой системы не
  повреждает установленную версию; совпадающая сумма ничего не меняет.
- [x] `AC-04` Набор релиза содержит оба установщика, а `checksums.txt`
  охватывает их, бинарники, лицензии и уведомления.
- [x] `AC-05` README и документация описывают команды, платформы, обновление,
  выбор версии и каталога, `PATH`, SHA-256 и то, что сеть нужна только
  установщику.
- [x] `AC-06` Повторный запуск, обновление, откат и добавление стандартного
  каталога в `PATH` идемпотентны. Нестандартный каталог профиль не меняет и
  получает понятную подсказку.

## План

1. Реализовать одинаковые правила для POSIX и PowerShell.
2. Включить скрипты в набор релиза и расчёт контрольных сумм.
3. Добавить тесты выбора платформы, целостности, безопасной замены и состава
   релиза.
4. Обновить исходную документацию и примечания к выпуску.

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

Было добавлено руководство по установке; обновлены README, журнал изменений,
текущее состояние, системная граница, граница доверия и отслеживаемый портал.

## Обоснование отсутствия сценария

Задача меняет поставку релизных файлов и установщики, но не добавляет команду
или сценарий основного Go CLI.
