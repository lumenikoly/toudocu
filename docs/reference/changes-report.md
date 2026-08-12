# ChangeSetReport версии 1

`toudocu changes --format json` возвращает воспроизводимый отчёт со
`schemaVersion: 1`. В нём есть состояние репозитория и ветки, `HEAD`, признак
локальных правок, разрешённые начало и конец сравнения, `changeSetDigest`,
сводка файлов, строк, сущностей и классов, массив `changes[]`, влияние задачи и
диагностические сообщения.

## Один изменённый файл

`DocumentationChange` содержит:

- `status`, `path`, прежний `oldPath` и признаки
  `staged`/`unstaged`/`untracked`;
- число добавленных и удалённых строк, двоичный признак и размеры;
- класс файла и известные сущности до и после;
- доступные представления и их диагностические сообщения;
- точный патч Git `sourceDiff` и отдельные `sourceDiffHunks`;
- различия отрисованных разделов, семантики и связей;
- сведения о ресурсе, экране, OpenAPI и Mermaid, когда они применимы.

Каждый фрагмент патча имеет стабильный для текущего отчёта ID, заголовок,
диапазоны старых и новых строк и собственный текст. Полный `sourceDiff` остаётся
главным источником истины.

## Markdown и ресурсы

`renderedSections` сопоставляет разделы по якорям Markdown. Состояния:
`added-section`, `removed-section`, `modified-section`, `moved-section`,
`unchanged-section`. Это сравнение структуры Markdown, а не произвольного DOM.

Для изображения сохраняются MIME-тип, ширина, высота, соотношение сторон и,
когда это можно определить, прозрачность. Рабочие документы имеют класс
`work-artifact`, постоянная документация — `permanent-documentation`, контракты
и ресурсы — собственные классы.

`SemanticChange` содержит вид изменения, сущность, поле, значения до и после,
краткое объяснение, позиции и необязательную оценку совместимости OpenAPI.
Связь имеет состояние `relation-added` или `relation-removed` и обе стороны.

Пути OpenAPI стабильны, например
`POST /login.parameters.header:client` или
`components.schemas.Login.properties.role.enum`. CI может выбрать конкретное
несовместимое изменение без разбора текста объяснения.

Для `SC-*` поле `screen` хранит экран до и после и переходы со старой и новой
целью, действием, условием и состоянием. Удалённый элемент сохраняется как
данные старой стороны, чтобы карта могла его показать.

`mermaidBlocks` содержит ID, состояние, подпись, исходник до и после и позиции.
Ошибка одной стороны не скрывает исходник другой. Toudocu сравнивает текст
диаграммы, а не пиксели готового изображения.

## Основные коды

- Git: `git-repository-not-found`, `git-command-failed`,
  `git-base-not-found`, `git-target-not-found`,
  `git-merge-base-not-found`, `git-binary-diff-unavailable`;
- файл: `change-file-too-large`, `change-old-version-missing`,
  `change-new-version-missing`;
- специальные представления: `semantic-old-version-invalid`,
  `semantic-new-version-invalid`, `mermaid-old-version-invalid`,
  `mermaid-new-version-invalid`, `rendered-old-version-failed`,
  `rendered-new-version-failed`, `openapi-old-version-invalid`,
  `openapi-new-version-invalid`, `openapi-breaking-change`;
- задача и связи: `declared-document-not-changed`,
  `declared-document-not-created`, `undeclared-document-change`,
  `undeclared-document-created`, `deleted-entity-still-referenced`.

`changeSetDigest` нужен кэшу и обновлению живой страницы. Он не является
собственной историей документов Toudocu.

Поле `Issue.message` и остальные технические диагностические сообщения отчёта
всегда английские. Для автоматизации используются перечисленные стабильные
коды; пути и другие значения из пользовательского ввода внутри сообщений
остаются дословными.
