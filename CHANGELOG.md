# Changelog

## 0.0.1

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
- Skill `docu-docu` добавляет явные agent-workflow для инициализации,
  проверки актуальности исходной документации и перевода locale tree.
- Релиз собирается для пяти платформ с единым quality gate, checksums, лицензией
  Apache-2.0 и notices для встроенных сторонних компонентов.
- POSIX- и PowerShell-installers автоматически выбирают релизный
  бинарник, проверяют SHA-256 и без `sudo` устанавливают или
  обновляют Docu-docu в профиле пользователя.
