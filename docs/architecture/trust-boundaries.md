# Границы доверия Docgent

- Тип документа: Architecture
- Архитектурный вопрос: Где проходят границы доверия?

Markdown, ссылки, assets и Mermaid source считаются недоверенными данными;
repository root и выбранные output/report paths задают файловую границу; команды
work item считаются доверенным кодом только после отдельного явного разрешения
на запуск.

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

В `serve` editor workspace дополнительно принимает только canonical relative
POSIX path к обычному `.md`, `.yaml`, `.yml` или `.json` внутри docs root.
Hidden/excluded/output, traversal, encoded остатки и любой обнаруженный
symlink/reparse component блокируются. SHA-256 CAS и atomic replace защищают от
случайной потери параллельного изменения. Намеренная privileged local race по
замене каталога находится вне threat model доверенной рабочей копии.

## HTTP-граница serve

Editor write требует JSON content type, точный action header и same-origin
browser context, не выдаёт CORS и ограничивает body/content. Эти guards защищают
от cross-origin browser страницы, но не аутентифицируют прямой HTTP-клиент.
Поэтому явный non-loopback listener включает доступных клиентов локальной сети
в trust boundary; CLI сохраняет предупреждение об отсутствии TLS и авторизации.

## Граница исполнения

Обычные `check`, `build`, `serve`, editor API, `search`, readiness и context не запускают
команды из Markdown. Исполнение появляется только в `task verify --run` после
task-local validation gate; правила разрешения описаны в
[MOD-CLI](../modules/cli.md).
