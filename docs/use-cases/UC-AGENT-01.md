# UC-AGENT-01: Установить AI-skill Toudocu

- Идентификатор: UC-AGENT-01
- Статус: Готово
- Актор: Пользователь Toudocu
- Модуль: MOD-CLI
- Приоритет: Высокий
- Последнее обновление: 2026-08-06

Пользователь устанавливает встроенный offline-пакет skill `toudocu` в
project или user scope поддерживаемого AI host и может безопасно проверить,
обновить или удалить управляемую копию.

## Входные данные

- операция `install`, `status`, `update` или `uninstall`;
- AI host либо режим `auto`/`all`;
- scope `project` или `user`;
- необязательный repository root для project scope.

## Предусловия

- целевая граница доступна текущему пользователю;
- конфликтующая unmanaged или локально изменённая копия разрешается вручную;
- skill устанавливается из bundle текущего бинарника без сети и shell.

## Основной сценарий

1. Пользователь предварительно вызывает `toudocu skill status` или сразу
   выбирает изменяющую операцию.
2. CLI определяет host, scope, boundary и печатает абсолютный target.
3. Planner классифицирует существующую копию и для всех выбранных targets
   завершает read-only планирование.
4. `install` публикует отсутствующий bundle или обновляет неизменённую
   устаревшую managed-копию; `update` обновляет только существующую managed-копию.
5. `uninstall` удаляет только неизменённую managed-копию, а `status` ничего не
   записывает.
6. Команда сообщает итоговое состояние каждого target и возвращает `0`, если
   все операции успешны или являются допустимым no-op.

## Ошибочные сценарии

- неоднозначный `auto` в non-TTY возвращает `SKILL_AGENT_REQUIRED`;
- symlink/reparse point, выход за boundary или совпадение с root возвращает
  `SKILL_PATH_UNSAFE` без замены target;
- unmanaged, modified, повреждённая или более новая копия не перезаписывается;
- изменение target после планирования блокирует публикацию;
- ошибка публикации восстанавливает прежнюю копию, а невозможность rollback
  сохраняет backup и возвращает `SKILL_RESTORE_FAILED`.

## Постусловия

При успехе target отсутствует либо содержит точную managed-копию embedded
bundle и manifest schema v1. При конфликте пользовательские файлы сохранены.

## Бизнес-правила

- [BR-CLI-008](../modules/cli.md#br-cli-008-managed-skill-не-перезаписывает-пользовательские-изменения) — lifecycle не требует `--force` и не заменяет конфликтующие копии.
- [BR-CLI-009](../modules/cli.md#br-cli-009-skill-lifecycle-работает-offline) — package читается только из текущего binary.

## Реализация

- [CLI и workflow задач](../modules/cli.md)
- [Установка AI-skill](../guides/skill-installation.md)
- [CLI-контракт](../contracts/cli.md)

## Проверка

- bundle, registry, version и manifest unit tests;
- project/user lifecycle и multi-target CLI tests;
- негативные проверки boundary, symlink, hostile manifest и target swap;
- race tests и CGO-disabled cross-build поддерживаемых targets.
