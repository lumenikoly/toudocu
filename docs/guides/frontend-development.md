# Разработка интерфейса

React-приложение находится в `apps/web`, общие view contracts — в
`packages/contracts`, а server-side renderer — в `apps/web/renderer`. Vite собирает
браузерные ресурсы; React Router обслуживает статические страницы и локальный
workspace одним набором компонентов.

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm --filter @toudocu/web-app test
pnpm --filter @toudocu/web-app test:browser
pnpm build
```

Доменную семантику следует менять в core/application, а не восстанавливать в
React. Компонент получает `PageViewV1` и capabilities, сервер повторно
проверяет все изменяющие действия. Основной текст статического портала должен
оставаться доступным без JavaScript.

Agent Console размещена вне route outlet. Provider session и PTY независимы;
xterm загружается только после открытия Project Terminal. Любой effect,
WebSocket, subscription или terminal instance освобождается при размонтировании.
