# Публикация статического портала

`toudocu build` создаёт read-only output, который после генерации не требует
Toudocu backend, Node.js, базы данных или CDN.

```bash
toudocu build ./docs --output ./site --clean
```

Загрузите весь каталог `site/` на обычный HTTP(S) static hosting: nginx,
GitHub Pages, S3-compatible storage или корпоративный сервер. Нельзя выбирать
только HTML: `assets/`, `data/`, `report.json` и локальные project assets
являются частью результата.

Generated portal не хранится в Git. Workflow GitHub Pages на каждом push в
`main` строго собирает canonical `docs/` во временный artifact, затем собирает
английский translation root `docs-en/` во вложенный каталог и добавляет landing
в корень artifact. Родительский output `project-docs/` всегда очищается и
собирается первым: иначе его последующая очистка удалила бы уже собранный
`project-docs/en/`.

Публичная структура artifact:

- `/` — locale gateway;
- `/ru/` и `/en/` — русская и английская версии landing;
- `/project-docs/` — портал из canonical `docs/`;
- `/project-docs/en/` — портал из `docs-en/`.

Locale gateway учитывает только сохранённый явным переключателем ключ
`toudocu-landing-locale`, затем основную локаль браузера. `ru` и `ru-*`
открывают `/ru/`, остальные и неизвестные значения — `/en/`. Определение языка
происходит только в `/`: прямой locale URL всегда сохраняет выбранный в URL
язык, а при отключённом JavaScript корень показывает обе ссылки.

Портал использует относительные document links и переданные Go относительные
asset/data bases, поэтому один output можно разместить в корне host либо во
вложенном пути вроде `/docs/` или `/projects/my-project/` без обязательной
настройки `baseURL`.

Static output является потенциально публичным артефактом. Генератор не включает
абсолютные filesystem paths, server configuration, editor metadata, credentials
или данные вне разрешённой documentation model.

Для локального просмотра используйте `toudocu serve` и
[локальный workflow](local-workflow.md).
Прямое открытие `index.html` двойным кликом не является поддерживаемым способом
публикации или проверки.

## Проверка публикации

1. Раздайте весь output через HTTP.
2. Откройте главную и вложенную document page.
3. Проверьте загрузку `portal.css`, `portal.js` и `data/search-index.json`.
4. Проверьте поиск, тему и Mermaid fallback.
5. Повторите smoke во вложенном URL-пути.

Для локальной совместной проверки landing и обоих порталов сначала выполните
`make docs`, затем `make landing-serve`. Первая команда в правильном порядке
собирает `docs/` в игнорируемый `build/project-docs/` и `docs-en/` в
`build/project-docs/en/`. Сервер сохраняет те же публичные маршруты `/ru/`,
`/en/`, `/project-docs/` и `/project-docs/en/`, что и Pages artifact.

## Связанные документы

- [UC-DOCS-01: Создать статический HTTP-портал](../use-cases/build-portal.md)
- [Граница Go/frontend](../architecture/frontend-runtime-boundary.md)
- [CLI-контракт](../contracts/cli.md)
