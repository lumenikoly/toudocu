# FLOW-DOCS-SERVE: Local portal browsing

- Identifier: FLOW-DOCS-SERVE
- Script: UC-DOCS-03
- Module: MOD-SITE
- Last updated: 2026-08-04

The diagram visualizes the life cycle of the `serve` command. Network restrictions,
erroneous scenarios and postconditions are determined
[UC-DOCS-03](../use-cases/serve-portal.md).

## Process

```mermaid
flowchart TD
    Start["docu-docu serve"] --> Build["Perform initial build"]
    Build --> Built{"Is the build successful?"}
    Built -->|No| Stop["Return code 1 and do not start the server"]
    Built -->|Yes| Listen["Listen to the specified address"]
    Listen --> Watch["Launch watcher workspace"]
    Watch --> Request["Receive an HTTP request, browser action or external change"]
    Request --> Locale{"Locale route?"}
    Locale -->|Yes| LocalSnapshot["Отдать read-only locale snapshot"]
    LocalSnapshot --> Request
    Locale -->|No| Editor{"Editor save или create?"}
    Editor -->|Yes| Guard["Проверить origin, action, path и limits; для save — digest"]
    Guard --> Accepted{"Is the recording allowed?"}
    Accepted -->|No| APIError["Return JSON error without changing the file"]
    Accepted -->|Yes| Atomic["Atomically write or create source"]
    Atomic --> Rebuild["Rebuild model, HTML, search and diagnostics"]
    Rebuild --> Publish["Return revision and rebuild result"]
    Publish --> Request
    APIError --> Request
    Editor -->|No| External{"Has your workspace fingerprint changed?"}
    External -->|Yes| Stable["Wait for a stable fingerprint 200 ms"]
    Stable --> Rebuild
    External -->|No| Manual{"Manual rebuild requested?"}
    Manual -->|Yes| ManualRebuild["Rebuild model, HTML and search"]
    ManualRebuild --> ManualResult{"Is the rebuild successful?"}
    ManualResult -->|No| ManualError["Show error and allow retry"]
    ManualResult -->|Yes| Reload["Reload current page"]
    Reload --> Request
    ManualError --> Request
    Manual -->|No| Navigate{"Canonical HTML transition?"}
    Navigate -->|No| OtherRoute["Pass the transition to the browser or a separate route handler"]
    Navigate -->|Yes| Prefetch["Request target HTML"]
    Prefetch --> StaticSoft["Give the last successful snapshot"]
    StaticSoft --> Compatible{"Is HTML compatible and revision the same?"}
    Compatible -->|Yes| Swap["Replace layout and restore history, anchor, scroll"]
    Compatible -->|No| Full["Perform full canonical navigation"]
    Swap --> Request
    Full --> Static["Give the last successful snapshot"]
    Static --> Request
    Request -->|Ctrl+C| Finish["Stop the server and release the port"]
```

## Process boundaries

- Regular routes distribute output; editor API is limited to workspace files inside
  docs root and does not provide access to the rest of the repository.
- The default is loopback; access via `0.0.0.0` is explicitly enabled.
- Manual rebuild updates the model, HTML and search, but does not close the listener or
  changes his address.
- HTTP navigation never triggers rebuild. With configured translations
  watcher rebuilds only the changed root; locale mount remains read-only
  and does not receive editor, changes or canonical API.
- Soft navigation only works between canonical HTML pages of the current one
  revision. Editor, changes, API, locale and external routes, as well as any failure
  checks use normal full load.
- Search index is loaded the first time you access the search, Mermaid - when
  bringing the diagram closer to the viewport; loaded runtimes are saved between
  soft transitions.
- Editor, CodeMirror, API, polling and manual rebuilding exist only in
  `serve`; the static portal via `file://` does not contain their markup or assets.
- A rebuild error does not stop an already running server.

## Related documents

- [UC-DOCS-03: View documentation on local server](../use-cases/serve-portal.md)
- [FLOW-DOCS-BUILD: Building a standalone portal](FLOW-DOCS-BUILD.md)
- [MOD-SITE: Static portal](../modules/site.md)
- [CLI contract](../contracts/cli.md)
- [HTTP contract editor API](../contracts/editor-http.md)
