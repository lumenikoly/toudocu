# Changelog

## 0.0.1

- У комментариев Changes удалён неиспользуемый тип: composer, discussion,
  HTTP schema, local state и FIFO feedback теперь передают только текст.
- Вкладка «Изменения» стала review-first workspace: первый source diff
  открывается сразу, Git range и diagnostics раскрываются по запросу, а в
  постоянной панели файлов остаются только path-sorted список, поиск и статус.
  Desktop использует внутренний полноэкранный split, mobile — отдельные Files и
  Discussions drawers без горизонтального overflow.
- Canonical Changes workspace получил repository-wide local review:
  персистентные anchored discussions, changed/linked files, FIFO feedback
  snapshots и agent responses через `changes feedback pending|respond`. UI и
  CLI не запускают агента и не меняют Git; static и translation runtimes review
  capability не получают.
- Serve-only CodeMirror bundle закрепляет Go 6.0.1, Java 6.0.2 и
  JavaScript/TypeScript 6.2.5 language packages; остальные UTF-8 files
  сохраняют plain-text selection fallback.
- `changes`, `changes file` и `task changes` получили явные
  `--include-assets` и `--translation-input`: первый переопределяет фильтр
  assets, второй формирует полный reader-facing вход для translation workflow.
- Skill workflow `$toudocu translate diff` переводит staged, unstaged и
  untracked canonical-изменения относительно `HEAD` во все настроенные locale
  profiles, сохраняя изоляцию и отдельный результат каждого target.
- Release workflow поддерживает stable и RC-каналы: RC публикуется как GitHub
  prerelease с тегом `X.Y.Z-rc.N` и устанавливается по явно выбранной версии.
- Markdown полностью переведён на закреплённый Goldmark `v1.8.5`: один
  CommonMark/GFM AST обслуживает model, validation, portal, editor и changes.
  Включены только tables, task lists, strikethrough и literal autolinks.
- Raw HTML и ведущий завершённый front matter теперь являются policy errors;
  preview и rendered diff сохраняют безопасное escaped представление. Из
  публичного Go facade удалены низкоуровневые parser/renderer types и функции;
  высокоуровневые операции и JSON schema v1 сохранены.
- Frontend source выделен в независимый TypeScript/CSS workspace `web/`;
  детерминированные generated assets фиксируются в репозитории, проверяются CI
  и встраиваются в один Go-бинарник. Node.js остаётся только build toolchain.
- `build` создаёт backend-independent read-only портал для обычного HTTP(S)
  static hosting, включая вложенный URL-путь. Go project model остаётся
  единственным источником HTML, bootstrap и static JSON.
- Static и serve runtime технически разделены: editor, changes, rebuild clients,
  API URL, CodeMirror и Swagger UI отсутствуют в static output и добавляются
  только явными serve capabilities.
- Migration: прямое открытие `index.html` с диска больше не является
  гарантированным контрактом. Для локальной работы используйте
  `toudocu serve`; для публикации — `toudocu build` и static HTTP hosting.
  Новая команда preview не добавлена.
- Portal, Editor и Changes получили единый compact workspace shell, project
  branding, навигацию и синхронные темы; CodeMirror меняет оформление без
  потери editor state, а responsive layout сохраняет локальную прокрутку
  рабочих областей без горизонтального overflow страницы.
- Editor и Changes HTTP API получили OpenAPI 3.1.0 sources of truth,
  declarative route parity и единый positional check; canonical `serve`
  показывает оба контракта через offline Swagger UI 5.32.12, а static и
  translation portals UI не получают.
- Changes API разрешает `HEAD` только для summary и возвращает schema-v1
  diagnostics envelope для всех API-ошибок без изменения успешных media types.
- Translation roots поддерживают полный файловый паритет с canonical docs,
  включая work items, notes и ideas, но остаются read-only: task workflow,
  scaffold и editor-запись отклоняются до использования переводного контекста.
- Самодокументация согласована с текущим состоянием репозитория: исправлены
  onboarding и scaffold-примеры README, восстановлено описание Markdown subset,
  а roadmap включает сценарий Documentation Changes.
- Первый стабильный релиз dependency-free Go CLI для проверки Markdown и
  построения автономного статического HTML-портала.
- Команды `check`, `build`, `search`, `changes` и `task changes` обеспечивают
  валидацию, поиск и Git-backed отчёты об изменениях в JSON, text и Markdown.
- `serve` предоставляет безопасный локальный workspace с live rebuild,
  предпросмотром Markdown, редактором и просмотром изменений; результат `build`
  остаётся статическим и read-only.
- Документная модель поддерживает архитектурные карты, модули, пользовательские
  сценарии, Mermaid-процессы, экраны, переходы, интерактивную карту и
  воспроизводимый портал с поиском, темами, branding и локализацией.
- Workflow рабочих задач включает typed scaffolds, readiness, контекст, проверку
  и traceability; все публичные JSON-отчёты используют schema v1.
- Skill `toudocu` добавляет явные agent-workflow для инициализации,
  проверки актуальности исходной документации и перевода locale tree.
- Релиз собирается для шести комбинаций OS/architecture, включая Windows ARM64,
  с единым quality gate, checksums, лицензией
  Apache-2.0 и notices для встроенных сторонних компонентов.
- POSIX- и PowerShell-installers автоматически выбирают релизный
  бинарник, проверяют SHA-256 и без `sudo` устанавливают или
  обновляют Toudocu в профиле пользователя.
