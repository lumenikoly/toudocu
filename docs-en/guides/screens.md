# Screen map and playable use cases

Toudocu builds a map, catalog, step-by-step scenarios, and traceability from
`screens/SC-*.md` documents. A separate `screens/map.md` is not used.

The map page can be explicitly enabled or disabled:

```bash
toudocu build ./docs --screen-map
toudocu build ./docs --no-screen-map
```

When the overall map is disabled, the catalog, use-case pages with step mode,
and the machine model remain available.

In portal navigation, "Screens" opens the catalog and contains individual
screen documents. When the overall map is enabled, it is available as a
separate child item; `--no-screen-map` removes that item and page without
changing the catalog. `UC-*` entries live in the separate "Use cases" section,
while `FLOW-*` entries live under "Processes". The screen map and step mode for
a selected scenario are embedded in its canonical
`/use-cases/UC-*.html` page.

## Screen document

```md
<!-- toudocu
id: SC-AUTH-LOGIN
screenKind: screen
module: MOD-AUTH
status: in-progress
route: /login
preview: ../assets/screens/login.webp
parentScreen: SC-PUBLIC-HOME
-->

# SC-AUTH-LOGIN: Sign in

## States

<!-- toudocu:table states columns=id,title,preview -->
| ID | Name | Preview |
|---|---|---|
| DEFAULT | Initial | `../assets/screens/login.webp` |
| INVALID-CREDENTIALS | Invalid credentials | — |

## Transitions

<!-- toudocu:table transitions columns=id,useCase,action,condition,target,state,error,kind -->
| ID | Use case | Action | Condition | Result | State | Error | Type |
|---|---|---|---|---|---|---|---|
| TR-AUTH-001 | UC-AUTH-01 | Sign in | Success | SC-ACCOUNT-HOME | DEFAULT | — | navigation |
| TR-AUTH-002 | UC-AUTH-01 | Sign in | Invalid credentials | SC-AUTH-LOGIN | INVALID-CREDENTIALS | INVALID_CREDENTIALS | error |
```

Canonical `id`, `screenKind`, `module`, and `status` fields are required.
Supported screen kinds are `screen`, `page`, `modal`, `panel`, `external`, and
`system`. `DEFAULT` exists implicitly. Every transition references one existing
`UC-*`; global transitions without a use case are unsupported. `parentScreen`
defines the sitemap, not user-flow order.

A transition requires an ID, action, condition, and result. State, error,
message, contract, and type may also be specified:

| Type | Map rendering |
|---|---|
| `navigation` | solid directed line |
| `error` | dotted line |
| `redirect` | dashed line |
| `return` | reverse-curved line |
| `external` | double line |

Routes automatically use available corridors between cards. A transition label
is positioned separately from its line, does not cross cards, and shows the
action and condition in at most two lines. The full text is always available
when the transition is selected in the side panel.

A transition to the same screen is allowed only with a state, error, or message
that explains the observable change.

## Use case

A screen scenario defines:

```md
startScreen: SC-AUTH-LOGIN
terminalScreens: SC-ACCOUNT-HOME
allowCycle: true
```

Toudocu adds transitions for the selected `UC-*`, then calculates reachable
screens, dead ends, cycles, and paths to terminal screens.

A reachable nonterminal screen must have an outgoing transition. A cycle with
no exit is an error unless the use case explicitly contains `allowCycle: true`.

## Map

In `serve`, the changes section adds a change overlay. New SC/TR entries have a
green outline or line and the `added` label; changed entries have a yellow
`modified` label; removed old-side ghost elements use a red dotted line and the
`removed` label. State is never conveyed by color alone. The
module/use-case/status/changed-only filters operate on the combined old/new
model; selecting an element opens its semantic diff. JSON is available at
`/_toudocu/api/changes/screen-map`.

A card shows a preview or placeholder, ID, name, route, status, module, and the
number of incoming and outgoing transitions. Available modes include:

- the overall map grouped by module;
- a selected-module filter;
- a selected-use-case filter;
- status filtering and search;
- an incomplete-screens-only mode;
- a sitemap based on parent relationships.

A click selects a screen and opens the side panel. A double click opens its
document. A relationship can also be selected: the panel shows its action,
condition, source, target, use case, state, and error.

Mouse and touch controls:

- wheel — zoom relative to the pointer;
- drag on empty space — pan;
- buttons — zoom in, zoom out, fit, reset, and fullscreen.

`Ctrl`/`Cmd` plus the wheel remains browser zoom. `+`, `-`, `0`, `Esc`, and
`Enter` work from the keyboard.

## Step-by-step playback

The viewer starts at the use case's start screen. Available actions come from
transitions for the selected scenario. Each step stores
the previous screen and state in page memory.

- `Back` restores the previous step;
- `Start over` clears history;
- an error or message appears next to the preview;
- a state selects its own preview when declared;
- a terminal screen shows "Start over", "Show map", and "Open use case".

History is not preserved after a page reload. The viewer simulates the
documentation and does not make real API requests.

## Errors and previews

Error codes are declared in a contract document:

```md
## Errors

| ID | Message |
|---|---|
| INVALID_CREDENTIALS | The email or password is incorrect. |
```

A preview may be PNG, JPG, JPEG, WEBP, AVIF, or GIF inside the repository root.
A missing file produces a placeholder and warning. SVG, HTML, XML, JavaScript,
absolute paths, traversal, and symlinks are blocked.

## Hotspots

Optional `screens/hotspots.json` stores percentage coordinates:

```json
{
  "SC-AUTH-LOGIN": [
    {
      "transition": "TR-AUTH-001",
      "x": 31.5,
      "y": 59.2,
      "width": 37,
      "height": 8.4
    }
  ]
}
```

An invalid area is excluded from HTML, but the flow action list continues to
work. A valid area always remains accessible as a button: when hidden, it
appears on hover or keyboard focus, while the "Show interactive areas" toggle
makes every hotspot permanently visible.

Coordinates and dimensions must be positive, within `0–100`, and keep the
rectangle inside the preview. A transition is not duplicated on one screen
without an explicit `allowDuplicate`.

## Traceability

A task declares affected transitions, a symbolic relationship, and a command
separately:

```md
- Transitions: TR-AUTH-001

## Verification

- `AC-01` → `TR-AUTH-001` → `TestSuccessfulLogin`
- `AC-01` → `go test ./... -run TestSuccessfulLogin`
```

The generated portal contains `/screens/index.html`, the catalog,
`/use-cases/UC-*.html` with `#overview`, `#map`, `#play`, and `#links` tabs,
`/traceability.html`, and the top-level screen model in `report.json` schema v1.
All pages work on ordinary HTTP(S) static hosting without a Go backend.

## What the CLI checks

For screens, the CLI checks ID, type, status, module existence, route
uniqueness, preview, and path safety. For transitions, it checks ID, required
fields, target, use case, state, error definition, and meaningful
self-transitions.

For a flow, it checks start and terminal screens, reachability, dead ends,
branches, cycles, and exits from error states. For hotspots, it checks
references, coordinates, boundaries, and duplication. Work items are checked
for existing `SC-*`, `TR-*`, and `AC → TR → verification` relationships.

A screen-graph error blocks only the map, while an error in an individual flow
blocks only its playback. Other documents and catalogs continue to be
generated. A missing preview produces a warning and placeholder but does not
stop the build.
