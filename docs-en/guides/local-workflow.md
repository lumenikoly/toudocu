# Working with the portal locally

Use the existing command for a local browser runtime:

```bash
toudocu serve ./docs
```

It builds the same Go project model and the same base portal, then adds live
rebuild, Editor, Changes, and offline API docs. Server-only UI is enabled by
explicit capabilities and accesses only same-origin endpoints on the current
listener.

By default, the listener is available at `http://127.0.0.1:8080`.
`--host 0.0.0.0` expands the trust boundary to the local network; built-in TLS
and authentication are not provided.

There is no separate preview command. To publish, run `toudocu build` and
place the output on [static HTTP hosting](deployment.md).

On the canonical portal's `roadmap.html` page, the “Add deliverable” button
opens a dialog for choosing an existing stage, entering the description, and
setting a `DLV-*` ID. The server suggests the next `DLV-ROADMAP-NNN`; after a
save, it rebuilds the model and returns the page to the selected stage. If the
roadmap changes externally, the entered fields remain in the form and no
automatic overwrite occurs.

This action is absent from `build` output, locale portals, and direct `serve`
of a translation root.

## Related documents

- [UC-DOCS-03: Local server](../use-cases/serve-portal.md)
- [Editor HTTP contract](../contracts/editor-http.md)
- [Changes HTTP contract](../contracts/changes-http.md)
