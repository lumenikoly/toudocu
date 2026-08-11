# Toudocu

[English](README.md) | **Русский**

[![CI](https://github.com/lumenikoly/toudocu/actions/workflows/test.yml/badge.svg)](https://github.com/lumenikoly/toudocu/actions/workflows/test.yml)
[![Docs contract](https://github.com/lumenikoly/toudocu/actions/workflows/docs.yml/badge.svg)](https://github.com/lumenikoly/toudocu/actions/workflows/docs.yml)
[![Go Version](https://img.shields.io/github/go-mod/go-version/lumenikoly/toudocu)](https://go.dev/)
[![License](https://img.shields.io/github/license/lumenikoly/toudocu)](LICENSE)

**Локальный Go CLI для проверяемой Markdown-документации и статических
HTTP-порталов.**

Toudocu хранит документацию рядом с кодом, проверяет её структуру и связи,
создаёт портал для публикации и предоставляет локальный режим с редактором,
просмотром Git-изменений и обсуждениями. Пользователю нужен один исполняемый
файл; Node.js требуется только разработчикам браузерной части самого Toudocu.

[Документация проекта](https://lumenikoly.github.io/toudocu/project-docs/)
сгенерирована с помощью Toudocu.

## Что уже работает

- `check` проверяет документы, ссылки, ID, связи, диаграммы, стандарты и
  рабочие задачи;
- `build` создаёт статический портал только для чтения;
- `serve` запускает локальный портал с редактором, пересборкой, Changes и
  автономным Swagger UI;
- `search` ищет по исходному Markdown;
- `changes` строит отчёты по локальному Git, не изменяя репозиторий;
- `task` создаёт, проверяет, перемещает и, только после явного разрешения,
  выполняет команды рабочей задачи;
- встроенный skill помогает агенту создать, обновить, перевести документацию и
  обработать комментарии из Changes.

## Быстрый старт

### 1. Соберите Toudocu

Нужен Go 1.22 или новее.

Linux и macOS:

```bash
git clone https://github.com/lumenikoly/toudocu.git
cd toudocu
go build -o toudocu ./cmd/toudocu
./toudocu version
```

Windows PowerShell:

```powershell
git clone https://github.com/lumenikoly/toudocu.git
Set-Location toudocu
go build -o toudocu.exe ./cmd/toudocu
./toudocu.exe version
```

Сборка не добавляет файл в `PATH`. Переместите его в собственный каталог
программ или вызывайте по полному пути.

### 2. Создайте исходную документацию

Перейдите в корень репозитория, который хотите документировать. Если вы
используете поддерживаемого AI-агента, установите в этот проект встроенный
skill:

```bash
toudocu skill install --agent codex
```

Также поддерживаются `claude-code` и `copilot`. Для установки один раз в
пользовательский каталог добавьте `--scope user`. Затем из того же корня
репозитория попросите агента:

```text
$toudocu init
```

Это вызов AI-skill, а не команда Go CLI. Skill изучает проект и создаёт
минимальную структуру без выдуманных модулей, статусов и процедур.

Если skill не используется, минимальный набор можно создать вручную:

```text
docs/
├── index.md
└── architecture/
    └── overview.md
```

`index.md` знакомит читателя с проектом.
`architecture/overview.md` задаёт границу системы и напрямую ссылается
на каждый другой архитектурный документ.

### 3. Проверьте структуру

```bash
toudocu check ./docs
```

Успешный `check` подтверждает структуру и явные связи, но не доказывает,
что текст полезен и соответствует реализации. Это остаётся задачей автора и
смысловой вычитки.

### 4. Работайте с документацией локально

```bash
toudocu serve ./docs
```

По умолчанию сервер слушает `http://127.0.0.1:8080`. В локальном портале
можно:

- читать документацию и пользоваться поиском;
- открывать и создавать исходные файлы в Editor;
- видеть предварительный просмотр и диагностические сообщения;
- просматривать текущий Git diff в Changes;
- комментировать изменение, строку, выделение или целый файл;
- добавлять результат в существующий этап `roadmap.md`.

Changes не запускает агента. Кнопка «Отправить агенту» только создаёт
неизменяемый пакет комментариев и показывает инструкцию. После отдельного
запроса `$toudocu feedback` skill получает самый старый ожидающий пакет,
обрабатывает его и возвращает ответы в исходные обсуждения.

У `serve` нет TLS и встроенной аутентификации. По умолчанию он безопасно
ограничен loopback-адресом. Не открывайте сервер во внешнюю сеть без отдельной
защиты. Необязательную проверку новой стабильной версии можно отключить:

```bash
toudocu serve --no-update-check ./docs
```

### 5. Соберите портал для публикации

```bash
toudocu build ./docs --output ./site --clean
```

Опубликуйте каталог `site/` на обычном HTTP(S)-хостинге. После сборки
Toudocu как сервер не нужен. Статический портал не содержит редактор, Changes
и локальные API.

Прямое открытие `index.html` через `file://` не поддерживается. Для
локального чтения используйте `toudocu serve`.

## Установка Toudocu

Установите последний стабильный выпуск:

Linux и macOS:

```sh
curl -fsSL https://github.com/lumenikoly/toudocu/releases/latest/download/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://github.com/lumenikoly/toudocu/releases/latest/download/install.ps1 | iex
```

Установщик выбирает ОС и архитектуру, загружает `checksums.txt`,
проверяет SHA-256 и версию и только затем заменяет бинарник. Полный контракт,
поддерживаемые платформы и настройка `PATH` описаны в
[руководстве по установке](docs/guides/installation.md).

## Основные команды CLI

| Результат | Команда |
|---|---|
| Показать версию или справку | `toudocu version`, `toudocu --help` |
| Проверить документацию | `toudocu check ./docs` |
| Собрать статический портал | `toudocu build ./docs --output ./site --clean` |
| Запустить локальный портал | `toudocu serve ./docs` |
| Найти текст или ID | `toudocu search "запрос" ./docs` |
| Посмотреть Git-изменения | `toudocu changes ./docs` |
| Посмотреть один файл | `toudocu changes file PATH ./docs` |
| Сопоставить diff с задачей | `toudocu task changes TASK-ID ./docs` |
| Создать нейтральный каркас | `toudocu scaffold module MOD-PAYMENTS ./docs --title "Платежи"` |
| Создать рабочую задачу | `toudocu task init ./docs --area AREA --title "Название" --type TYPE` |
| Проверить готовность задачи | `toudocu task ready TASK-ID ./docs` |
| Получить контекст задачи | `toudocu task context TASK-ID ./docs` |
| Построить план команд без запуска | `toudocu task verify TASK-ID ./docs --dry-run` |
| Явно выполнить команды задачи | `toudocu task verify TASK-ID ./docs --run` |
| Переместить задачу в архив | `toudocu task archive TASK-ID ./docs` |
| Вернуть задачу из архива | `toudocu task restore TASK-ID ./docs` |
| Управлять встроенным skill | `toudocu skill install|status|update|uninstall` |

`$toudocu init`, `$toudocu refresh`, `$toudocu translate` и
`$toudocu feedback` — процессы AI-skill. У Go CLI нет одноимённых
верхнеуровневых команд.

## Обновление и переводы через skill

Полная сверка исходной документации:

```text
$toudocu refresh
```

Сверка изменений в индексе, рабочем дереве и новых неотслеживаемых файлов
относительно `HEAD`, а также зависимых документов:

```text
$toudocu refresh diff
```

Обновление одного настроенного перевода:

```text
$toudocu translate en --all-stale
```

Обработка текущего diff для всех настроенных переводов:

```text
$toudocu translate diff
```

Канонический каталог остаётся единственным источником обычного
документационного и рабочего контекста. Переводы — полные зеркала только для
чтения: команды задач, создание каркасов и запись из Editor для них запрещены.

В этом репозитории каноническая документация находится в `docs/`, а
английский перевод — в `docs-en/`.

## Поддерживаемый Markdown

Toudocu использует Goldmark 1.8.5 и один CommonMark/GFM-разбор для всех команд.
Поддерживаются заголовки, абзацы, выделение, цитаты, ссылки, безопасные
растровые изображения, обычные списки и списки с галочками, таблицы, зачёркивание,
автоматические ссылки, код в строке и блоки кода.

Mermaid поддерживает `flowchart`, `stateDiagram-v2` и
`sequenceDiagram`.

Не поддерживаются сырой HTML, front matter в начале файла между одинаковыми
строками `---` или `+++`, Markdown-атрибуты, сноски, списки
определений, активные SVG/XML/HTML-ресурсы и JavaScript URL. Подробности
находятся в [модуле Markdown](docs/modules/markdown.md).

## Конфигурация

Необязательный файл `.toudocu/config.yml` задаёт язык, оформление портала,
пути переводов и параметры Changes. Краткий пример:

```yaml
project:
  locale: ru

site:
  title: Мой проект
  theme: classic
  colorScheme: system
  accent: indigo
```

Все поля и допустимые значения перечислены в
[справочнике конфигурации](docs/reference/configuration.md).

## Публичный Go API

Корневой пакет предоставляет типизированные операции модели, генератора и
отчётов. Его module path — `toudocu`, поэтому пакет предназначен для программ,
которые собираются в этом исходном дереве или используют явный локальный
`replace`. CLI остаётся поддерживаемым интерфейсом поставки.

## Разработка Toudocu

```bash
make fmt
make fmt-check
make vet
make test
make web
make web-check
make browser-test
make check
make build
make docs
make docs-serve
make release
```

`make`-команды относятся к разработке этого репозитория. Пользователь
готового бинарника запускает команды `toudocu` напрямую.

## Подробная документация

- [Возможности](docs/reference/features.md)
- [Команды CLI](docs/contracts/cli.md)
- [Настройка](docs/reference/configuration.md)
- [Локальная работа](docs/guides/local-workflow.md)
- [Просмотр изменений](docs/guides/documentation-changes.md)
- [Работа AI-skill](docs/guides/agent-workflows.md)
- [Рабочие задачи](docs/guides/work-items.md)
- [Установка skill](docs/guides/skill-installation.md)
- [Виды документов](docs/reference/document-types.md)
- [Исходная документация Toudocu](docs/index.md)
- [Участие в разработке](CONTRIBUTING.ru.md)

## Лицензия

Условия распространения находятся в [LICENSE](LICENSE). Лицензии встроенных
сторонних компонентов перечислены в
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
