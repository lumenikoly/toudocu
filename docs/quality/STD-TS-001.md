<!-- toudocu
id: STD-TS-001
status: active
scope: TypeScript, React, Node.js-код и тесты репозитория
updated: 2026-09-20
-->

# STD-TS-001: Качество TypeScript-кода

Стандарт сохраняет runtime Toudocu небольшим, предсказуемым и безопасным.

<!-- toudocu:section rules -->
## Правила

1. Production-код использует ESM и строгий TypeScript с
   `noUncheckedIndexedAccess` и `exactOptionalPropertyTypes`.
2. Неизвестные данные проверяются на границе до передачи в core и application.
3. Core не импортирует React, HTTP или Node.js-адаптеры; UI не вычисляет
   доменную готовность задач.
4. Новое правило проверки или исправление безопасности сопровождается тестом.
5. Файловые пути нормализуются и проверяются до чтения, записи или очистки.
6. Операции с процессами учитывают `AbortSignal` и освобождают ресурсы.
7. Обычные `check`, `build`, `serve` и `task context` не выполняют команды из
   рабочих задач.

<!-- toudocu:section automated-checks -->
## Автоматические проверки

- `pnpm format`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm test:browser` для браузерных изменений;
- `pnpm build` и `pnpm check` перед завершением изменения.

Команды запускает разработчик, рабочая задача или доверенный CI.
