# Архитектура

- Тип документа: Architecture Overview

Docu-docu — локальный dependency-free Go runtime между исходным каталогом
документации и потребителями проверенной модели: Go-кодом через публичный фасад,
автоматизацией через CLI/JSON и читателем статического HTTP-портала.
Опциональный `serve` добавляет локальный HTTP/editor runtime и offline каталог
OpenAPI. Только canonical portal может выполнить один ограниченный запрос к
GitHub Releases API за метаданными latest stable release; база данных, CDN и
внешний runtime в границу системы не входят.

## Граница системы

Разработчик, библиотечный потребитель, агент или CI передаёт Docu-docu каталог
документации и явно выбранный repository root. Docu-docu читает Markdown и
локальные assets и распознанные OpenAPI contracts, проверяет объявленные связи
и wire structure и либо возвращает diagnostics,
либо строит производные HTML/JSON-файлы. В `build` браузер только открывает
готовый read-only портал. В `serve` он может отправить ограниченную
workspace-запись, после которой Go-процесс снова строит модель. Только отдельный
явный режим проверки задачи может запускать команды репозитория. Проверка
release metadata отключается флагом, не загружает код и не существует в static
или translation portal.

## Карта архитектурных вопросов

- [Где проходит системная граница Docu-docu и кто с ней взаимодействует?](system-boundary.md)
- [Как runtime-компоненты делят ответственность?](runtime-components.md)
- [Где проходит граница между Go-ядром и frontend runtime?](frontend-runtime-boundary.md)
- [Где проходят границы доверия?](trust-boundaries.md)
- [Как изолируются ошибки документации и запускаемых проверок?](failure-isolation.md)
- [Как Git-состояния превращаются в согласованный change set документации?](documentation-changes.md)
- [Как review discussion сохраняет связь с меняющимся содержимым repository?](review-anchoring.md)
