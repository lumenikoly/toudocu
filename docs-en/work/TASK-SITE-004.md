# TASK-SITE-004: Add a roadmap deliverable through serve

- Status: Done
- Type: Feature
- Priority: Medium
- Module: MOD-SITE
- Use case: UC-DOCS-03
- Flow: FLOW-DOCS-SERVE
- Screens: SC-SITE-DOCUMENT
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Toudocu Team
- Last updated: 2026-08-06

## Result

On the `roadmap.md` page in canonical `toudocu serve`, the user adds a new
unfinished `DLV-*` to an existing stage through an accessible dialog without
editing Markdown manually. Static builds and translation portals remain read-only.

## Behavior change

### Before

The roadmap displays computed progress, but a new deliverable can be added only
through the general editor or an external Markdown change.

### After

A serve-only action obtains current stages, digest, and the suggested
`DLV-ROADMAP-NNN`, validates a one-line deliverable on the server, atomically
inserts the checklist item in the selected H2 stage, and synchronously rebuilds
the portal. A CAS conflict does not overwrite the file and preserves entered form values.

## Scope

- `internal/app/` — roadmap Editor API, safe insertion, CAS, and renderer control;
- `web/src/` and `web/tests/` — serve-only dialog, lifecycle, styles, and browser QA;
- `internal/site/assets/generated/` — derived serve assets;
- `docs/contracts/`, `docs/flows/`, `docs/guides/`, `docs/modules/`,
  `docs/screens/`, `docs/use-cases/`, `docs/roadmap.md`, and this work item.

## Out of scope

- creating stages, `UC-*`, or `CON-*`, and automatically creating `TASK-*`;
- editing, completing, or deleting existing roadmap items;
- changing `ProjectReport`, bootstrap schema, or the public Go API;
- write capabilities in static builds, translation portals, or direct translation serve.

## Acceptance criteria

- [x] `AC-01` GET returns revision, path, digest, the suggested next
  `DLV-ROADMAP-NNN`, and existing stages with anchor, title, status, and item
  count; a missing roadmap has a stable error.
- [x] `AC-02` POST accepts only same-origin JSON with action `roadmap-add`,
  normalizes a valid unique `DLV-*`, and rejects unknown fields, empty or
  multiline text, a second roadmap ID, duplicate, missing stage, and stale digest with stable errors.
- [x] `AC-03` A successful write preserves line endings and surrounding
  Markdown, inserts the deliverable after the final checklist item or before
  the next H2 of an empty stage, uses atomic replace, and rebuilds synchronously.
- [x] `AC-04` The dialog supports keyboard/Escape/focus, server-provided stages,
  an editable suggested ID, loading/error/success states, and mobile width; on
  conflict it preserves the form and refreshes stages, digest, and suggestion.
- [x] `AC-05` Static builds and locale portals contain no button, endpoint, or
  serve-only code; the generic Editor and public schemas remain intact.
- [x] `AC-06` Editor OpenAPI, behavioral contract, local serve guide,
  FLOW-DOCS-SERVE, MOD-SITE, UC-DOCS-03, SC-SITE-DOCUMENT, and the roadmap agree
  and pass semantic review and ordinary/strict structural checks.

## Plan

- [x] Add roadmap server state, validation, guarded POST, and atomic CAS insertion.
- [x] Add the serve-only dialog and reinitialize it after soft navigation.
- [x] Cover backend, frontend, and browser behavior, including conflict and mobile.
- [x] Update canonical documentation sources and complete semantic gates.
- [x] Run full repository verification and complete the roadmap item.

## Verification

- `AC-01` → `go test ./internal/app -run TestEditorRoadmap`
- `AC-02` → `go test ./internal/app -run TestEditorRoadmap`
- `AC-03` → `go test ./internal/app -run TestEditorRoadmap`
- `AC-04` → `npm --prefix web run typecheck && npm --prefix web run test:browser`
- `AC-05` → `go test ./internal/app -run 'TestRoadmapAddControlIsServeOnly|TestDocumentationServerLocalePortalsAreReadOnlyAndMatched' && npm --prefix web test`
- `AC-06` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `ALL` → `make check && make browser-test`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

## Documentation impact

Editor OpenAPI and its behavioral contract, FLOW-DOCS-SERVE, the local-workflow
guide, MOD-SITE, UC-DOCS-03, SC-SITE-DOCUMENT, and the roadmap are updated. No
new screen or transition is created: the dialog is a state of the roadmap page.
