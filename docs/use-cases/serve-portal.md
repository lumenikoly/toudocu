# UC-DOCS-03: Просматривать документацию на локальном сервере

- Идентификатор: UC-DOCS-03
- Статус: Готово
- Актор: Разработчик
- Модуль: MOD-SITE
- Приоритет: Средний
- Экраны: SC-SITE-HOME, SC-SITE-EDITOR, SC-SITE-DOCUMENT, SC-SITE-API-DOCS
- Начальный экран: SC-SITE-HOME
- Конечные экраны: SC-SITE-DOCUMENT, SC-SITE-API-DOCS
- Разрешить цикл: Да
- Последнее обновление: 2026-08-08

Разработчик просматривает и редактирует документацию через локальный HTTP-сервер
и получает обновлённую модель и портал после сохранения или внешнего изменения.

## Входные данные

- каталог проектной документации;
- выходной каталог;
- адрес и порт сервера;
- необязательный `--no-update-check` для полностью автономного запуска;
- обычные `.md`, `.yaml`, `.yml` и `.json` внутри каталога документации.

## Предусловия

- Docu-docu доступен для запуска;
- разработчик имеет права чтения и записи документации и выходного каталога.

## Основной сценарий

1. Разработчик вызывает `docu-docu serve ./docs`.
2. Docu-docu собирает портал в выходной каталог.
3. Docu-docu запускает HTTP-сервер на `127.0.0.1:8080` и сообщает адрес.
4. Разработчик открывает портал в браузере.
5. Portal запрашивает same-origin status версии. Если stable release новее,
   под header появляется предложение открыть официальный релиз; разработчик
   может скрыть его для этой версии.
6. Если разработчик переходит в `/_docu-docu/api-docs/`, он выбирает Editor или
   Changes contract, раскрывает operation и при необходимости выполняет
   безопасный `GET`/`HEAD`; сценарий завершается на `SC-SITE-API-DOCS`.
7. Иначе на странице roadmap разработчик может выбрать существующий этап,
   проверить предложенный `DLV-ROADMAP-NNN`, изменить ID и добавить однострочный
   результат. Docu-docu выполняет CAS insertion и возвращает страницу к этапу.
8. Или разработчик открывает `/_docu-docu/editor/`; Editor получает revision,
   безопасный список файлов и общий реестр шаблонов.
9. Разработчик открывает исходник, меняет текст, проверяет Markdown preview и
   positional diagnostics и сохраняет его.
10. Docu-docu сравнивает SHA-256 digest, атомарно заменяет файл и синхронно
   перестраивает модель, HTML, поиск и diagnostics.
11. При переходе между canonical HTML-документами portal может заранее получить
   целевую страницу, проверить текущую revision и заменить document layout без
   rebuild. Back/Forward, anchors, scroll и keyboard focus продолжают работать.
12. Browser polling получает новую revision: обычная страница перезагружается,
   чистый editor обновляется, а dirty editor сохраняет текст и показывает
   конфликт.
13. HTTP-навигация отдаёт последний успешный snapshot и не запускает rebuild.
   Watcher стабилизирует внешние изменения и перестраивает только изменившийся
   documentation root; ручная пересборка canonical portal показывает область
   «модель, HTML и поиск», progress и итог перед перезагрузкой.
14. Если `serve` запущен из canonical root с `translations.<locale>`, header
   предлагает locale tags. Соответствующий Markdown открывается в выбранном
   locale, а отсутствующая страница — на его homepage.
15. Разработчик останавливает сервер сочетанием `Ctrl+C`.

## Ошибочные сценарии

- на шаге 2 ошибка чтения или генерации не оставляет работающий сервер;
- на шаге 3 занятый или недоступный порт завершает команду с кодом `1`;
- timeout, malformed/oversized GitHub response или development version не
  показывают предложение обновить и не влияют на остальные функции;
- stale digest возвращает `409 stale_digest`; явное overwrite повторяется с
  актуальным digest и `confirmOverwrite: true`, а запрос без подтверждения и
  второй внешний конфликт снова получают `409`;
- stale roadmap digest не допускает overwrite: диалог сохраняет ID, текст и
  выбранный этап, обновляет этапы/digest/подсказку и требует повторного submit;
- при внешнем удалении dirty-файла редактор сохраняет буфер и предлагает скачать
  его, не показывая неприменимые load/overwrite действия;
- malformed, oversized, cross-origin и unsafe-path запросы получают JSON error
  envelope и не меняют исходник;
- ошибка последующей пересборки возвращает HTTP 500 для текущего запроса или
  server log watcher, но не останавливает listener;
- ошибка ручной пересборки остаётся на текущей странице, снимает состояние
  загрузки и предлагает повторить действие;
- ошибка загрузки HTML, неподходящая страница или несовпадающая revision во
  время мягкого перехода выполняет обычную полную навигацию;
- translation portal с неуспешной первой сборкой показывает безопасную страницу
  `Unavailable`; последующая ошибка не заменяет last-known-good snapshot;
- `--host 0.0.0.0` открывает сервер для локальной сети без TLS и авторизации;
  Docu-docu выводит явное предупреждение.

## Постусловия

Пока команда работает, обычные маршруты раздают output, а отдельный editor API
читает и изменяет только разрешённый workspace внутри docs root. Остальные файлы
репозитория недоступны. После остановки процесса API исчезает и порт освобождён.
Locale mount `/_docu-docu/locales/<locale>/` является read-only: он не содержит
editor, changes, workspace, API docs или canonical API.

## Бизнес-правила

Правила определены в документе модуля:

- [BR-SITE-003](../modules/site.md#br-site-003-dev-сервер-не-раскрывает-исходный-репозиторий) — dev-сервер не раскрывает исходный репозиторий.
- [BR-SITE-007](../modules/site.md#br-site-007-build-и-serve-имеют-разные-возможности) — build остаётся static read-only, serve предоставляет live workspace.
- [BR-SITE-010](../modules/site.md#br-site-010-мягкая-навигация-ограничена-canonical-serve-portal) — мягкие переходы не меняют offline/file и locale semantics.
- [BR-SITE-014](../modules/site.md#br-site-014-roadmap-изменяется-только-ограниченной-операцией) — serve добавляет только новый `DLV-*` с CAS, не передавая разбор Markdown браузеру.
- [BR-SITE-015](../modules/site.md#br-site-015-проверка-версии-не-влияет-на-доступность-портала) — update notice существует только в canonical serve и деградирует без ошибки.

## Реализация

- [FLOW-DOCS-SERVE: Локальный просмотр портала](../flows/FLOW-DOCS-SERVE.md)
- [Статический портал](../modules/site.md)
- [CLI и workflow задач](../modules/cli.md)
- [CLI-контракт](../contracts/cli.md)
- [HTTP-контракт editor API](../contracts/editor-http.md)
- [Editor OpenAPI](../contracts/editor.openapi.yaml)
- [Changes OpenAPI](../contracts/changes.openapi.yaml)

## Проверка

- первоначальная сборка и HTTP-раздача портала;
- save/create и watcher перестраивают модель, HTML, поиск и diagnostics;
- path, symlink, body/content limits, same-origin guards и CAS conflicts;
- Markdown preview, JSON/YAML diagnostics и raw `text/plain`;
- desktop/mobile keyboard flow без потери dirty текста;
- roadmap happy path, изменённый предложенный ID, прогресс, CAS preservation,
  keyboard/Escape/focus и mobile layout;
- ручная пересборка из workspace-панели с видимой областью, progress, итогом и
  последующей перезагрузкой страницы;
- недоступность кнопки вне `serve` и обработка ошибки ручной пересборки;
- HTTP 500 при ошибке пересборки без остановки процесса;
- недоступность исходных файлов репозитория;
- проверка loopback по умолчанию и сетевого предупреждения.
- root и nested переходы, Back/Forward, anchors и keyboard navigation;
- поиск, Mermaid, Screen Map и playable flow после нескольких мягких переходов;
- полная навигация для editor, changes, locale и external links, а также
  fallback при network error и revision mismatch;
- отсутствие eager-запросов search index и Mermaid на обычной странице.
- update notice, dismiss для конкретной версии, `--no-update-check`, silent
  failure и отсутствие endpoint/capability в static и translation portals.
