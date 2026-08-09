# Установка AI-skill Toudocu

Руководство помогает установить встроенный в binary skill `toudocu`,
проверить его состояние, безопасно обновить или удалить managed-копию. Операции
не используют сеть, marketplace, shell или внешние package managers.

## Быстрый старт

Из корня проекта выполните:

```bash
toudocu skill install
```

`--agent auto` используется по умолчанию. Если обнаружен ровно один host, CLI
выбирает его. При отсутствии или нескольких признаках интерактивный terminal
предлагает выбор; non-TTY требует явный `--agent`.

```bash
toudocu skill install --agent codex
toudocu skill status --agent all
toudocu skill update --agent claude-code --scope user
toudocu skill uninstall --agent copilot
```

## Targets

| Host | Project scope | User scope |
|---|---|---|
| Codex | `.agents/skills/toudocu` | `~/.agents/skills/toudocu` |
| Claude Code | `.claude/skills/toudocu` | `~/.claude/skills/toudocu` |
| Copilot | `.github/skills/toudocu` | `~/.copilot/skills/toudocu` |

Project root выбирается в порядке: явный `--repository-root`, ближайший
родитель с `.git`, текущий каталог. Для user scope используется home текущего
пользователя; `--repository-root` там отклоняется.

## Операции

- `install` создаёт отсутствующую копию или обновляет неизменённую устаревшую
  managed-копию;
- `status` только показывает target и состояние;
- `update` требует существующую неизменённую managed-копию;
- `uninstall` удаляет только неизменённую managed-копию.

`--agent all` планирует Codex, Claude Code и Copilot заранее, дедуплицирует
одинаковые абсолютные targets, а затем обрабатывает их независимо. Ошибка одного
target не останавливает остальные. Успех и допустимый no-op возвращают `0`;
конфликт или частичная ошибка — `1`.

## Состояния и ручное разрешение конфликтов

`status` различает `not-installed`, `installed`, `outdated`,
`newer-than-bundle`, `modified`, `unmanaged`, `invalid-manifest` и
`unsafe-path`. Изменяющие команды никогда не заменяют unmanaged, modified,
повреждённую, более новую или unsafe копию.

CLI намеренно не предоставляет `--force`. Сначала сохраните нужные локальные
изменения или вручную переместите конфликтующий каталог, затем повторите
операцию. Repo-local symlink `.agents/skills/toudocu`, используемый при
разработке этого проекта, классифицируется как `unsafe-path` и остаётся
нетронутым.

## Managed manifest и атомарность

Установленная копия содержит `.toudocu-skill.json` schema v1 с версиями skill
и CLI, agent/scope, checksum bundle и SHA-256 каждого bundled-файла. Любой
дополнительный, удалённый или изменённый bundled-файл, изменение ожидаемых
permissions (точные POSIX bits; writable/read-only semantics на Windows) и
symlink/reparse point внутри package считаются локальным изменением. Сам
manifest проверяется как metadata schema v1; перестановка JSON-полей или
пробелов не меняет managed state.

Новый package сначала полностью записывается в sibling stage; manifest
создаётся последним. Update и uninstall атомарно перемещают прежний target в
уникальный backup и повторно сверяют snapshot. При ошибке публикации прежняя
копия возвращается; если rollback невозможен, CLI сохраняет backup и печатает
его путь с кодом `SKILL_RESTORE_FAILED`.

## После установки

Команды `toudocu skill ...` управляют lifecycle установленной копии. Для
работы со своим проектом вызовите skill уже в prompt AI-агенту:

```text
$toudocu проверь документацию проекта и объясни найденные проблемы
$toudocu подготовь read-only контекст TASK-AREA-001
$toudocu обнови указанный guide по текущему CLI-контракту
```

Специальные изменяющие workflow также вызываются через prompt и только явно:

```text
$toudocu init
$toudocu refresh
$toudocu refresh diff
$toudocu translate en --all-stale
$toudocu translate diff
```

Обычные сценарии, различие между shell-командами и agent-вызовами, а также
границы разрешений описаны в
[руководстве по использованию AI-skill](agent-workflows.md).
