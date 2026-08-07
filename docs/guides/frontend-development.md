# Разработка frontend

Frontend source находится в `web/`; Node.js является только build/test toolchain
для разработчика. Обычный пользователь и `go build ./...` используют
закоммиченные assets из `internal/site/assets/generated/`.

```bash
make web
make web-check
make test
make build
```

Frontend-only цикл внутри `web/`:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
```

Он не заменяет Go vet/tests/race, сборку бинарника и проверку расхождений
generated assets, которые выполняют соответствующие Make targets.

TypeScript работает в strict mode, сборка выполняется esbuild. Generated
manifest и assets детерминированы: timestamps и random values запрещены. После
изменения frontend source необходимо закоммитить пересобранный
`internal/site/assets/generated/`; CI повторит сборку и завершится ошибкой при
расхождении.

`appearance.js` доступен в static и serve runtime и подключается обычным
блокирующим script до CSS, чтобы сохранённая тема действовала уже в первом
кадре. `portal.js` доступен в static и serve runtime. `serve.js`, `editor.js`,
`changes.js`, roadmap dialog, CodeMirror и Swagger UI являются serve-only. Project logic,
classification, path guards, semantic diff и verification нельзя переносить в
TypeScript.

## Связанные документы

- [Граница Go/frontend](../architecture/frontend-runtime-boundary.md)
- [MOD-SITE](../modules/site.md)
- [Проверка изменений](testing.md)
