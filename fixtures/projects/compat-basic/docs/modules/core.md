<!-- toudocu
id: MOD-COMPAT
status: active
updated: 2026-09-01
-->

# Core module

The fixture module describes the compatibility surface.

## Behavior

- tables and task lists remain ordinary Markdown.

| input | output |
| --- | --- |
| query | result |
| query | result |

<!-- toudocu:section code-location -->
## Code location

`packages/core`

<!-- toudocu:section boundaries -->
## Boundaries

The fixture has no runtime dependencies.

<!-- toudocu:section business-rules -->
## Business rules

Input is preserved.

<!-- toudocu:section invariants -->
## Invariants

Reports have schema version 1.

<!-- toudocu:section stable-interfaces -->
## Stable interfaces

The CLI JSON output is the interface.

<!-- toudocu:section related-use-cases -->
## Related use cases

[Compatibility](../use-cases/compatibility.md)
