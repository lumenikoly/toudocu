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

`appearance.js` and `portal.js` are used by both static and `serve` portals.
`appearance.js` loads before CSS so the saved theme is already active in the
first frame. `serve.js`, `editor.js`, `changes.js`, the roadmap dialog,
CodeMirror, and Swagger UI are available only in `serve`.

Project modeling, document classification, path guards, semantic diff, and
decisions about command execution remain in Go.

All Changes editors use one-based Unicode coordinates. Syntax highlighting is
pinned for Go, Java, JavaScript, JSX, TypeScript, and TSX. Other valid UTF-8
files appear as plain text. Go validates the path, selected text, context, size
limits, and anchor relocation.

## Related documents

- [Go/frontend boundary](../architecture/frontend-runtime-boundary.md)
- [MOD-SITE](../modules/site.md)
- [Testing changes](testing.md)
