# Architecture

- Document type: Architecture Overview

Docu-docu - local dependency-free Go runtime between source directory
documentation and consumers of a proven model: Go-code through a public façade,
automation via CLI/JSON and standalone HTML portal reader.
Optional `serve` adds a local HTTP/editor runtime; database and
external runtime is not included in the system boundary.

## System boundary

A developer, library user, agent or CI submits a Docu-docu catalog
documentation and explicitly selected repository root. Docu-docu reads Markdown and
local assets, checks declared connections and either returns diagnostics,
or builds derived HTML/JSON files. In `build` the browser only opens
ready-made read-only portal. In `serve` it can send a limited
workspace record, after which the Go process builds the model again. Only separate
explicit task check mode can run repository commands.

## Map of architectural issues

- [Where is the Docu-docu system boundary and who interacts with it?](system-boundary.md)
- [How do runtime components share responsibilities?](runtime-components.md)
- [Where are the boundaries of trust?](trust-boundaries.md)
- [How are errors in documentation and running checks isolated?](failure-isolation.md)
- [How do Git states turn into consistent change set documentation?](documentation-changes.md)
