<!-- toudocu
id: SC-SITE-HOME
status: done
screenKind: page
module: MOD-SITE
route: /
preview: ../assets/screens/site-home.png
updated: 2026-10-02
-->

# SC-SITE-HOME: Главная портала

Главная страница быстро отвечает на три вопроса: что это за проект, в каком он
состоянии и куда идти дальше. Под названием и основными сведениями находится
свёрнутый раздел «О проекте»: после раскрытия он показывает полный текст
`index.md`. Затем идут текущие задачи, карта связей проекта, разделы базы знаний
и результаты структурной проверки.

Описание проекта не повторяется во вводном тексте второй раз. При `serve`
отсюда можно открыть редактор, изменения
и HTTP API. Если опубликована более новая стабильная версия Toudocu, под
верхней панелью появляется ненавязчивое уведомление; его можно скрыть для этой
версии.

## Переходы

<!-- toudocu:table transitions columns=id,useCase,action,condition,target,kind -->
| ID | Сценарий | Действие | Условие | Результат | Тип |
|---|---|---|---|---|---|
| TR-SITE-001 | UC-DOCS-03 | Открыть документ | Документ выбран | SC-SITE-DOCUMENT | navigation |
| TR-SITE-002 | UC-DOCS-03 | Открыть редактор | Портал запущен через serve | SC-SITE-EDITOR | navigation |
| TR-SITE-005 | UC-DOCS-05 | Открыть изменения | Портал запущен через serve | SC-CHANGES-WORKSPACE | navigation |
| TR-SITE-006 | UC-DOCS-03 | Открыть HTTP API | Канонический портал запущен через serve | SC-SITE-API-DOCS | navigation |
