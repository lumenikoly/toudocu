<!-- toudocu
id: TASK-COMPAT-002
status: draft
taskType: maintenance
priority: low
updated: 2026-09-01
-->

# TASK-COMPAT-002: Keep the baseline small

<!-- toudocu:section result -->
## Result

The baseline stays representative.

<!-- toudocu:section behavior-change -->
## Behavior change

### Before

The baseline was undocumented.

### After

The baseline is documented.

<!-- toudocu:section scope -->
## Scope

- `fixtures`

<!-- toudocu:section out-of-scope -->
## Out of scope

Large synthetic projects.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [ ] `AC-01` The fixture remains readable.

<!-- toudocu:section plan -->
## Plan

1. Keep one representative case.

<!-- toudocu:section verification -->
## Verification

- `AC-01` -> `go version`

<!-- toudocu:section documentation-impact -->
## Documentation impact

Update the fixture if the CLI contract changes.
