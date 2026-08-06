# Publishing the static portal

`docu-docu build` creates read-only output that requires no Docu-docu backend,
Node.js, database, or CDN after generation.

```bash
docu-docu build ./docs --output ./site --clean
```

Upload the entire `site/` directory to ordinary HTTP(S) static hosting: nginx,
GitHub Pages, S3-compatible storage, or a corporate server. Do not select only
the HTML: `assets/`, `data/`, `report.json`, and local project assets are part
of the result.

The portal uses relative document links and relative asset/data bases supplied
by Go, so the same output can be hosted at the root or below a nested path such
as `/docs/` or `/projects/my-project/` without mandatory `baseURL`
configuration.

Static output is a potentially public artifact. The generator does not include
absolute filesystem paths, server configuration, editor metadata, credentials,
or data outside the permitted documentation model.

For local viewing, use `docu-docu serve` and the
[local workflow](local-workflow.md).
Opening `index.html` directly by double-clicking is not a supported publishing
or verification method.

## Verifying a deployment

1. Serve the entire output over HTTP.
2. Open the home page and a nested document page.
3. Verify that `portal.css`, `portal.js`, and `data/search-index.json` load.
4. Verify search, theme, and the Mermaid fallback.
5. Repeat the smoke test under a nested URL path.

## Related documents

- [UC-DOCS-01: Build a static HTTP portal](../use-cases/build-portal.md)
- [Go/frontend boundary](../architecture/frontend-runtime-boundary.md)
- [CLI contract](../contracts/cli.md)
