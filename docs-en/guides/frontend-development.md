# Frontend development

Frontend source lives in `web/`; Node.js is only a developer build/test
toolchain. Ordinary users and `go build ./...` use the committed assets from
`internal/site/assets/generated/`.

```bash
make web
make web-check
make test
make build
```

The frontend-only loop inside `web/` is:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
```

It does not replace Go vet/tests/race, binary builds, or generated-asset drift
checks performed by the corresponding Make targets.

TypeScript runs in strict mode and esbuild performs the build. The generated
manifest and assets are deterministic: timestamps and random values are
forbidden. After changing frontend source, commit the rebuilt
`internal/site/assets/generated/`; CI repeats the build and fails on drift.

`appearance.js` is available in both static and serve runtimes and is loaded as
a normal blocking script before CSS so the saved theme applies in the first
frame. `portal.js` is available in both static and serve runtimes. `serve.js`,
`editor.js`, `changes.js`, CodeMirror, and Swagger UI are serve-only. Project
logic, classification, path guards, semantic diff, and verification must not be
moved to TypeScript.

## Related documents

- [Go/frontend boundary](../architecture/frontend-runtime-boundary.md)
- [MOD-SITE](../modules/site.md)
- [Testing changes](testing.md)
