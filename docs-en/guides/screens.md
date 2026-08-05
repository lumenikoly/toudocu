# Map of screens and playable user scenarios

Docu-docu builds map, directory, step-by-step scripts and traceability from documents
`screens/SC-*.md`. A separate `screens/map.md` is not used.

The map page can be explicitly enabled or disabled:

```bash
docu-docu build ./docs --screen-map
docu-docu build ./docs --no-screen-map
```

When the general map is disabled, the directory, use case pages with step-by-step mode and
the machine model is saved.

In the portal navigation, the “Screens” section opens the catalog and contains documents
separate screens. When a shared map is enabled, it is available to individual child maps.
point; `--no-screen-map` removes this item and page without changing the directory.
`UC-*` are located in a separate section “User Scripts”, and
`FLOW-*` - in “Processes”. Screen map and step-by-step mode of the selected scenario
embedded in the canonical `/use-cases/UC-*.html` page.

## Screen document

```md
# SC-AUTH-LOGIN: Вход

- Идентификатор: SC-AUTH-LOGIN
- Тип: Экран
- Модуль: MOD-AUTH
- Статус: В работе
- Маршрут: `/login`
- Превью: `../assets/screens/login.webp`
- Родительский экран: SC-PUBLIC-HOME

## Состояния

| ID | Название | Превью |
|---|---|---|
| DEFAULT | Исходное | `../assets/screens/login.webp` |
| INVALID-CREDENTIALS | Неверные данные | — |

## Переходы

| ID | Сценарий | Действие | Условие | Результат | Состояние | Ошибка |
|---|---|---|---|---|---|---|
| TR-AUTH-001 | UC-AUTH-01 | Войти | Успех | SC-ACCOUNT-HOME | DEFAULT | — |
| TR-AUTH-002 | UC-AUTH-01 | Войти | Неверные данные | SC-AUTH-LOGIN | INVALID-CREDENTIALS | INVALID_CREDENTIALS |
```

ID, type, module and status are required. Supported are `Экран`, `Страница`,
`Модальное окно`, `Панель`, `Внешняя страница` and `Системное состояние`.
`DEFAULT` exists implicitly. The unscripted transition is global and
participates in all reachable playable scenarios. `Родительский экран` defines
sitemap, not user flow order.

A transition requires an ID, action, condition, and result. Additionally you can
indicate the status, error, message, contract and type:

| Type | Mapping |
|---|---|
| `navigation` | solid directional line |
| `error` | dotted line |
| `redirect` | dashed line |
| `return` | reverse curved line |
| `external` | double line |

Routes automatically use free corridors between cards.
The transition signature is placed separately from the line, does not cross the cards and
shows the action and condition in a maximum of two lines. Full text always
available when selecting a transition in the sidebar.

Going to the same screen is only allowed with a status, error or message,
which explains the observed change.

## Use case

The screen script specifies:

```md
- Начальный экран: SC-AUTH-LOGIN
- Конечные экраны: SC-ACCOUNT-HOME
- Разрешить цикл: Да
```

Docu-docu adds transitions of the selected `UC-*` and global transitions, calculates
reachable screens, dead ends, loops and paths to terminal screens.

A non-finite reachable screen must have an output. A cycle without exit is considered
an error if the use case does not explicitly contain `Разрешить цикл: Да`.

## Map

The changes section adds a change overlay to `serve`. New SC/TR have green
contour or line and label `added`, changed - yellow `modified`, deleted
old-side ghost elements - red dotted line and `removed`. Status is not transferred
only in color. Filters module/use case/status/changed-only apply to
combined old/new model; selecting an element opens semantic diff. JSON
available via `/_docu-docu/api/changes/screen-map`.

The card shows preview or placeholder, ID, name, route, status,
module and number of incoming and outgoing transitions. Available:

- a common map with groups of modules;
- filter of the selected module;
- filter of the selected use case;
- status filter and search;
- mode of only unfinished screens;
- sitemap for parental connections.

Click to select the screen and open the sidebar. Double click opens the document.
The connection can also be selected: the panel will show action, condition, source, target,
use case, status and error.

Mouse and touch controls:

- wheel — zoom relative to the pointer;
- drag on free space - pan;
- buttons - zoom in, zoom out, fit, reset and fullscreen.

`Ctrl`/`Cmd` along with the wheel remains browser zoom. They work from the keyboard
`+`, `-`, `0`, `Esc` and `Enter`.

## Walkthrough

The Viewer starts with the initial use case screen. Available actions are formed from
transitions of the selected scenario and global transitions. Each step saves
previous screen and page memory status.

- `Назад` restores the previous step;
- `Сначала` clears history;
- an error or message is displayed next to the preview;
- the state selects its own preview, if it is declared;
- terminal screen shows "Start over", "Show map" and
  “Open use case.”

The history is not saved after reloading the page. Viewer is a simulation
documentation and does not execute actual API requests.

## Bugs and previews

Error codes are declared in the contract document:

```md
## Ошибки

| ID | Сообщение |
|---|---|
| INVALID_CREDENTIALS | Неверный email или пароль. |
```

Preview allows PNG, JPG, JPEG, WEBP, AVIF and GIF inside the repository root.
The missing file gives placeholder and warning. SVG, HTML, XML, JavaScript,
absolute path, traversal and symlink are blocked.

## Hotspots

The optional `screens/hotspots.json` stores percentage coordinates:

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

The invalid zone is excluded from the HTML, but the list of flow actions continues
work. The valid zone always remains an accessible button: in hidden mode it
appears on hover or keyboard focus, and the Show
interactive zones" makes all hotspots constantly visible.

Coordinates and dimensions must be positive, in the range `0–100` and
do not extend the rectangle beyond the boundaries of preview. One transition is not duplicated on
screen without explicit `allowDuplicate`.

## Traceability

The task declares the affected transitions, the symbolic link, and a separate command:

```md
- Переходы: TR-AUTH-001

## Проверка

- `AC-01` → `TR-AUTH-001` → `TestSuccessfulLogin`
- `AC-01` → `go test ./... -run TestSuccessfulLogin`
```

Generated portal contains `/screens/index.html`, directory,
`/use-cases/UC-*.html` with tabs `#overview`, `#map`, `#play`, `#links`,
`/traceability.html` and top-level screen model in `report.json` schema v1. All
pages work via `file://`.

## What the CLI checks

For screens, ID, type, status, module existence, uniqueness are checked
route, preview and route safety. For transitions - ID, required fields,
target, use case, state, error definition and meaningfulness of self-transition.

For flow, start and terminal screens, reachability, dead ends, branches,
cycles and exits from erroneous states. For hotspots, links are checked,
coordinates, boundaries and duplication. Work items are checked for existing ones
`SC-*`, `TR-*` and `AC → TR → verification` relationships.

A screen graph error only blocks the card, and an individual flow error only blocks
its launch. The remaining documents and catalogs continue to be generated. Absence
preview creates a warning and placeholder, but does not stop the build.