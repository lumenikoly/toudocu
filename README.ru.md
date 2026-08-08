# Docu-docu

[English](README.md) | **Русский**

[![CI](https://github.com/lumenikoly/docu-docu/actions/workflows/test.yml/badge.svg)](https://github.com/lumenikoly/docu-docu/actions/workflows/test.yml)
[![Docs contract](https://github.com/lumenikoly/docu-docu/actions/workflows/docs.yml/badge.svg)](https://github.com/lumenikoly/docu-docu/actions/workflows/docs.yml)
[![Go Version](https://img.shields.io/github/go-mod/go-version/lumenikoly/docu-docu)](https://go.dev/)
[![License](https://img.shields.io/github/license/lumenikoly/docu-docu)](LICENSE)

**Инструмент для проверяемой Markdown-документации и статических HTTP-порталов.**

**Docu-docu** помогает поддерживать документацию вместе с кодом, находить несоответствия и собирать удобные статические порталы для чтения.

### Главные возможности

* **Готовый CLI на Go** — быстрый бинарник без Node.js и дополнительных зависимостей.
* **Skills для AI-агентов** — помогают анализировать репозиторий, создавать документацию и обновлять её после изменений.
* **Проверка документации** — структура, ссылки и связи проверяются локально и в CI.
* **Статический HTTP-портал** — результат не требует backend и публикуется на обычном static hosting.
* **Локальный режим** — редактор, автоматическая пересборка и просмотр Git-изменений.
* **Минимум инфраструктуры** — без базы данных, npm, CDN и отдельного runtime.

Вся документация хранится в репозитории как обычные Markdown-файлы.

---

## Быстрый старт

### 1. Установите CLI

Linux и macOS:

```bash
curl -fsSL https://github.com/lumenikoly/docu-docu/releases/latest/download/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://github.com/lumenikoly/docu-docu/releases/latest/download/install.ps1 | iex
```

Installer сам выбирает платформу, проверяет SHA-256 и ставит бинарник
в каталог текущего пользователя. Повторный запуск этой же команды
обновляет Docu-docu.

Проверьте установку:

```bash
docu-docu --help
```

Также можно собрать бинарник из исходников:

```bash
git clone https://github.com/lumenikoly/docu-docu.git
cd docu-docu
make build
```

После сборки бинарник появится в корне репозитория:

```bash
./docu-docu --help
```

Матрица платформ, закрепление версии, каталоги и границы проверки
описаны в [руководстве по установке](docs/guides/installation.md).

### 2. Подключите skill

Skill устанавливается отдельно в поддерживаемый AI-инструмент.

После установки он будет доступен как:

```text
$docu-docu
```

Skill использует установленный CLI для проверки и сборки документации, а сам отвечает за анализ репозитория и обновление Markdown-файлов.

CLI можно использовать и без skill.

### 3. Создайте документацию проекта

Запустите skill из корня своего репозитория:

```text
$docu-docu init
```

Skill изучит проект и создаст начальную структуру документации.

### 4. Проверьте документацию

```bash
docu-docu check ./docs
```

### 5. Запустите локальный портал

```bash
docu-docu serve ./docs
```

По умолчанию портал будет доступен по адресу:

```text
http://127.0.0.1:8080
```

Локальный режим включает редактор, отслеживание файлов и автоматическую пересборку.

### 6. Соберите статическую версию

```bash
docu-docu build ./docs \
  --output ./site \
  --clean
```

Опубликуйте весь output на обычном HTTP(S) static hosting. Для локального
просмотра используйте `docu-docu serve`:

```text
docu-docu serve ./docs
```

---

## Skills

Skills позволяют работать с документацией через обычные запросы к AI-агенту.

Они анализируют репозиторий, находят связанные документы и используют Docu-docu для проверки результата.

### Создать документацию

```text
$docu-docu init
```

Skill изучает репозиторий и создаёт начальную структуру документации.

Он подходит как для нового проекта, так и для существующего репозитория без оформленной документации.

### Сверить документацию с проектом

```text
$docu-docu refresh
```

Skill проверяет документацию по текущему состоянию репозитория и обновляет затронутые разделы.

Это полезно после крупных изменений, рефакторинга или добавления новых компонентов.

### Проверить текущие изменения

```text
$docu-docu refresh diff
```

Skill начинает с текущих Git-изменений и проверяет связанную с ними документацию.

Этот режим удобно использовать перед коммитом или pull request.

### Обновить перевод

```text
$docu-docu translate en --all-stale
```

Skill обновляет полное read-only зеркало, сохраняя основной каталог оперативным источником истины. Нужны locale и ровно один режим выбора: `--task`, `--base` или `--all-stale`.

---

## Проверка документации

```bash
docu-docu check ./docs
```

Docu-docu проверяет:

* структуру каталогов и документов;
* внутренние и внешние ссылки;
* обязательные разделы;
* связи между документами;
* диаграммы;
* стандарты и рабочие инструкции;
* целостность общей модели проекта.

Проверку можно запускать локально или добавлять в CI.

---

## Статический HTTP-портал

```bash
docu-docu build ./docs \
  --output ./site \
  --clean
```

Готовый портал:

* работает на обычном HTTP(S) static hosting, включая вложенный URL-путь;
* не требует Docu-docu или другого backend после генерации;
* не использует базу данных;
* не загружает ресурсы из CDN;
* не требует Node.js или npm;
* подходит для CI-артефактов и статического хостинга.

Портал остаётся доступным только для чтения. Прямое открытие `index.html`
двойным кликом не является поддерживаемым контрактом.

---

## Локальный портал и редактор

```bash
docu-docu serve ./docs
```

Локальный режим предоставляет:

* навигацию по документации;
* встроенный редактор;
* поиск;
* отслеживание изменений;
* автоматическую пересборку;
* предварительный просмотр ошибок;
* просмотр изменений через Git;
* неблокирующее предложение открыть новый stable-релиз Docu-docu;
* автономную документацию OpenAPI по адресу `/_docu-docu/api-docs/` с
  безопасным выполнением только `GET`/`HEAD`.

По умолчанию сервер слушает:

```text
127.0.0.1:8080
```

У локального сервера нет TLS и встроенной авторизации. Не открывайте его во внешнюю сеть без дополнительной защиты.

Проверка релиза выполняется не более одного раза за процесс и не обновляет
бинарник. Чтобы отключить сетевой запрос и предложение в UI, запустите
`docu-docu serve --no-update-check ./docs`.

---

## Поиск

```bash
docu-docu search "authentication" ./docs
```

Поиск работает по исходным Markdown-файлам и помогает быстро найти существующее описание перед созданием нового документа.

---

## Просмотр изменений

```bash
docu-docu changes ./docs
```

Docu-docu использует Git, чтобы показать изменения документации между ветками, коммитами и текущим рабочим состоянием.

Пример сравнения с основной веткой:

```bash
docu-docu changes ./docs \
  --base main \
  --target working-tree
```

Docu-docu не выполняет `commit`, `checkout`, `add` или `fetch` и не изменяет состояние репозитория.

---

## Шаблоны документов

Docu-docu умеет создавать заготовки для новых документов.

Например:

```bash
docu-docu scaffold module MOD-PAYMENTS ./docs \
  --title "Payments"
```

Шаблон задаёт структуру документа, но не придумывает сведения о проекте.

---

## Структура документации

Минимальный проект состоит из двух файлов:

```text
docs/
├── index.md
└── architecture/
    └── overview.md
```

`index.md` знакомит читателя с проектом.

`architecture/overview.md` кратко описывает устройство системы и содержит ссылки на более подробные документы.

Остальные разделы можно добавлять по мере роста проекта.

Docu-docu подходит для описания:

* архитектуры;
* компонентов;
* пользовательских сценариев;
* процессов;
* интерфейсов;
* требований;
* стандартов разработки;
* эксплуатационных инструкций;
* планов и изменений проекта.

Для диаграмм можно использовать Mermaid.

---

## Поддерживаемый Markdown

Docu-docu использует Goldmark `v1.8.5` как единый CommonMark AST-движок и
включает только:

* заголовки, абзацы, выделение и цитаты;
* ссылки и безопасные локальные raster-изображения;
* маркированные, нумерованные и task-списки;
* таблицы, inline code и fenced code blocks;
* strikethrough и literal autolinks для HTTP(S), `www` и email;
* Mermaid `flowchart`, `stateDiagram-v2` и `sequenceDiagram`.

Raw HTML и ведущий завершённый front matter являются ошибками проверки;
preview и rendered diff всё равно показывают source как escaped text.
Attributes, footnotes, definition lists и typographer не включены. Подробные ограничения
зафиксированы в [модуле безопасного Markdown](docs/modules/markdown.md).

---

## Настройка портала

Необязательный файл `.docu-docu/config.yml` позволяет настроить внешний вид и поведение портала.

Пример:

```yaml
project:
  locale: ru

site:
  title: My Project
  logo: assets/logo.svg
  favicon: assets/favicon.svg
  theme: classic
  colorScheme: system
  accent: indigo
```

Можно настроить:

* название проекта;
* логотип и favicon;
* обложку главной страницы;
* светлую или тёмную схему;
* цветовой акцент;
* ширину контента;
* плотность интерфейса;
* текст в нижней части страницы.

Доступны темы:

```text
classic
paper
terminal
```

---

## Переводы

Основной язык проекта задаётся в `.docu-docu/config.yml`:

```yaml
project:
  locale: ru
```

Для обновления отдельной языковой версии используйте:

```text
$docu-docu translate en --all-stale
```

Основная документация остаётся оперативным источником истины, а переводы хранятся как полные read-only зеркала. Для каждого перевода требуется полный профиль `translations.<locale>` с независимым root и названиями встроенных разделов; в этом репозитории английский хранится в `docs-en/`, а канонический русский — в `docs/`. На translation roots запрещены task-команды, scaffold и editor-запись.

---

## Основные команды

| Задача                            | CLI                                                              | Из репозитория Docu-docu |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------ |
| Проверить документацию            | `docu-docu check ./docs`                                         | `make check`             |
| Собрать портал                    | `docu-docu build ./docs --output ./site --clean`                 | `make docs`              |
| Запустить локальный портал        | `docu-docu serve ./docs`                                         | `make docs-serve`        |
| Собрать демонстрационный портал   | `docu-docu build ./example/docs --output ./example/site --clean` | `make demo`              |
| Запустить демонстрационный портал | `docu-docu serve ./example/docs`                                 | `make demo-serve`        |
| Найти документ                    | `docu-docu search "запрос" ./docs`                               | —                        |
| Посмотреть изменения              | `docu-docu changes ./docs`                                       | —                        |
| Создать шаблон                    | `docu-docu scaffold module MOD-PAYMENTS ./docs --title "Payments"` | —                      |
| Собрать бинарник                  | `go build -o docu-docu ./cmd/docu-docu`                          | `make build`             |
| Запустить тесты                   | `go test ./...`                                                  | `make test`              |
| Собрать релизные бинарники        | вручную                                                          | `make release`           |
| Удалить артефакты                 | вручную                                                          | `make clean`             |

Команды `make` предназначены для разработки самого Docu-docu из исходного репозитория.

Пользователи готового бинарника запускают команды `docu-docu` напрямую.

---

## Публичный Go API

Корневой пакет предоставляет типизированный фасад над моделью, генератором,
отчётами и отдельными операциями CLI. Текущий module path — локальный
`docu-docu`; канонический удалённый Go module ещё не опубликован, поэтому
внешним потребителям пока не следует фиксировать этот import path.

Текущий фасад определяют экспортируемые объявления и package documentation в
`api.go`. До публикации канонического module path отдельные гарантии
совместимости для внешних потребителей не заявлены. CLI остаётся основным
пользовательским способом запуска готового бинарника.

Markdown AST и низкоуровневые parser/renderer намеренно остаются внутренними;
типы Goldmark не входят в facade или JSON schema v1.

---

## Разработка

Отформатировать Go-код:

```bash
make fmt
```

Проверить форматирование:

```bash
make fmt-check
```

Запустить статический анализ:

```bash
make vet
```

Запустить тесты:

```bash
make test
```

Выполнить полный цикл проверки:

```bash
make check
```

Собрать портал проекта:

```bash
make docs
```

Запустить портал проекта:

```bash
make docs-serve
```

Собрать релизные бинарники:

```bash
make release
```

Удалить созданные артефакты:

```bash
make clean
```

---

## Справка

```bash
docu-docu --help
docu-docu check --help
docu-docu build --help
docu-docu serve --help
docu-docu search --help
docu-docu changes --help
docu-docu scaffold --help
```

Подробная документация:

* [Возможности Docu-docu](docs/reference/features.md)
* [Настройка](docs/reference/configuration.md)
* [Команды CLI](docs/contracts/cli.md)
* [Agent-workflows](docs/guides/agent-workflows.md)
* [Рабочие задачи](docs/guides/work-items.md)
* [Исходная документация проекта](docs/index.md)
* [Тестирование](docs/guides/testing.md)
* [Участие в разработке](CONTRIBUTING.md)

---

## Лицензия

Условия распространения находятся в [LICENSE](LICENSE).

Лицензии встроенных сторонних компонентов перечислены в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
