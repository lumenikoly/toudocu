# Границы доверия Toudocu

- Тип документа: Architecture
- Архитектурный вопрос: Где проходят границы доверия?

Markdown, ссылки, assets и Mermaid source считаются недоверенными данными;
repository root и выбранные output/report paths задают файловую границу; команды
work item считаются доверенным кодом только после отдельного явного разрешения
на запуск. До запуска CLI release installer отдельно доверяет GitHub Release
как единому удалённому источнику binary и checksum.

## Область

Ответ перечисляет архитектурные зоны доверия. Конкретные CLI-ошибки и правила
Markdown находятся в [CLI-контракте](../contracts/cli.md) и
[MOD-MARKDOWN](../modules/markdown.md).

## Недоверенное содержимое

Текст и метаданные экранируются при HTML-рендеринге. Активные локальные assets,
опасные протоколы и выход ссылок за repository root блокируются. Mermaid
работает в браузере с закреплённым bundle и строгой конфигурацией, не становясь
источником требований.

## Файловая граница

Входной каталог, repository root, output и report нормализуются до операций.
Символические ссылки не позволяют подменить границу очистки или записи, а
generated output никогда не становится источником документации.

Skill target дополнительно ограничен canonical project root или user home и не
может совпадать с boundary либо выходить за неё. Symlink/reparse components,
symlink внутри managed package и non-regular файлы блокируют lifecycle. Manifest
schema v1 и SHA-256 таблица отличают неизменённую managed-копию от unmanaged и
локально изменённой; конфликт никогда не заменяется автоматически.

В `serve` editor workspace дополнительно принимает только canonical relative
POSIX path к обычному `.md`, `.yaml`, `.yml` или `.json` внутри docs root.
Hidden/excluded/output, traversal, encoded остатки и любой обнаруженный
symlink/reparse component блокируются. SHA-256 CAS и atomic replace защищают от
случайной потери параллельного изменения. Намеренная privileged local race по
замене каталога находится вне threat model доверенной рабочей копии.

Review repository projection принимает только canonical repository-relative
POSIX path. Absolute, traversal, percent-encoded и `.git` paths, non-regular
files и любой symlink/reparse component отклоняются. Go ограничивает
комментируемый UTF-8 snapshot 2 MiB, не сохраняет NUL/binary input и размещает
state в platform user-state каталоге с POSIX modes `0700`/`0600`. Corrupted
state не перезаписывается автоматически; concurrent server/CLI writers
согласуются lock и CAS.

## HTTP-граница serve

Editor write требует JSON content type, точный action header и same-origin
browser context, не выдаёт CORS и ограничивает body/content. Эти guards защищают
от cross-origin browser страницы, но не аутентифицируют прямой HTTP-клиент.
Поэтому явный non-loopback listener включает доступных клиентов локальной сети
в trust boundary; CLI сохраняет предупреждение об отсутствии TLS и авторизации.
Review mutations используют те же три HTTP guards и expected revision/digest.
Они доступны только canonical `serve` и только при `target=working-tree`;
commit/index comparisons остаются read-only.
Locale routes ограничены `/_toudocu/locales/<locale>/` и отдают только
сгенерированные read-only snapshots. Они не перенаправляют к editor, changes,
workspace, API docs или canonical API; target URLs вычисляет сервер из разрешённых
profiles и mounts.

Canonical API docs загружает только embedded Swagger UI и same-origin
проверенные specs. CSP запрещает внешние script/style/connect targets, а
browser Try it out ограничен `GET`/`HEAD`; UI не ослабляет guards самих APIs.

Проверка версии существует только в canonical `serve` и обращается к
фиксированному HTTPS GitHub Releases API без credentials. Сервер ограничивает
ожидание и размер ответа, запрещает redirects, принимает только stable tag
`X.Y.Z`, сам строит официальный release URL и кеширует status. Browser видит только same-origin
endpoint; remote body не становится HTML, executable code или URL общего
назначения. `--no-update-check` выключает capability и делает endpoint
недоступным, а static и translation portals не создают эту границу.

## Граница исполнения

Documentation Changes запускает установленный `git` напрямую argument array с
`--no-ext-diff`, `--no-textconv`, `--no-color` и NUL-separated path output.
Hooks, shell, fetch, checkout и изменение index не выполняются. Revision
валидируется, blob читается из object database, HTTP path должен совпасть с
элементом change set внутри documentation roots. Старый Markdown проходит ту
же sanitization policy и не получает editor или network privileges.

Repository Review использует тот же execution boundary для всего repository:
tracked и untracked non-ignored inventory, local refs/blobs и diff без hooks,
textconv, external diff, shell, fetch или Git writes. Feedback CLI читает и
атомарно обновляет только local review state; он не запускает агента, LLM или
команды repository.

Обычные `check`, `build`, `serve`, editor API, `search`, readiness и context не запускают
команды из Markdown. Исполнение появляется только в `task verify --run` после
task-local validation gate; правила разрешения описаны в
[MOD-CLI](../modules/cli.md).

## Граница release bootstrap

POSIX- и PowerShell-installers выполняются до Go CLI с правами текущего
пользователя. Они загружают точно выбранный binary и `checksums.txt` из
одного HTTPS GitHub Release, требуют ровно одну matching SHA-256 запись и
проверяют version до замены. Binary и checksum имеют один trust root:
эта проверка обнаруживает повреждение, но не заменяет независимую подпись.

Установка не получает `sudo`: по умолчанию запись ограничена user
install dir и одной idempotent `PATH` entry. Явный `TOUDOCU_INSTALL_DIR`
может указать любой доступный для записи каталог и не меняет profile. Загрузка,
проверка и staging завершаются до замены; ошибка не повреждает уже
установленный binary. Прямые `curl | sh` и `irm | iex` осознанно добавляют
удалённый installer в trust boundary пользователя.

## Граница embedded skill

Skill package компилируется в binary и после установки не требует сети.
Bundle validator ограничивает обычные относительные пути, размер отдельного
файла и общий размер package; `SKILL.md` обязан объявлять ожидаемое имя.
Lifecycle не вызывает shell и не исполняет embedded scripts.

Запись готовится в sibling stage, manifest создаётся последним. Для update и
uninstall target сначала атомарно перемещается в уникальный backup и повторно
сверяется со snapshot. Ошибка или параллельная подмена приводит к rollback;
если восстановление невозможно, backup сохраняется и его точный путь выводится
пользователю.
