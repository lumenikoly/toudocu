# Публикация статического портала

`docu-docu build` создаёт read-only output, который после генерации не требует
Docu-docu backend, Node.js, базы данных или CDN.

```bash
docu-docu build ./docs --output ./site --clean
```

Загрузите весь каталог `site/` на обычный HTTP(S) static hosting: nginx,
GitHub Pages, S3-compatible storage или корпоративный сервер. Нельзя выбирать
только HTML: `assets/`, `data/`, `report.json` и локальные project assets
являются частью результата.

Generated portal не хранится в Git. Workflow GitHub Pages на каждом push в
`main` строго собирает canonical `docs/` во временный artifact, добавляет
landing в его корень и публикует artifact официальными Pages actions. Поэтому
landing доступен в корне сайта, а документация — по-прежнему по относительному
пути `project-docs/`. Demo-документация в Pages artifact не входит.

Портал использует относительные document links и переданные Go относительные
asset/data bases, поэтому один output можно разместить в корне host либо во
вложенном пути вроде `/docs/` или `/projects/my-project/` без обязательной
настройки `baseURL`.

Static output является потенциально публичным артефактом. Генератор не включает
абсолютные filesystem paths, server configuration, editor metadata, credentials
или данные вне разрешённой documentation model.

Для локального просмотра используйте `docu-docu serve` и
[локальный workflow](local-workflow.md).
Прямое открытие `index.html` двойным кликом не является поддерживаемым способом
публикации или проверки.

## Проверка публикации

1. Раздайте весь output через HTTP.
2. Откройте главную и вложенную document page.
3. Проверьте загрузку `portal.css`, `portal.js` и `data/search-index.json`.
4. Проверьте поиск, тему и Mermaid fallback.
5. Повторите smoke во вложенном URL-пути.

Для локальной совместной проверки landing и canonical portal сначала выполните
`make docs`, затем `make landing-serve`. Сервер использует игнорируемый
`build/project-docs/` и сохраняет публичный переход `/project-docs/`.

## Связанные документы

- [UC-DOCS-01: Создать статический HTTP-портал](../use-cases/build-portal.md)
- [Граница Go/frontend](../architecture/frontend-runtime-boundary.md)
- [CLI-контракт](../contracts/cli.md)
