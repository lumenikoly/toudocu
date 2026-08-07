# FLOW-DOCS-SERVE: Viewing the Portal Locally

- Identifier: FLOW-DOCS-SERVE
- Scenario: UC-DOCS-03
- Module: MOD-SITE
- Last updated: 2026-08-06

The diagram visualizes the lifecycle of the `serve` command. Network
restrictions, error scenarios, and postconditions are defined by
[UC-DOCS-03](../use-cases/serve-portal.md).

## Process

```mermaid
flowchart TD
    Start["docu-docu serve"] --> Build["Perform the initial build"]
    Build --> Built{"Did the build succeed?"}
    Built -->|No| Stop["Return code 1 and do not start the server"]
    Built -->|Yes| Listen["Listen on the specified address"]
    Listen --> Watch["Start the workspace watcher"]
    Watch --> Request["Receive an HTTP request, browser action or external change"]
    Request --> Locale{"Locale route?"}
    Locale -->|Yes| LocaleSnapshot["Serve a read-only locale snapshot"]
    LocaleSnapshot --> Request
    Locale -->|No| APIDocs{"API docs?"}
    APIDocs -->|Yes| Swagger["Serve vendored Swagger UI and same-origin specs"]
    Swagger --> Request
    APIDocs -->|No| Roadmap{"Roadmap add?"}
    Roadmap -->|Yes| RoadmapGuard["Check stage, DLV ID, text, origin, action and digest"]
    RoadmapGuard --> RoadmapAccepted{"Is the write allowed?"}
    RoadmapAccepted -->|No| APIError
    RoadmapAccepted -->|Yes| Atomic
    Roadmap -->|No| Editor{"Editor save or create?"}
    Editor -->|Yes| Guard["Check origin, action, path and limits; for save, check digest"]
    Guard --> Accepted{"Is the write allowed?"}
    Accepted -->|No| APIError["Return a JSON error without changing the file"]
    Accepted -->|Yes| Atomic["Atomically write or create the source"]
    Atomic --> Rebuild["Rebuild model, HTML, search and diagnostics"]
    Rebuild --> Publish["Return revision and rebuild result"]
    Publish --> Request
    APIError --> Request
    Editor -->|No| External{"Did the workspace fingerprint change?"}
    External -->|Yes| Stable["Wait for a stable fingerprint for 200 ms"]
    Stable --> Rebuild
    External -->|No| Manual{"Was a manual rebuild requested?"}
    Manual -->|Yes| ManualRebuild["Rebuild model, HTML and search"]
    ManualRebuild --> ManualResult{"Did the rebuild succeed?"}
    ManualResult -->|No| ManualError["Show the error and allow a retry"]
    ManualResult -->|Yes| Reload["Reload the current page"]
    Reload --> Request
    ManualError --> Request
    Manual -->|No| Navigate{"Canonical HTML navigation?"}
    Navigate -->|No| OtherRoute["Pass navigation to the browser or a separate route handler"]
    Navigate -->|Yes| Prefetch["Request the target HTML"]
    Prefetch --> StaticSoft["Serve the latest successful snapshot"]
    StaticSoft --> Compatible{"Is the HTML compatible and the revision equal?"}
    Compatible -->|Yes| Swap["Replace the layout and restore history, anchor and scroll"]
    Compatible -->|No| Full["Perform full canonical navigation"]
    Swap --> Request
    Full --> Static["Serve the latest successful snapshot"]
    Static --> Request
    Request -->|Ctrl+C| Finish["Stop the server and release the port"]
```

## Process boundaries

- Ordinary routes serve output; the editor API is limited to workspace files
  inside docs root and provides no access to the rest of the repository.
- Loopback is used by default; access through `0.0.0.0` is enabled explicitly.
- A manual rebuild updates the model, HTML, and search but neither closes the
  listener nor changes its address.
- HTTP navigation never starts a rebuild. With configured translations, the
  watcher rebuilds only the root that changed; the locale mount remains
  read-only and receives no editor, changes, or canonical API.
- Soft navigation works only among canonical HTML pages of the current
  revision. Editor, changes, API, locale, and external routes, as well as any
  failed check, use an ordinary full load.
- The search index loads on first use of search, and Mermaid loads when a
  diagram approaches the viewport; loaded runtimes persist across soft
  navigations.
- Editor, CodeMirror, API, polling, and manual rebuild exist only in `serve`;
  static build contains none of their markup, endpoints, or assets.
- On the roadmap, canonical `serve` adds only a new unfinished `DLV-*` to an
  existing stage; a CAS conflict preserves the browser form and does not overwrite.
- API docs exist only in canonical `serve`, load no CDN, and allow Try it out
  only for `GET`/`HEAD`; static and locale portals do not contain them.
- A rebuild failure does not stop an already running server.

## Related documents

- [UC-DOCS-03: View documentation on a local server](../use-cases/serve-portal.md)
- [FLOW-DOCS-BUILD: Building a static HTTP portal](FLOW-DOCS-BUILD.md)
- [MOD-SITE: Static portal](../modules/site.md)
- [CLI contract](../contracts/cli.md)
- [Editor API HTTP contract](../contracts/editor-http.md)
